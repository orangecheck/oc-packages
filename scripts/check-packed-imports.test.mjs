// check-packed-imports.mjs against fixture packages: me-client 0.53.1's shape
// (a .d.ts importing a devDependency) and each kind of import that installing
// a package does bring.
//
//   node --test scripts/check-packed-imports.test.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';

import { packageOf, problemsIn } from './check-packed-imports.mjs';

const SCRIPT = new URL('./check-packed-imports.mjs', import.meta.url).pathname;
const dirs = [];
after(() => dirs.forEach((d) => rmSync(d, { recursive: true, force: true })));

/** A package directory holding `files` (path to text) under a manifest with `fields`. */
function fixture(fields, files) {
    const dir = mkdtempSync(join(tmpdir(), 'packed-imports-test-'));
    dirs.push(dir);
    writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: '@orangecheck/fixture', version: '1.0.0', ...fields }),
    );
    for (const [path, text] of Object.entries(files)) {
        mkdirSync(dirname(join(dir, path)), { recursive: true });
        writeFileSync(join(dir, path), text);
    }
    return dir;
}

const check = (fields, files) => problemsIn(fixture(fields, files), Object.keys(files));

test("me-client 0.53.1's shape fails: a declaration file imports a devDependency", () => {
    const problems = check(
        { devDependencies: { '@orangecheck/mark': '^0.3.0' } },
        { 'dist/button.d.ts': "import { MarkVariant } from '@orangecheck/mark';\nexport { MarkVariant };\n" },
    );
    assert.deepEqual(problems, [
        '@orangecheck/fixture: dist/button.d.ts loads @orangecheck/mark, a devDependency only',
    ]);
});

test('every way a file names a module is read, in code and in declarations', () => {
    const problems = check(
        {},
        {
            'dist/a.js': "const x = require('cjs-dep');\n",
            'dist/b.mjs': "export * from 'reexported';\nconst y = await import('dynamic');\n",
            'dist/c.d.ts': "export type T = import('import-type').T;\nimport type { U } from 'type-only';\n",
            'dist/d.d.mts': "import e = require('import-equals');\n",
            'dist/e.d.cts': "export { V } from 'from-cts';\n",
            'dist/f.cjs': "module.exports = require('@scope/pkg/deep/sub');\n",
        },
    );
    const named = problems.map((p) => / loads (\S+),/.exec(p)[1]).sort();
    assert.deepEqual(named, [
        '@scope/pkg/deep/sub',
        'cjs-dep',
        'dynamic',
        'from-cts',
        'import-equals',
        'import-type',
        'reexported',
        'type-only',
    ]);
    assert.ok(problems.every((p) => p.endsWith(', not a dependency')));
});

test('what installing brings passes: dependencies, peers, optional ones, itself, builtins and relative files', () => {
    const problems = check(
        {
            dependencies: { dep: '^1.0.0' },
            peerDependencies: { '@scope/peer': '^1.0.0' },
            optionalDependencies: { opt: '^1.0.0' },
            devDependencies: { typescript: '^5.0.0' },
        },
        {
            'dist/index.js':
                "require('dep/sub');\nrequire('@scope/peer/x');\nrequire('opt');\nrequire('@orangecheck/fixture/core');\n" +
                "require('fs');\nrequire('node:crypto');\nrequire('fs/promises');\nrequire('./chunk.js');\nrequire('../up');\n",
            'dist/index.d.ts': '/// <reference types="node" />\nexport * from \'./types\';\n',
        },
    );
    assert.deepEqual(problems, []);
});

test('a type reference to a package not installed fails, and one to an installed package passes', () => {
    assert.deepEqual(
        check(
            { devDependencies: { '@types/react': '^19.0.0' } },
            { 'dist/x.d.ts': '/// <reference types="react" />\n' },
        ),
        ['@orangecheck/fixture: dist/x.d.ts loads @types/react, a devDependency only'],
    );
    assert.deepEqual(
        check({ peerDependencies: { react: '^19.0.0' } }, { 'dist/x.d.ts': '/// <reference types="react" />\n' }),
        [],
    );
});

test('a comment or a string that looks like an import is not one', () => {
    const problems = check(
        {},
        {
            'dist/x.js': "// import 'commented';\nconst s = \"require('in-string')\";\n/* export * from 'block' */\n",
        },
    );
    assert.deepEqual(problems, []);
});

test('a source map or a file that is not code is not read', () => {
    assert.deepEqual(check({}, { 'dist/x.js.map': '{"sources":["import \'x\'"]}', 'README.md': "import 'y'" }), [
        '@orangecheck/fixture: packs no code or declaration file; build it first',
    ]);
});

test('a specifier that is not a package name fails loudly', () => {
    assert.deepEqual(check({}, { 'dist/x.js': "require('https://cdn.example/x.js');\n" }), [
        '@orangecheck/fixture: dist/x.js loads https://cdn.example/x.js, which this check cannot read as a package name',
    ]);
});

test('packageOf reads the package a specifier loads', () => {
    assert.equal(packageOf('@scope/pkg/a/b'), '@scope/pkg');
    assert.equal(packageOf('pkg/sub'), 'pkg');
    assert.equal(packageOf('path'), null);
    assert.equal(packageOf('node:path'), null);
    assert.equal(packageOf('./x'), null);
    assert.equal(packageOf('..'), null);
    assert.equal(packageOf('C:\\x'), undefined);
});

test('the command reads what npm would pack, so a file outside "files" is not read', () => {
    const dir = fixture(
        { files: ['dist'], devDependencies: { left: '^1.0.0' } },
        { 'dist/index.js': "require('./x');\n", 'scripts/dev.mjs': "import 'left';\n" },
    );
    const ok = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8', timeout: 120_000 });
    assert.equal(ok.status, 0, `${ok.stdout}${ok.stderr}`);
    writeFileSync(join(dir, 'dist', 'index.js'), "require('left');\n");
    const bad = spawnSync(process.execPath, [SCRIPT, dir], { encoding: 'utf8', timeout: 120_000 });
    assert.equal(bad.status, 1, `${bad.stdout}${bad.stderr}`);
    assert.match(bad.stderr, /dist\/index\.js loads left, a devDependency only/);
});
