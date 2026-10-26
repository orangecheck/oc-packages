// check-renovate-roster.mjs against a fixture workspace: a consumer off the
// roster fails, and neither a git worktree of a listed repo (its .git is a
// file) nor a retired repo is taken for a consumer of its own.
//
//   node --test scripts/check-renovate-roster.test.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';

const SCRIPT = new URL('./check-renovate-roster.mjs', import.meta.url).pathname;
const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

/** A workspace of repos, each `{ name, worktree, deps }`, and a roster listing `listed`. */
function workspace(repos, listed) {
    const root = mkdtempSync(join(tmpdir(), 'roster-test-'));
    roots.push(root);
    for (const r of repos) {
        const dir = join(root, r.name);
        mkdirSync(dir);
        if (r.worktree) writeFileSync(join(dir, '.git'), `gitdir: /elsewhere/.git/worktrees/${r.name}\n`);
        else mkdirSync(join(dir, '.git'));
        writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: r.name, dependencies: r.deps ?? {} }));
    }
    const roster = join(root, 'renovate-global.json');
    writeFileSync(roster, JSON.stringify({ repositories: listed.map((n) => `orangecheck/${n}`) }));
    return { root, roster };
}

function run({ root, roster }) {
    const r = spawnSync(process.execPath, [SCRIPT, '--workspace', root, '--roster', roster], { encoding: 'utf8' });
    return { ok: r.status === 0, out: `${r.stdout}${r.stderr}` };
}

const dep = { '@orangecheck/auth-core': '^2.26.0' };

test('a consumer that is not on the roster fails', () => {
    const r = run(workspace([{ name: 'oc-www', deps: dep }, { name: 'oc-chat-web', deps: dep }], ['oc-www']));
    assert.equal(r.ok, false, r.out);
    assert.match(r.out, /oc-chat-web \(1 deps\)/);
});

test('a worktree of a listed repo is not a consumer of its own', () => {
    const repos = [
        { name: 'oc-www', deps: dep },
        { name: 'oc-chat-web', deps: dep },
        { name: 'oc-www-legal0716', deps: dep, worktree: true },
    ];
    const r = run(workspace(repos, ['oc-www', 'oc-chat-web']));
    assert.equal(r.ok, true, r.out);
    assert.doesNotMatch(r.out, /oc-www-legal0716/);
});

test('a workspace that holds only worktrees has no siblings to check', () => {
    const repos = [
        { name: 'oc-www-a', deps: dep, worktree: true },
        { name: 'oc-www-b', deps: dep, worktree: true },
    ];
    const r = run(workspace(repos, []));
    assert.equal(r.ok, true, r.out);
    assert.match(r.out, /sibling repos not present, skipping/);
});

test('a retired repo is not a consumer', () => {
    const repos = [
        { name: 'oc-www', deps: dep },
        { name: 'oc-chat-web', deps: dep },
        { name: 'oc-fleet-web', deps: dep },
    ];
    const r = run(workspace(repos, ['oc-www', 'oc-chat-web']));
    assert.equal(r.ok, true, r.out);
});
