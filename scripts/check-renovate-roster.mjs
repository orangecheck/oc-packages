/**
 * Every repo that consumes an `@orangecheck/*` package must be on Renovate's
 * autodiscover roster, or it never receives a family bump.
 *
 * `renovate-global.json` sets `"autodiscover": false` and lists repositories by
 * hand. A consumer missing from that list is a silent failure: nothing errors,
 * no PR is ever opened, and the repo simply drifts further behind on every
 * publish. You notice months later when a fix "that shipped" turns out never to
 * have reached the site.
 *
 * oc-btc-web and oc-globe-web were in exactly that state — four
 * `@orangecheck/*` dependencies each, neither on the roster.
 *
 * Runs from oc-packages, and reads the sibling repos from the parent workspace
 * directory. Skips silently when the siblings are not present (a CI checkout of
 * this repo alone), because failing there would only teach people to ignore it.
 *
 * Usage: node scripts/check-renovate-roster.mjs
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const HERE = new URL('.', import.meta.url).pathname;
const WORKSPACE = join(HERE, '..', '..');

const roster = new Set(
    JSON.parse(readFileSync(join(HERE, '..', 'renovate-global.json'), 'utf8')).repositories.map(
        (r) => r.split('/').pop()
    )
);

let siblings;
try {
    siblings = readdirSync(WORKSPACE).filter(
        (d) => d.startsWith('oc-') && statSync(join(WORKSPACE, d)).isDirectory()
    );
} catch {
    console.log('renovate roster: sibling repos not present, skipping');
    process.exit(0);
}
if (siblings.length < 2) {
    console.log('renovate roster: sibling repos not present, skipping');
    process.exit(0);
}

const missing = [];
for (const dir of siblings) {
    const pj = join(WORKSPACE, dir, 'package.json');
    if (!existsSync(pj)) continue;
    let pkg;
    try {
        pkg = JSON.parse(readFileSync(pj, 'utf8'));
    } catch {
        continue;
    }
    const deps = { ...(pkg.dependencies ?? {}), ...(pkg.devDependencies ?? {}) };
    const family = Object.keys(deps).filter((k) => k.startsWith('@orangecheck/'));
    if (family.length && !roster.has(dir)) missing.push(`${dir} (${family.length} deps)`);
}

if (missing.length === 0) {
    console.log(`renovate roster: ${roster.size} repos, every @orangecheck consumer covered`);
    process.exit(0);
}

console.error('\nCONSUMERS MISSING FROM THE RENOVATE ROSTER:');
for (const m of missing) console.error(`  ${m}`);
console.error('\nThese repos receive no family bumps at all — no PR, no error, silent drift.');
console.error('Add "orangecheck/<repo>" to repositories in renovate-global.json.');
process.exit(1);
