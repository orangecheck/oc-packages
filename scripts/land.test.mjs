// scripts/land.sh against a scripted gh: a PR the queue has merged is reported
// merged even when one read shows it open and out of the queue, and a real drop
// still fails, with its reason and the queue's. The same cases as oc-docs' copy of the script.
//
//   node --test scripts/land.test.mjs
import { spawnSync } from 'node:child_process';
import { chmodSync, existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';

import { useTmpRoot } from './test-tmp-root.mjs';

useTmpRoot(after);

const SCRIPT = new URL('./land.sh', import.meta.url).pathname;

/**
 * One read of the PR, as the script's jq turns it into a tab-separated line. `left` is the queue's reason
 * for its last removal of the PR, and `leftMain` the commit it names.
 */
const read = (state, inQueue, auto, entry = '-', merged = '-', head = 'h'.repeat(40), left = '-', leftMain = '-') =>
    [state, inQueue, auto, entry, 'SUCCESS', merged, head, left, leftMain].join('\t');

/**
 * Runs the script on PR 7 with gh answering `reads` in turn (the last repeats) and `compare` for head...main
 * (its status, then the first of main's commits with the head's tree, or -),
 * from `cwd`, a scratch checkout whose origin names the repository, so the test needs no checkout of its own.
 * Every gh call's arguments land in `calls`.
 */
function land(
    reads,
    compare = 'diverged\t-',
    timeout = '30',
    cwd = checkout('git@github.com:orangecheck/oc-packages.git'),
) {
    const dir = mkdtempSync(join(tmpdir(), 'land-'));
    writeFileSync(join(dir, 'reads'), reads.join('\n') + '\n');
    writeFileSync(join(dir, 'compare'), compare + '\n');
    const fake = join(dir, 'gh');
    writeFileSync(
        fake,
        `#!/usr/bin/env bash
printf '%s\\n' "$*" >> "${dir}/calls"
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
        cwd,
        env: { ...process.env, LAND_GH: fake, LAND_PR: '7', LAND_POLL: '0', LAND_TIMEOUT: timeout },
        encoding: 'utf8',
    });
    const calls = existsSync(join(dir, 'calls')) ? readFileSync(join(dir, 'calls'), 'utf8') : '';
    return { code: r.status, out: r.stdout + r.stderr, calls };
}

/** A git checkout whose origin is `url`. */
function checkout(url) {
    const dir = mkdtempSync(join(tmpdir(), 'land-origin-'));
    spawnSync('git', ['init', '-q', dir]);
    spawnSync('git', ['-C', dir, 'remote', 'add', 'origin', url]);
    return dir;
}

test('reports merged when the PR reads open and out of the queue for a moment after it merged', () => {
    const r = land([
        read('OPEN', true, true, 'QUEUED'),
        read('OPEN', false, false),
        read('MERGED', false, false, '-', 'm'.repeat(40)),
    ]);
    assert.match(r.out, new RegExp(`land: merged; main is now ${'m'.repeat(40)} \\(PR #7\\)`));
    assert.equal(r.code, 0);
    // One line per read, so a wait that stalls shows which field held it.
    const stamp = String.raw`land: \d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ PR #7`;
    assert.match(r.out, new RegExp(`${stamp} state=OPEN in_queue=true auto=true entry=QUEUED checks=SUCCESS removed=-\n`));
    assert.match(r.out, new RegExp(`${stamp} state=MERGED in_queue=false auto=false entry=- checks=SUCCESS removed=-\n`));
    assert.equal(r.out.match(/ PR #7 state=/g).length, r.calls.match(/graphql/g).length);
});

test('reports merged when main already holds the PR head, though the PR still reads open', () => {
    const r = land([read('OPEN', true, true, 'QUEUED'), read('OPEN', false, false)], 'ahead\t-');
    assert.match(r.out, /land: merged; main holds hhhh/);
    assert.match(r.out, /the PR's head \(PR #7\)/);
    assert.equal(r.code, 0);
});

/** A read of the PR, open, after the queue last removed it for `reason`, naming main's commit `main`. */
const leftQueue = (reason, main, inQueue = false) =>
    read('OPEN', inQueue, inQueue, inQueue ? 'QUEUED' : '-', '-', 'h'.repeat(40), reason, main);

test('reports merged when the queue says it removed the PR because it merged it, though the PR reads open', () => {
    // PR #510: the queue moved main and removed the PR at once; GitHub read it MERGED 105 s later.
    // Its record can follow the PR out of the queue by a second, so the read before a drop is not the last.
    const m = 'm'.repeat(40);
    const r = land([read('OPEN', true, true, 'QUEUED'), read('OPEN', false, false), leftQueue('merged', m)]);
    assert.match(r.out, new RegExp(`land: merged; main is now ${m} \\(PR #7\\)`));
    assert.equal(r.code, 0);
    assert.doesNotMatch(r.calls, /compare/);
    // At once, on the first read that carries the queue's record, even while auto-merge still reads on.
    const autoOn = read('OPEN', false, true, '-', '-', 'h'.repeat(40), 'merged', m);
    const lagging = land([read('OPEN', true, true, 'QUEUED'), autoOn]);
    assert.equal(lagging.code, 0);
    assert.equal(lagging.calls.match(/graphql/g).length, 2);
});

test("reports merged when main holds a commit with the PR head's tree (a rebase merge)", () => {
    const rebased = 'r'.repeat(40);
    const r = land([read('OPEN', true, true, 'QUEUED'), read('OPEN', false, false)], `diverged\t${rebased}`);
    assert.match(r.out, new RegExp(`land: merged; main holds ${rebased}, with the PR's head's tree \\(PR #7\\)`));
    assert.equal(r.code, 0);
    assert.match(r.calls, /compare\/h{40}\.\.\.main/);
    assert.match(r.out, new RegExp(`Z PR #7 compare=diverged tree_match=${rebased}\n`));
});

test("names the queue's reason when it dropped the PR, and no stale one while the PR is queued", () => {
    const r = land([read('OPEN', true, true, 'QUEUED'), leftQueue('failed_checks', 'b'.repeat(40))]);
    assert.match(r.out, /land: the queue dropped PR #7: its group run failed or main changed under it/);
    assert.match(r.out, /under it \(the queue's reason: failed_checks\)\n/);
    assert.equal(r.code, 1);
    const queued = land([leftQueue('failed_checks', 'b'.repeat(40), true)], 'diverged\t-', '0');
    assert.match(queued.out, /land: timed out waiting for the queue to merge PR #7\n/);
    assert.equal(queued.code, 1);
});

test('fails a PR the queue really dropped, with the reason', () => {
    const r = land([read('OPEN', true, true, 'QUEUED'), read('OPEN', false, false)]);
    assert.match(r.out, /land: the queue dropped PR #7: its group run failed or main changed under it/);
    assert.equal(r.code, 1);
});

test('fails a dropped PR that main has not caught up with (compare reads "behind")', () => {
    const r = land([read('OPEN', true, true, 'QUEUED'), read('OPEN', false, false)], 'behind\t-');
    assert.match(r.out, /land: the queue dropped PR #7/);
    assert.equal(r.code, 1);
});

test('re-reads before it reports a timeout', () => {
    assert.match(
        land([read('OPEN', true, true, 'QUEUED')], 'diverged\t-', '0').out,
        /land: timed out waiting for the queue to merge PR #7/,
    );
    const merged = land(
        [read('OPEN', true, true, 'QUEUED'), read('MERGED', false, false, '-', 'm'.repeat(40))],
        'diverged\t-',
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
    const failed = land([['OPEN', 'true', 'true', 'QUEUED', 'FAILURE', '-', 'h', '-', '-'].join('\t')]);
    assert.match(failed.out, /a check failed on PR #7/);
    assert.equal(failed.code, 1);
});

test('reads the repository from origin, in each form GitHub hands out', () => {
    for (const url of [
        'git@github.com:acme/widgets.git',
        'https://github.com/acme/widgets',
        'https://github.com/acme/widgets.git',
        'ssh://git@github.com/acme/widgets.git',
    ]) {
        const r = land([read('OPEN', true, true, 'QUEUED'), read('OPEN', false, false)], 'ahead\t-', '30', checkout(url));
        assert.equal(r.code, 0, `${url}: ${r.out}`);
        assert.match(r.calls, / -f o=acme -f r=widgets -F n=7 /, url);
        assert.match(r.calls, /repos\/acme\/widgets\/compare\/h{40}\.\.\.main/, url);
    }
});

test('refuses an origin that is not a GitHub repository, before it calls gh', () => {
    const r = land(
        [read('MERGED', false, false, '-', 'm'.repeat(40))],
        'ahead\t-',
        '30',
        checkout('https://gitlab.com/acme/widgets.git'),
    );
    assert.equal(r.code, 1);
    assert.match(r.out, /land: origin is not a GitHub repository: https:\/\/gitlab\.com\/acme\/widgets\.git/);
    assert.equal(r.calls, '');
});

test('refuses before pushing a branch whose commits add a private-key header', () => {
    // An origin that does not exist: were the check skipped, the push would fail there, not land.
    const dir = checkout('https://github.com/orangecheck/does-not-exist.git');
    const git = (...args) =>
        spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
            encoding: 'utf8',
        });
    writeFileSync(join(dir, 'README.md'), 'base\n');
    git('add', '.');
    git('commit', '-q', '-m', 'base');
    git('update-ref', 'refs/remotes/origin/main', 'HEAD');
    git('checkout', '-q', '-b', 'feature');
    writeFileSync(join(dir, 'fixture.test.ts'), `const K = ['${['-----BEGIN', 'RSA', 'PRIVATE KEY-----'].join(' ')}'];\n`);
    git('add', '.');
    git('commit', '-q', '-m', 'fixture');
    const r = spawnSync('bash', [SCRIPT, 'feature'], {
        cwd: dir,
        env: { ...process.env, LAND_GH: '/bin/false', GIT_TERMINAL_PROMPT: '0' },
        encoding: 'utf8',
    });
    assert.equal(r.status, 1);
    assert.match(r.stderr, /fixture\.test\.ts/);
    assert.match(r.stderr, /land: a commit on feature adds a private-key header/);
});

