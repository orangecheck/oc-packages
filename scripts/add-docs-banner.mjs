#!/usr/bin/env node
/**
 * Add a "Full reference: docs.ochk.io/sdk/<pkg>" banner to the top of
 * every per-package README — right after the H1 title.
 *
 * Why a banner not a full slim: the existing READMEs vary widely
 * (some are 40 lines, some 200; some have valuable migration notes,
 * some are pure API-surface drift specimens). A blanket trim risks
 * losing valuable narrative. The banner instead clearly designates
 * the docs site as the source of truth for the API surface, making
 * any future README "API" section harmless even if it drifts.
 *
 * Idempotent: re-running doesn't double-stamp. The marker is the
 * literal "> **Full reference:" string on a blockquote line.
 */

import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..');
const MARKER = '> **Full reference:';

let touched = 0;
let skipped = 0;
const errors = [];

for (const entry of readdirSync(REPO_ROOT).sort()) {
    const dir = resolve(REPO_ROOT, entry);
    if (!statSync(dir).isDirectory()) continue;
    if (entry.startsWith('.') || entry === 'node_modules' || entry === 'scripts') continue;

    const readmePath = resolve(dir, 'README.md');
    const pkgPath = resolve(dir, 'package.json');
    if (!existsSync(readmePath) || !existsSync(pkgPath)) continue;

    const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
    if (!pkg.name?.startsWith('@orangecheck/')) continue;
    const slug = pkg.name.replace('@orangecheck/', '');

    // Phase 1 only: only stamp packages that have a typedoc.json — the
    // ones whose docs are auto-generated. CLIs and other binaries don't
    // get the banner because there's no /sdk/<pkg> page to link to.
    if (!existsSync(resolve(dir, 'typedoc.json'))) {
        skipped++;
        continue;
    }

    const raw = readFileSync(readmePath, 'utf8');
    if (raw.includes(MARKER)) {
        skipped++;
        continue;
    }

    // Insert banner after the first H1, or at the very top if no H1.
    const lines = raw.split('\n');
    let insertAfter = -1;
    for (let i = 0; i < Math.min(lines.length, 20); i++) {
        if (/^#\s/.test(lines[i])) {
            insertAfter = i;
            break;
        }
    }

    const banner = [
        '',
        `> **Full reference:** [docs.ochk.io/sdk/${slug}](https://docs.ochk.io/sdk/${slug}) — auto-generated from the TypeScript source on every release.`,
        '> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.',
        '',
    ];

    let updated;
    if (insertAfter >= 0) {
        updated = [
            ...lines.slice(0, insertAfter + 1),
            ...banner,
            ...lines.slice(insertAfter + 1),
        ].join('\n');
    } else {
        updated = banner.join('\n') + '\n' + raw;
    }

    try {
        writeFileSync(readmePath, updated);
        touched++;
        console.log(`  + ${slug}`);
    } catch (e) {
        errors.push(`${slug}: ${(e instanceof Error ? e.message : String(e))}`);
    }
}

console.log('');
console.log(`[banner] stamped ${touched}, already-stamped/skipped ${skipped}`);
if (errors.length > 0) {
    console.error('[banner] errors:');
    for (const e of errors) console.error(`  ${e}`);
    process.exit(1);
}
