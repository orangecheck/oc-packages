// check-home-paths.mjs against fixture repositories: a home path fails in text
// and in a binary, whatever byte comes before it there; a URL path does not.
//
//   node --test scripts/check-home-paths.test.mjs
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';

const SCRIPT = new URL('./check-home-paths.mjs', import.meta.url).pathname;
const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

// Built here, so this file holds no home path of its own.
const HOME = ['', 'home', 'someone', ''].join('/');
const MAC = ['', 'Users', 'someone', ''].join('/');

/** A repository whose tracked files are `files`, each a string or a Buffer. */
function repo(files) {
    const root = mkdtempSync(join(tmpdir(), 'home-paths-test-'));
    roots.push(root);
    const git = (...args) => execFileSync('git', ['-C', root, ...args], { stdio: 'pipe' });
    git('init', '-q');
    for (const [name, body] of Object.entries(files)) writeFileSync(join(root, name), body);
    git('add', '-f', '.');
    return root;
}

function run(root) {
    const r = spawnSync(process.execPath, [SCRIPT], { cwd: root, encoding: 'utf8' });
    return { ok: r.status === 0, out: `${r.stdout}${r.stderr}` };
}

/** A compiled file's bytes: the path's length as one byte, then the path, as a .pyc stores it. */
function compiled(path) {
    const text = Buffer.from(path);
    return Buffer.concat([Buffer.from([0x00, 0xe3, text.length]), text, Buffer.from([0x00, 0x00])]);
}

test('a home path in a text file fails', () => {
    const r = run(repo({ 'a.ts': `const dir = '${HOME}work';\n` }));
    assert.equal(r.ok, false, r.out);
    assert.match(r.out, /a\.ts:1:/);
});

test('a macOS home path fails, in text and in a binary', () => {
    const text = run(repo({ 'a.ts': `const dir = '${MAC}work';\n` }));
    assert.equal(text.ok, false, text.out);
    const binary = run(repo({ 'm.pyc': compiled(`${MAC}work/m.py`) }));
    assert.equal(binary.ok, false, binary.out);
    assert.match(binary.out, /m\.pyc: binary file/);
});

test('a home path in a file URL fails', () => {
    const r = run(repo({ 'a.md': `Open file://${HOME}notes.txt to read it.\n` }));
    assert.equal(r.ok, false, r.out);
    assert.match(r.out, /a\.md:1:/);
});

test('a home path in a PATH list fails', () => {
    const r = run(repo({ 'env.sh': `export PATH=/usr/bin:${HOME}bin\n` }));
    assert.equal(r.ok, false, r.out);
    assert.match(r.out, /env\.sh:1:/);
});

test('a home path in a URL passes', () => {
    const r = run(repo({ 'a.md': `See https://example.com${HOME}notes for the guide.\n` }));
    assert.equal(r.ok, true, r.out);
});

test('a home path in a binary fails, whatever byte comes before it', () => {
    // Lengths whose byte is ".", "/", a digit, ":", a capital and "_": a text boundary stops at each.
    for (const length of [46, 47, 50, 58, 75, 95]) {
        const path = `${HOME}${'x'.repeat(length - HOME.length - 5)}/m.py`;
        const r = run(repo({ 'm.cpython-313.pyc': compiled(path) }));
        assert.equal(r.ok, false, `length ${length}: ${r.out}`);
        assert.match(r.out, /m\.cpython-313\.pyc: binary file/);
    }
});

test('a binary with no home path passes', () => {
    const r = run(repo({ 'm.pyc': compiled('/srv/app/project/m.py') }));
    assert.equal(r.ok, true, r.out);
});
