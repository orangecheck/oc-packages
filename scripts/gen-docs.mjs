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

function mdxTransform(raw) {
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

    return exportBlock + escapeBracesOutsideCodeFences(body);
}

function escapeBracesOutsideCodeFences(s) {
    // Escape MDX-significant chars in prose so TypeDoc-rendered JSDoc that
    // contains shapes like `{ ok, sats }` or `<tool_use_id>` doesn't get
    // parsed as JSX expressions / HTML tags. Code fences (``` and inline
    // `code`) are passthrough — code is opaque in MDX.
    const out = [];
    let inFence = false;
    let inInline = false;
    for (let i = 0; i < s.length; i++) {
        const c = s[i];
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
        if (!inFence && c === '`') {
            inInline = !inInline;
            out.push(c);
            continue;
        }
        if (!inFence && c === '\n' && inInline) {
            inInline = false;
        }
        if (!inFence && !inInline) {
            if (c === '{') {
                out.push('&#123;');
                continue;
            }
            if (c === '}') {
                out.push('&#125;');
                continue;
            }
            if (c === '<') {
                // Escape all `<` outside fenced/inline code. TypeDoc emits
                // `<word>` placeholders in JSDoc prose ("Shape:" examples,
                // type-parameter references like `<T>`) plus inline `<a>`
                // anchors in tables. The placeholders break MDX parsing
                // (no closing tag); the anchors are nice-to-have but
                // expendable. Escaping universally is the safe call —
                // generated pages don't need raw HTML/JSX.
                out.push('&lt;');
                continue;
            }
        }
        out.push(c);
    }
    return out.join('');
}

function stripMd(s) {
    return s
        .replace(/\\(.)/g, '$1')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/[`*_]/g, '')
        .trim();
}
