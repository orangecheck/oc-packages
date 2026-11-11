// scripts/check-key-fixtures.mjs against a scratch repository: a commit that adds a
// private-key header is refused, even when a later commit removes it again, and a
// multi-line value not shaped like a key passes.
//
//   node --test scripts/check-key-fixtures.test.mjs
import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';

import { useTmpRoot } from './test-tmp-root.mjs';

useTmpRoot(after);

const SCRIPT = new URL('./check-key-fixtures.mjs', import.meta.url).pathname;
// Built from parts, so this file itself adds no key header.
const HEADER = ['-----BEGIN', 'OPENSSH', 'PRIVATE KEY-----'].join(' ');

const git = (dir, ...args) =>
    spawnSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@t', ...args], {
        encoding: 'utf8',
    });

/** A repository with one base commit, tagged `base`, then `commits` of [file, content]. */
function repo(commits) {
    const dir = mkdtempSync(join(tmpdir(), 'key-fixtures-'));
    git(dir, 'init', '-q');
    writeFileSync(join(dir, 'README.md'), 'base\n');
    git(dir, 'add', '.');
    git(dir, 'commit', '-q', '-m', 'base');
    git(dir, 'tag', 'base');
    for (const [file, content] of commits) {
        writeFileSync(join(dir, file), content);
        git(dir, 'add', '.');
        git(dir, 'commit', '-q', '-m', `edit ${file}`);
    }
    return dir;
}

const check = (dir) => spawnSync('node', [SCRIPT, 'base..HEAD'], { cwd: dir, encoding: 'utf8' });

test('refuses a commit that adds a private-key header to a test fixture', () => {
    const r = check(repo([['fixture.test.ts', `const KEY = ['${HEADER}', 'b3Bl'];\n`]]));
    assert.equal(r.status, 1);
    assert.match(r.stderr, /fixture\.test\.ts/);
    assert.match(r.stderr, /history secret scan/);
});

test('refuses it even when a later commit takes the header out again', () => {
    const r = check(
        repo([
            ['fixture.test.ts', `const KEY = ['${HEADER}'];\n`],
            ['fixture.test.ts', `const KEY = ['-----BEGIN TEST VALUE-----'];\n`],
        ]),
    );
    assert.equal(r.status, 1);
});

test('passes a multi-line value that is not shaped like a key', () => {
    const r = check(
        repo([['fixture.test.ts', `const V = ['-----BEGIN TEST VALUE-----', 'line', '-----END TEST VALUE-----'];\n`]]),
    );
    assert.equal(r.status, 0, r.stderr);
});
