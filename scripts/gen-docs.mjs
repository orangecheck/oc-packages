#!/usr/bin/env node
/**
 * gen-docs — orchestrate per-package TypeDoc runs into oc-docs.
 *
 * Phase 1: hardcoded list of one package (`sdk`). Phase 2 (next session)
 * walks every directory under oc-packages/ that has a typedoc.json.
 *
 * Each package's typedoc.json declares its own out= path, pointing at a
 * subtree under sibling repo `oc-docs/src/pages/sdk/<pkg>/`. We invoke
 * TypeDoc once per package via the local devDep binary at
 * `<pkg>/node_modules/.bin/typedoc`.
 *
 * Drift discipline: this script is idempotent. Running it without source
 * changes produces zero diff. CI's drift-check.mjs (Phase 3) re-runs and
 * fails if the generated tree would differ from what's committed in
 * oc-docs.
 */

import { execSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');

// Phase 1: one package. Phase 2 generalizes via fs walk.
const PACKAGES_PHASE_1 = ['sdk'];

const requested = process.argv.slice(2);
const packages = requested.length > 0 ? requested : PACKAGES_PHASE_1;

let failures = 0;

for (const pkg of packages) {
    const pkgDir = resolve(REPO_ROOT, pkg);
    const configPath = resolve(pkgDir, 'typedoc.json');
    if (!existsSync(configPath)) {
        console.error(`[gen-docs] ✗ ${pkg}: no typedoc.json at ${configPath}`);
        failures += 1;
        continue;
    }
    const bin = resolve(pkgDir, 'node_modules/.bin/typedoc');
    if (!existsSync(bin)) {
        console.error(`[gen-docs] ✗ ${pkg}: typedoc binary not installed (cd ${pkg} && yarn install)`);
        failures += 1;
        continue;
    }
    console.log(`[gen-docs] · ${pkg}`);
    try {
        execSync(`${bin} --options typedoc.json`, {
            cwd: pkgDir,
            stdio: ['ignore', 'inherit', 'inherit'],
        });
    } catch (err) {
        console.error(`[gen-docs] ✗ ${pkg}: typedoc exit ${err.status ?? '?'}`);
        failures += 1;
    }
}

// Post-process every generated .mdx file: convert TypeDoc's YAML
// frontmatter into the `export const metadata = {...}` pattern that
// oc-docs's MDX renderer reads. oc-docs doesn't run remark-frontmatter,
// so raw `---` blocks at the top of an MDX file would either be ignored
// or, worse, parsed as JSX (angle brackets in values trigger that).
//
// We also derive `title` from the first `# Heading` to satisfy oc-docs's
// breadcrumbs + sidebar lookup; the description stays generic.
const OC_DOCS_SDK_ROOT = resolve(REPO_ROOT, '..', 'oc-docs', 'src', 'pages', 'sdk');
if (existsSync(OC_DOCS_SDK_ROOT)) {
    let processed = 0;
    walkMdx(OC_DOCS_SDK_ROOT, (file) => {
        const raw = readFileSync(file, 'utf8');
        const transformed = mdxTransform(raw, file);
        if (transformed !== raw) {
            writeFileSync(file, transformed);
            processed += 1;
        }
    });
    console.log(`[gen-docs] post-processed ${processed} .mdx file(s) for oc-docs`);
}

if (failures > 0) {
    console.error(`[gen-docs] ${failures}/${packages.length} package(s) failed`);
    process.exit(1);
}
console.log(`[gen-docs] ${packages.length}/${packages.length} ok`);

// ─── helpers ──────────────────────────────────────────────────────────────

function walkMdx(dir, onFile) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) walkMdx(full, onFile);
        else if (entry.endsWith('.mdx')) onFile(full);
    }
}

function mdxTransform(raw, filePath) {
    // Match the YAML frontmatter that typedoc-plugin-frontmatter emits.
    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n+/);
    if (!frontmatterMatch) return raw;

    const body = raw.slice(frontmatterMatch[0].length);

    // Pull title from first `# Heading` in the body.
    const titleMatch = body.match(/^#\s+(.+?)\s*$/m);
    const rawTitle = titleMatch ? titleMatch[1] : 'API reference';
    const title = stripMd(rawTitle);
    const description = `Auto-generated API reference for ${title}. Source: TypeScript types in oc-packages.`;

    const exportBlock =
        `export const metadata = {\n` +
        `    title: ${JSON.stringify(title)},\n` +
        `    description: ${JSON.stringify(description)},\n` +
        `};\n\n`;

    // Escape stray `{` / `}` in prose so MDX doesn't parse them as JSX
    // expressions. JSDoc text often contains `{ ok, sats, ... }` shapes
    // describing object literals — outside code fences MDX would treat
    // those as JSX expressions and the build would fail with
    // "ReferenceError: ok is not defined."
    return exportBlock + escapeBracesOutsideCodeFences(body);
}

function escapeBracesOutsideCodeFences(s) {
    const out = [];
    let inFence = false;
    let inInline = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
        // Toggle ```...``` fenced blocks at line starts.
        if (
            c === '`' &&
            s[i + 1] === '`' &&
            s[i + 2] === '`' &&
            (i === 0 || s[i - 1] === '\n')
        ) {
            inFence = !inFence;
            out.push('```');
            i += 2;
            continue;
        }
        // Toggle inline `code` runs (don't span newlines).
        if (!inFence && c === '`') {
            inInline = !inInline;
            out.push(c);
            continue;
        }
        if (!inFence && c === '\n' && inInline) {
            // A newline closes an unclosed inline code run.
            inInline = false;
        }
        if (!inFence && !inInline && c === '{') {
            out.push('&#123;');
            continue;
        }
        if (!inFence && !inInline && c === '}') {
            out.push('&#125;');
            continue;
        }
        out.push(c);
    }
    return out.join('');
}

function stripMd(s) {
    // Trim markdown link syntax + backticks for safe use in title.
    return s
        .replace(/\\(.)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[`*_]/g, '')
        .trim();
}
