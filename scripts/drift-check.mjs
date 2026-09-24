#!/usr/bin/env node
/**
 * drift-check — fail the PR if regenerating SDK docs would change the
 * sibling oc-docs/src/pages/sdk/* tree.
 *
 * Run by .github/workflows/docs-drift.yml on every PR that touches
 * oc-packages. The workflow checks out oc-docs alongside oc-packages
 * (sibling working trees), runs this script. The script:
 *
 *   1. Generates docs into a temporary directory (NOT into oc-docs).
 *   2. Diffs against the committed tree at ../oc-docs/src/pages/sdk/.
 *   3. Exits 1 if the tree would differ. Prints the diff.
 *
 * Why two repos: oc-packages owns the source-of-truth (TS + JSDoc) +
 * the generator. oc-docs owns the static MDX served to docs.ochk.io.
 * Drift between them is a human-discipline problem this gate solves
 * mechanically.
 *
 * Local usage:
 *   yarn docs:check      # exit 0 if no drift; exit 1 + diff if so
 */

import { execFileSync, execSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { mdxTransform } from './mdx-transform.mjs';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const TYPEDOC_BIN = resolve(REPO_ROOT, 'node_modules/.bin/typedoc');
const COMMITTED_DIR = resolve(REPO_ROOT, '..', 'oc-docs', 'src', 'pages', 'sdk');
// Hand-written pages that live beside the generated package trees.
const HAND_WRITTEN = new Set(['index.mdx', 'cli.mdx', 'python.mdx']);

if (!existsSync(TYPEDOC_BIN)) {
    console.error('[drift-check] ✗ typedoc binary missing — run `yarn install` at oc-packages root');
    process.exit(2);
}
if (!existsSync(COMMITTED_DIR)) {
    console.error(
        '[drift-check] ✗ committed dir missing:',
        COMMITTED_DIR,
        '\n  is the oc-docs sibling checkout in place?',
    );
    process.exit(2);
}

// 1. Generate into a temp dir.
const tmpRoot = mkdtempSync(join(tmpdir(), 'oc-docs-drift-'));
console.log(`[drift-check] generating into ${tmpRoot} ...`);

let exitCode = 0;
try {
    const packages = discoverAllPackages();
    if (packages.length === 0) {
        console.error('[drift-check] no packages with typedoc.json found');
        process.exit(2);
    }

    for (const pkg of packages) {
        const pkgDir = resolve(REPO_ROOT, pkg);
        // Override `out` to land under tmpRoot/<pkg>.
        const outDir = resolve(tmpRoot, pkg);
        try {
            execFileSync(
                TYPEDOC_BIN,
                ['--options', 'typedoc.json', '--out', outDir],
                { cwd: pkgDir, stdio: ['ignore', 'pipe', 'pipe'] },
            );
        } catch (err) {
            console.error(`[drift-check] ✗ ${pkg}: typedoc exit ${err.status ?? '?'}`);
            if (err.stderr) console.error(String(err.stderr).split('\n').slice(-10).join('\n'));
            exitCode = 2;
        }
    }

    // Apply the same post-process the publisher does.
    walkMdx(tmpRoot, (file) => {
        const raw = readFileSync(file, 'utf8');
        const transformed = mdxTransform(raw, relative(tmpRoot, file));
        if (transformed !== raw) writeFileSync(file, transformed);
    });

    // 2. Diff tmpRoot vs the committed tree.
    let diffs = 0;
    const allFiles = new Set();
    walkMdx(tmpRoot, (file) => allFiles.add(relative(tmpRoot, file)));
    walkMdx(COMMITTED_DIR, (file) => {
        const rel = relative(COMMITTED_DIR, file);
        if (!HAND_WRITTEN.has(rel)) allFiles.add(rel);
    });

    for (const rel of [...allFiles].sort()) {
        const tmpPath = join(tmpRoot, rel);
        const cmtPath = join(COMMITTED_DIR, rel);
        const tmpExists = existsSync(tmpPath);
        const cmtExists = existsSync(cmtPath);
        if (!tmpExists) {
            console.error(`[drift-check] ✗ ${rel}: extra file in oc-docs (would be removed)`);
            diffs += 1;
            continue;
        }
        if (!cmtExists) {
            console.error(`[drift-check] ✗ ${rel}: missing file in oc-docs (would be added)`);
            diffs += 1;
            continue;
        }
        const a = readFileSync(tmpPath, 'utf8');
        const b = readFileSync(cmtPath, 'utf8');
        if (a !== b) {
            console.error(`[drift-check] ✗ ${rel}: content differs`);
            diffs += 1;
        }
    }

    if (diffs > 0) {
        console.error('');
        console.error(`[drift-check] DRIFT: ${diffs} difference(s) between regenerated docs and the committed oc-docs tree.`);
        console.error('');
        console.error('  Fix: run `yarn docs:gen:all` in oc-packages, commit the resulting');
        console.error('  oc-docs/src/pages/sdk/ changes alongside this PR, push both.');
        console.error('');
        exitCode = 1;
    } else {
        console.log(`[drift-check] OK · ${packages.length} package(s), ${allFiles.size} file(s) match`);
    }
} finally {
    // Always clean up the temp dir.
    try {
        rmSync(tmpRoot, { recursive: true, force: true });
    } catch {}
}

process.exit(exitCode);

// ─── helpers ───────────────────────────────────────

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
    if (!existsSync(dir)) return;
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) walkMdx(full, onFile);
        else if (entry.endsWith('.mdx')) onFile(full);
    }
}
