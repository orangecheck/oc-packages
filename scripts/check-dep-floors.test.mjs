// check-dep-floors.mjs against fixture packages that hold the shapes that broke
// builds: auth-client 2.37 (peer auth-core ^2.3.0 importing /family-origins),
// site-kit (devDependency auth-core ^2.21.0 under auth-client 2.40) and design
// (auth-client 2.40 with no auth-core installed at all). Reads the npm registry.
//
//   node --test scripts/check-dep-floors.test.mjs
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, test } from 'node:test';
import assert from 'node:assert/strict';

import { distImports, exportTarget, missing } from './check-dep-floors.mjs';

const SCRIPT = new URL('./check-dep-floors.mjs', import.meta.url).pathname;
// A package that loads auth-client, so what auth-client imports is read.
const CLIENT = "import * as client from '@orangecheck/auth-client';\nexport { client };\n";
const roots = [];
after(() => roots.forEach((root) => rmSync(root, { recursive: true, force: true })));

/** A tree holding one package, as `name`, with its manifest fields, one source file and a lockfile. */
function tree({ fields = {}, source = '', lock = {} }) {
    const root = mkdtempSync(join(tmpdir(), 'dep-floors-test-'));
    roots.push(root);
    const dir = join(root, 'fixture');
    mkdirSync(join(dir, 'src'), { recursive: true });
    writeFileSync(
        join(dir, 'package.json'),
        JSON.stringify({ name: '@orangecheck/fixture', version: '1.0.0', ...fields }),
    );
    writeFileSync(join(dir, 'src', 'index.ts'), source);
    const entries = Object.entries(lock).map(([key, version]) => `"${key}":\n  version "${version}"\n`);
    writeFileSync(join(dir, 'yarn.lock'), `# yarn lockfile v1\n\n${entries.join('\n')}`);
    return root;
}

function run(root) {
    const r = spawnSync(process.execPath, [SCRIPT, '--root', root], { encoding: 'utf8', timeout: 120_000 });
    return { ok: r.status === 0, out: `${r.stdout}${r.stderr}` };
}

test("auth-client 2.37's shape fails: a peer floor below the subpath it imports", () => {
    const r = run(
        tree({
            fields: { peerDependencies: { '@orangecheck/auth-core': '^2.3.0' } },
            source: 'import { isFamilyOrigin } from "@orangecheck/auth-core/family-origins";\nexport const f = isFamilyOrigin;\n',
        }),
    );
    assert.equal(r.ok, false, r.out);
    assert.match(r.out, /2\.3\.0 does not export "\.\/family-origins"/);
});

test('the same import passes once the floor is the release that added it', () => {
    const r = run(
        tree({
            fields: { peerDependencies: { '@orangecheck/auth-core': '^2.21.0' } },
            source: 'import { isFamilyOrigin } from "@orangecheck/auth-core/family-origins";\nexport const f = isFamilyOrigin;\n',
        }),
    );
    assert.equal(r.ok, true, r.out);
});

test('a named import the floor does not export fails', () => {
    const r = run(
        tree({
            fields: { peerDependencies: { '@orangecheck/auth-core': '^2.21.0' } },
            source: 'import { isDidOc } from "@orangecheck/auth-core";\nexport const f = isDidOc;\n',
        }),
    );
    assert.equal(r.ok, false, r.out);
    assert.match(r.out, /2\.21\.0 "\." has no export isDidOc/);
});

test("site-kit's shape fails: a devDependency floor below what auth-client 2.40 imports", () => {
    const fields = { devDependencies: { '@orangecheck/auth-client': '^2.40.0', '@orangecheck/auth-core': '^2.21.0' } };
    const r = run(
        tree({
            fields,
            source: CLIENT,
            lock: { '@orangecheck/auth-client@^2.40.0': '2.40.0', '@orangecheck/auth-core@^2.21.0': '2.21.0' },
        }),
    );
    assert.equal(r.ok, false, r.out);
    assert.match(
        r.out,
        /auth-core 2\.21\.0 does not export "\.\/identifiers", which @orangecheck\/auth-client@2\.40\.0 imports/,
    );
});

test('site-kit passes on auth-core ^2.24.0', () => {
    const fields = { devDependencies: { '@orangecheck/auth-client': '^2.40.0', '@orangecheck/auth-core': '^2.24.0' } };
    const r = run(
        tree({
            fields,
            source: CLIENT,
            lock: { '@orangecheck/auth-client@^2.40.0': '2.40.0', '@orangecheck/auth-core@^2.24.0': '2.24.0' },
        }),
    );
    assert.equal(r.ok, true, r.out);
});

test("a nested copy another dependency locks lower does not count: auth-client resolves this package's own", () => {
    const fields = { devDependencies: { '@orangecheck/auth-client': '^2.40.0', '@orangecheck/auth-core': '^2.24.0' } };
    const lock = {
        '@orangecheck/auth-client@^2.40.0': '2.40.0',
        '@orangecheck/auth-core@^2.24.0': '2.24.0',
        '@orangecheck/auth-core@^2.17.0': '2.18.0',
    };
    const r = run(tree({ fields, source: CLIENT, lock }));
    assert.equal(r.ok, true, r.out);
});

test("design's shape fails: auth-client 2.40 with no auth-core installed (yarn 1 installs no peers)", () => {
    const r = run(
        tree({
            fields: { devDependencies: { '@orangecheck/auth-client': '^2.40.0' } },
            source: CLIENT,
            lock: { '@orangecheck/auth-client@^2.40.0': '2.40.0' },
        }),
    );
    assert.equal(r.ok, false, r.out);
    assert.match(
        r.out,
        /auth-client@2\.40\.0 imports @orangecheck\/auth-core, which @orangecheck\/fixture does not install/,
    );
});

test('an import with no declared range fails', () => {
    const r = run(tree({ source: 'import { verify } from "@orangecheck/sdk";\nexport const v = verify;\n' }));
    assert.equal(r.ok, false, r.out);
    assert.match(r.out, /imports @orangecheck\/sdk .* but declares no range for it/);
});

test('doc examples in comments and template strings are not imports', () => {
    const sample =
        'export const SAMPLE = `import { stamp } from "@orangecheck/stamp-core";\nimport { x } from "@orangecheck/sdk";\n`;\n';
    const commented =
        '/**\n * import { verify } from "@orangecheck/sdk";\n */\n/*\nimport { check } from "@orangecheck/sdk";\n*/\n// import "@orangecheck/sdk";\n';
    const r = run(tree({ source: `${commented}${sample}` }));
    assert.equal(r.ok, true, r.out);
});

test('a quoted backtick does not hide the import() after it', () => {
    const source =
        "const tick = '`';\nexport const lazy = () => import('@orangecheck/lock-crypto');\nexport const t = `x${tick}`;\n";
    const r = run(tree({ source }));
    assert.equal(r.ok, false, r.out);
    assert.match(r.out, /imports @orangecheck\/lock-crypto .* but declares no range for it/);
});

test('a quoted /* does not hide the import() after it', () => {
    const source =
        "const glob = 'src/*';\nexport const lazy = () => import('@orangecheck/lock-crypto');\n/** doc */\nexport { glob };\n";
    const r = run(tree({ source }));
    assert.equal(r.ok, false, r.out);
    assert.match(r.out, /imports @orangecheck\/lock-crypto .* but declares no range for it/);
});

test('a quoted backtick does not hide a static import after it', () => {
    const source =
        "const tick = '`';\nimport { verify } from '@orangecheck/sdk';\nexport const t = `x${tick}`;\nexport { verify };\n";
    const r = run(tree({ source }));
    assert.equal(r.ok, false, r.out);
    assert.match(r.out, /imports @orangecheck\/sdk .* but declares no range for it/);
});

test('the newest dependency in range is read, not only the locked one', async () => {
    // The newest 2.x auth-client on the registry, compared numerically: the one a
    // reader of ^2.36.0 must pick, whichever release that is today.
    const res = await fetch('https://registry.npmjs.org/@orangecheck%2fauth-client');
    assert.equal(res.ok, true, `registry answered ${res.status}`);
    const want = Object.keys((await res.json()).versions)
        .filter((v) => /^2\.\d+\.\d+$/.test(v))
        .map((v) => v.split('.').map(Number))
        .sort((a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2])
        .at(-1)
        .join('.');
    // The fixture's premise: from 2.40.0 on, auth-client imports ./family-origins.
    assert.ok(Number(want.split('.')[1]) >= 40, want);

    const fields = { devDependencies: { '@orangecheck/auth-client': '^2.36.0', '@orangecheck/auth-core': '^2.19.0' } };
    const lock = { '@orangecheck/auth-client@^2.36.0': '2.36.1', '@orangecheck/auth-core@^2.19.0': '2.19.0' };
    const r = run(tree({ fields, source: CLIENT, lock }));
    assert.equal(r.ok, false, r.out);
    assert.match(r.out, /auth-core 2\.19\.0 does not export "\.\/family-origins"/);
    assert.ok(r.out.includes(`which @orangecheck/auth-client@${want} imports`), r.out);
    assert.doesNotMatch(r.out, /auth-client@2\.36\.1 imports/);
});

test('the declared floor is read, not only the locked version above it', () => {
    const fields = { devDependencies: { '@orangecheck/auth-client': '^2.40.0', '@orangecheck/auth-core': '^2.21.0' } };
    const lock = { '@orangecheck/auth-client@^2.40.0': '2.40.0', '@orangecheck/auth-core@^2.21.0': '2.24.0' };
    const r = run(tree({ fields, source: CLIENT, lock }));
    assert.equal(r.ok, false, r.out);
    assert.match(r.out, /auth-core 2\.21\.0 does not export "\.\/identifiers"/);
    assert.doesNotMatch(r.out, /auth-core 2\.24\.0 does not export/);
});

test("a dependency's own dependency is read at the version the lock gives it, names included", () => {
    const fields = { devDependencies: { '@orangecheck/me-client': '^0.47.0' } };
    const lock = { '@orangecheck/me-client@^0.47.0': '0.47.0', '@orangecheck/auth-core@^2.17.0': '2.10.0' };
    const source = "import * as server from '@orangecheck/me-client/server';\nexport { server };\n";
    const r = run(tree({ fields, source, lock }));
    assert.equal(r.ok, false, r.out);
    assert.match(r.out, /auth-core 2\.10\.0 "\." has no export \w+, which @orangecheck\/me-client@0\.47\.0 imports/);
});

test('a dependency is read only through the subpaths this package imports', () => {
    // me-client 0.50.0's button types name @orangecheck/mark; its integrator entry does not.
    const fields = { devDependencies: { '@orangecheck/me-client': '^0.50.0' } };
    const lock = { '@orangecheck/me-client@^0.50.0': '0.50.0', '@orangecheck/auth-core@^2.17.0': '2.26.0' };
    const via = (sub) => `import * as me from '@orangecheck/me-client/${sub}';\nexport { me };\n`;
    const integrator = run(tree({ fields, source: via('integrator'), lock }));
    assert.equal(integrator.ok, true, integrator.out);
    const button = run(tree({ fields, source: via('button'), lock }));
    assert.equal(button.ok, false, button.out);
    assert.match(
        button.out,
        /me-client@0\.50\.0 imports @orangecheck\/mark, which @orangecheck\/fixture does not install/,
    );
});

test('a dependency this package never imports is not read', () => {
    const fields = { devDependencies: { '@orangecheck/auth-client': '^2.40.0' } };
    const r = run(tree({ fields, lock: { '@orangecheck/auth-client@^2.40.0': '2.40.0' } }));
    assert.equal(r.ok, true, r.out);
});

test('an export entry with no .d.ts it can read is a problem, never a pass', async () => {
    const json = { exports: { '.': { import: './i.mjs', require: './i.js' }, './t': { types: './t.d.ts' } } };
    assert.equal(exportTarget(json, '.'), null);
    assert.equal(exportTarget(json, './t'), './t.d.ts');
    assert.equal(exportTarget(json, './none'), undefined);
    assert.equal(exportTarget({ exports: { '.': { import: { types: './i.d.mts' } } } }, '.'), './i.d.mts');
    assert.match(
        (await missing('@orangecheck/z', '1.0.0', json, '.', ['a'], 'npm'))[0],
        /no \.d\.ts this check can read/,
    );
    assert.deepEqual(await missing('@orangecheck/z', '1.0.0', json, '.', [], 'npm'), []);
    assert.match(
        (await missing('@orangecheck/z', '1.0.0', json, './none', [], 'npm'))[0],
        /does not export "\.\/none"/,
    );
});

test("a dependency's imports are followed through the files its entry loads, and no further", () => {
    const root = mkdtempSync(join(tmpdir(), 'dep-floors-test-'));
    roots.push(root);
    mkdirSync(join(root, 'dist'));
    const json = {
        name: '@orangecheck/r',
        exports: { '.': { types: './dist/index.d.ts', import: './dist/index.mjs' }, './other': './dist/other.mjs' },
    };
    writeFileSync(join(root, 'dist', 'index.mjs'), "export * from './inner.mjs';\n");
    writeFileSync(join(root, 'dist', 'index.d.ts'), "export * from './inner';\n");
    writeFileSync(
        join(root, 'dist', 'inner.mjs'),
        "import { isDidOc } from '@orangecheck/auth-core/identifiers';\nexport const f = isDidOc;\n",
    );
    writeFileSync(join(root, 'dist', 'inner.d.ts'), 'export declare const f: (v: string) => boolean;\n');
    writeFileSync(join(root, 'dist', 'other.mjs'), "import '@orangecheck/mark';\n");
    const got = distImports(root, '@orangecheck/r', ['.'], json);
    assert.deepEqual([...got.keys()], ['@orangecheck/auth-core']);
    assert.deepEqual(
        [...got.get('@orangecheck/auth-core').entries()].map(([k, v]) => [k, [...v]]),
        [['./identifiers', ['isDidOc']]],
    );
    assert.deepEqual([...distImports(root, '@orangecheck/r', ['./other'], json).keys()], ['@orangecheck/mark']);
});

test('a dependency importing itself by name is followed through its own exports', () => {
    const root = mkdtempSync(join(tmpdir(), 'dep-floors-test-'));
    roots.push(root);
    mkdirSync(join(root, 'dist'));
    const json = {
        name: '@orangecheck/r',
        exports: { '.': './dist/index.mjs', './core': { types: './dist/core.d.ts', import: './dist/core.mjs' } },
    };
    writeFileSync(join(root, 'dist', 'index.mjs'), "export { f } from '@orangecheck/r/core';\n");
    writeFileSync(
        join(root, 'dist', 'core.mjs'),
        "import { isFamilyOrigin } from '@orangecheck/auth-core/family-origins';\nexport const f = isFamilyOrigin;\n",
    );
    writeFileSync(join(root, 'dist', 'core.d.ts'), 'export declare const f: (o: string) => boolean;\n');
    const got = distImports(root, '@orangecheck/r', ['.'], json);
    assert.deepEqual([...got.keys()], ['@orangecheck/auth-core']);
    assert.deepEqual([...got.get('@orangecheck/auth-core').keys()], ['./family-origins']);
});
