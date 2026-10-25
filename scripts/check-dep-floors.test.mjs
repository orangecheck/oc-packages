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

const SCRIPT = new URL('./check-dep-floors.mjs', import.meta.url).pathname;
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
            lock: { '@orangecheck/auth-client@^2.40.0': '2.40.0', '@orangecheck/auth-core@^2.21.0': '2.21.0' },
        }),
    );
    assert.equal(r.ok, false, r.out);
    assert.match(r.out, /auth-core 2\.21\.0 \(locked or declared floor\) does not export "\.\/identifiers"/);
});

test('site-kit passes on auth-core ^2.24.0', () => {
    const fields = { devDependencies: { '@orangecheck/auth-client': '^2.40.0', '@orangecheck/auth-core': '^2.24.0' } };
    const r = run(
        tree({
            fields,
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
    const r = run(tree({ fields, lock }));
    assert.equal(r.ok, true, r.out);
});

test("design's shape fails: auth-client 2.40 with no auth-core installed (yarn 1 installs no peers)", () => {
    const r = run(
        tree({
            fields: { devDependencies: { '@orangecheck/auth-client': '^2.40.0' } },
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
