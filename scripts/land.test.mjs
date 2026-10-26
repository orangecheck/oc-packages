// scripts/land.sh against a scripted gh: a PR the queue has merged is reported
// merged even when one read shows it open and out of the queue, and a real drop
// still fails, with its reason. The same cases as oc-docs' copy of the script.
//
//   node --test scripts/land.test.mjs
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const SCRIPT = new URL('./land.sh', import.meta.url).pathname;

/** One read of the PR, as the script's jq turns it into a tab-separated line. */
const read = (state, inQueue, auto, entry = '-', merged = '-', head = 'h'.repeat(40)) =>
    [state, inQueue, auto, entry, 'SUCCESS', merged, head].join('\t');

/** Runs the script on PR 7 with gh answering `reads` in turn (the last repeats) and `compare` for main...head. */
function land(reads, compare = 'diverged', timeout = '30') {
    const dir = mkdtempSync(join(tmpdir(), 'land-'));
    writeFileSync(join(dir, 'reads'), reads.join('\n') + '\n');
    writeFileSync(join(dir, 'compare'), compare + '\n');
    const fake = join(dir, 'gh');
    writeFileSync(
        fake,
        `#!/usr/bin/env bash
case "$*" in
  *graphql*)
    n=$(cat "${dir}/n" 2>/dev/null || echo 0); n=$((n + 1)); echo "$n" > "${dir}/n"
    line=$(sed -n "\${n}p" "${dir}/reads"); [ -n "$line" ] || line=$(tail -n 1 "${dir}/reads")
    printf '%s\\n' "$line" ;;
  *compare*) cat "${dir}/compare" ;;
  *) exit 1 ;;
esac
`,
    );
    chmodSync(fake, 0o755);
    const r = spawnSync('bash', [SCRIPT], {
        env: { ...process.env, LAND_GH: fake, LAND_PR: '7', LAND_POLL: '0', LAND_TIMEOUT: timeout },
        encoding: 'utf8',
    });
    return { code: r.status, out: r.stdout + r.stderr };
}

test('reports merged when the PR reads open and out of the queue for a moment after it merged', () => {
    const r = land([
        read('OPEN', true, true, 'QUEUED'),
        read('OPEN', false, false),
        read('MERGED', false, false, '-', 'm'.repeat(40)),
    ]);
    assert.match(r.out, new RegExp(`land: merged; main is now ${'m'.repeat(40)} \\(PR #7\\)`));
    assert.equal(r.code, 0);
});

test('reports merged when main already holds the PR head, though the PR still reads open', () => {
    const r = land([read('OPEN', true, true, 'QUEUED'), read('OPEN', false, false)], 'behind');
    assert.match(r.out, /land: merged; main holds hhhh/);
    assert.match(r.out, /the PR's head \(PR #7\)/);
    assert.equal(r.code, 0);
});

test('fails a PR the queue really dropped, with the reason', () => {
    const r = land([read('OPEN', true, true, 'QUEUED'), read('OPEN', false, false)]);
    assert.match(r.out, /land: the queue dropped PR #7: its group run failed or main changed under it/);
    assert.equal(r.code, 1);
});

test('fails a dropped PR that main has not caught up with (compare reads "ahead")', () => {
    const r = land([read('OPEN', true, true, 'QUEUED'), read('OPEN', false, false)], 'ahead');
    assert.match(r.out, /land: the queue dropped PR #7/);
    assert.equal(r.code, 1);
});

test('re-reads before it reports a timeout', () => {
    assert.match(
        land([read('OPEN', true, true, 'QUEUED')], 'diverged', '0').out,
        /land: timed out waiting for the queue to merge PR #7/,
    );
    const merged = land(
        [read('OPEN', true, true, 'QUEUED'), read('MERGED', false, false, '-', 'm'.repeat(40))],
        'diverged',
        '0',
    );
    assert.equal(merged.code, 0);
});

test('fails a PR the queue cannot merge, unless a fresh read shows it merged', () => {
    assert.equal(land([read('OPEN', true, true, 'UNMERGEABLE')]).code, 1);
    const merged = land([read('OPEN', true, true, 'UNMERGEABLE'), read('MERGED', false, false, '-', 'm'.repeat(40))]);
    assert.equal(merged.code, 0);
});

test('fails a closed PR and a failed check at once', () => {
    assert.match(land([read('CLOSED', false, false)]).out, /land: PR #7 was closed/);
    const failed = land([['OPEN', 'true', 'true', 'QUEUED', 'FAILURE', '-', 'h'].join('\t')]);
    assert.match(failed.out, /a check failed on PR #7/);
    assert.equal(failed.code, 1);
});
