/**
 * Every publishable JS package in this repo must be a leg of the build matrix.
 *
 * packages.yml lists the matrix by hand. A package left off it is never
 * type-checked, built or tested on a pull request, and nothing says so: its
 * tests pass locally and fail nowhere. nostr-core, vault-core and vault-cli
 * were off it, the same three-package gap check-release-triggers.mjs closes
 * for release.yml.
 *
 * It checks both directions: a publishable package with no leg, and a leg
 * with no package.json (a rename that left the entry behind).
 *
 * Usage: node scripts/check-build-matrix.mjs [workflow]
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOW = process.argv[2] ?? '.github/workflows/packages.yml';

const yaml = readFileSync(WORKFLOW, 'utf8');
const block = /name: Build \$\{\{ matrix\.pkg \}\}[\s\S]*?\n\s+pkg:\n((?:[ \t]+- [\w-]+\n)+)/.exec(yaml);
if (!block) {
    console.error(`could not find the build matrix's pkg list in ${WORKFLOW}`);
    process.exit(1);
}
const legs = new Set([...block[1].matchAll(/- ([\w-]+)/g)].map((m) => m[1]));

const missing = [];
const orphaned = [];

for (const name of readdirSync('.')) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    let pj;
    try {
        if (!statSync(name).isDirectory()) continue;
        pj = JSON.parse(readFileSync(join(name, 'package.json'), 'utf8'));
    } catch {
        continue; // not a JS package directory
    }
    const publishable = !pj.private && String(pj.name ?? '').startsWith('@orangecheck/');
    if (publishable && !legs.has(name)) missing.push(`${name} (${pj.name})`);
}

for (const leg of legs) {
    if (!existsSync(join(leg, 'package.json'))) orphaned.push(leg);
}

if (missing.length === 0 && orphaned.length === 0) {
    console.log(`build matrix: ${legs.size} legs, every publishable package covered`);
    process.exit(0);
}
if (missing.length) {
    console.error('\nPUBLISHABLE PACKAGES WITH NO BUILD LEG:');
    for (const m of missing) console.error(`  ${m}`);
    console.error(`\nNo pull request type-checks, builds or tests these.`);
    console.error(`Add "- <dir>" to the build job's matrix.pkg list in ${WORKFLOW}.`);
}
if (orphaned.length) {
    console.error('\nLEGS WITH NO package.json (stale after a rename or removal):');
    for (const o of orphaned) console.error(`  ${o}`);
}
process.exit(1);
