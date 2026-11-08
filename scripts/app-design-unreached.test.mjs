// scripts/app-design-unreached.sh against scratch repositories: a change confined to other packages'
// directories skips app-design's checks, and anything else, or an error, runs them.
//
//   node --test scripts/app-design-unreached.test.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import assert from 'node:assert/strict';

const SCRIPT = new URL('./app-design-unreached.sh', import.meta.url).pathname;

const git = (cwd, ...args) => {
    const r = spawnSync('git', args, { cwd, encoding: 'utf8' });
    assert.equal(r.status, 0, `git ${args.join(' ')}: ${r.stderr}`);
    return r.stdout.trim();
};
const commit = (cwd, message) =>
    git(cwd, '-c', 'user.name=test', '-c', 'user.email=test@example.invalid', 'commit', '-q', '--allow-empty', '-m', message);
const put = (root, path, text = 'x\n') => {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), text);
};

/** A base with app-design, cli and root files; `change` edits a clone of it, and the script runs on that commit. */
function run(change, base = null) {
    const dir = mkdtempSync(join(tmpdir(), 'unreached-'));
    const origin = join(dir, 'origin.git');
    const work = join(dir, 'work');
    git(dir, 'init', '-q', '--bare', origin);
    git(dir, 'clone', '-q', origin, work);
    for (const p of ['package.json', '.gitignore', 'app-design/package.json', 'app-design/src/index.ts', 'cli/package.json', 'cli/a.ts', 'sdk-py/a.py']) put(work, p);
    git(work, 'add', '-A');
    commit(work, 'base');
    const baseSha = git(work, 'rev-parse', 'HEAD');
    change(work);
    git(work, 'add', '-A');
    commit(work, 'change');
    git(work, 'push', '-q', origin, 'HEAD:refs/heads/main');
    const r = spawnSync('bash', [SCRIPT, base ?? baseSha], { cwd: join(work, 'app-design'), encoding: 'utf8' });
    rmSync(dir, { recursive: true, force: true });
    return r;
}

const skips = (name, change) => test(`${name}: skips`, () => assert.equal(run(change).status, 0));
const runs = (name, change) =>
    test(`${name}: runs the checks`, () => assert.notEqual(run(change).status, 0));

skips('a change in another package', (w) => appendFileSync(join(w, 'cli/a.ts'), 'y\n'));
skips('an empty commit', () => {});
skips('a new package directory', (w) => put(w, 'newpkg/package.json', '{}\n'));
runs('a change in app-design', (w) => appendFileSync(join(w, 'app-design/src/index.ts'), 'y\n'));
runs('a root file', (w) => appendFileSync(join(w, 'package.json'), ' \n'));
runs('a root .gitattributes', (w) => put(w, '.gitattributes', '* text eol=crlf\n'));
runs('a directory with no package.json', (w) => appendFileSync(join(w, 'sdk-py/a.py'), 'y\n'));
runs('a hidden directory with a package.json', (w) => put(w, '.github/package.json', '{}\n'));
runs('a rename out of app-design', (w) => renameSync(join(w, 'app-design/src/index.ts'), join(w, 'cli/index.ts')));
runs('a deleted package', (w) => rmSync(join(w, 'cli'), { recursive: true }));
runs('another package plus a root file', (w) => {
    appendFileSync(join(w, 'cli/a.ts'), 'y\n');
    appendFileSync(join(w, '.gitignore'), 'y\n');
});
// A change that would skip, against a base the origin does not have: the fetch fails, so the checks run.
test('an unfetchable base: runs the checks', () =>
    assert.notEqual(run((w) => appendFileSync(join(w, 'cli/a.ts'), 'y\n'), '0'.repeat(39) + '1').status, 0));
