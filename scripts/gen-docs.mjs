#!/usr/bin/env node
/**
 * gen-docs — orchestrate per-package TypeDoc runs into oc-docs.
 *
 *   yarn docs:gen <pkg> [<pkg2> ...]   # specific packages
 *   yarn docs:gen:all                   # every package with a typedoc.json
 *
 * Each package's typedoc.json declares its own out= path under
 * `oc-docs/src/pages/sdk/<pkg>/`. We invoke the root TypeDoc binary
 * (oc-packages/node_modules/.bin/typedoc) once per package.
 *
 * The post-processing pass converts TypeDoc's YAML frontmatter into
 * the `export const metadata = {...}` pattern oc-docs reads, and
 * escapes stray `{`/`}` outside fenced code blocks (JSDoc shapes
 * like `{ ok, sats }` would otherwise be parsed as JSX expressions
 * and the build would fail).
 *
 * Drift discipline: idempotent. Running without source changes
 * produces zero diff. CI's drift-check.mjs (Phase 3) re-runs and
 * fails if the generated tree would differ from what's committed in
 * oc-docs.
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mdxTransform } from './mdx-transform.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const TYPEDOC_BIN = resolve(REPO_ROOT, 'node_modules/.bin/typedoc');
const OC_DOCS_SDK_ROOT = resolve(REPO_ROOT, '..', 'oc-docs', 'src', 'pages', 'sdk');

if (!existsSync(TYPEDOC_BIN)) {
    console.error(
        '[gen-docs] ✗ typedoc binary missing at',
        TYPEDOC_BIN,
        '\n  run `yarn install` at oc-packages/ root first.',
    );
    process.exit(1);
}

const args = process.argv.slice(2);
const packages = args.includes('--all')
    ? discoverAllPackages()
    : args.filter((a) => !a.startsWith('--'));

if (packages.length === 0) {
    console.error('[gen-docs] no packages specified. Use `--all` or pass package names.');
    process.exit(1);
}

let failures = 0;
for (const pkg of packages) {
    const pkgDir = resolve(REPO_ROOT, pkg);
    const configPath = resolve(pkgDir, 'typedoc.json');
    if (!existsSync(configPath)) {
        console.error(`[gen-docs] ✗ ${pkg}: no typedoc.json at ${configPath}`);
        failures += 1;
        continue;
    }
    process.stdout.write(`[gen-docs] · ${pkg} ... `);
    try {
        execSync(`"${TYPEDOC_BIN}" --options typedoc.json`, {
            cwd: pkgDir,
            stdio: ['ignore', 'pipe', 'pipe'],
        });
        console.log('ok');
    } catch (err) {
        console.error(`exit ${err.status ?? '?'}`);
        if (err.stdout) console.error(String(err.stdout).split('\n').slice(-10).join('\n'));
        if (err.stderr) console.error(String(err.stderr).split('\n').slice(-10).join('\n'));
        failures += 1;
    }
}

// Post-process every generated .mdx file under oc-docs/src/pages/sdk.
if (existsSync(OC_DOCS_SDK_ROOT)) {
    let processed = 0;
    walkMdx(OC_DOCS_SDK_ROOT, (file) => {
        const raw = readFileSync(file, 'utf8');
        const transformed = mdxTransform(raw);
        if (transformed !== raw) {
            writeFileSync(file, transformed);
            processed += 1;
        }
    });
    console.log(`[gen-docs] post-processed ${processed} .mdx file(s)`);
}

if (failures > 0) {
    console.error(`[gen-docs] ${failures}/${packages.length} package(s) failed`);
    process.exit(1);
}
console.log(`[gen-docs] ${packages.length}/${packages.length} ok`);

// ─── helpers ──────────────────────────────────────────────────────────────

function discoverAllPackages() {
    const out = [];
    for (const entry of readdirSync(REPO_ROOT)) {
        const dir = resolve(REPO_ROOT, entry);
        if (!statSync(dir).isDirectory()) continue;
        if (entry.startsWith('.') || entry === 'node_modules' || entry === 'scripts') continue;
        if (existsSync(resolve(dir, 'typedoc.json'))) out.push(entry);
    }
    return out.sort();
}

function walkMdx(dir, onFile) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) walkMdx(full, onFile);
        else if (entry.endsWith('.mdx')) onFile(full);
    }
}
