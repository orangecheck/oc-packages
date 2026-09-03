/**
 * Every publishable package in this repo must have a release trigger.
 *
 * release.yml fires on tag patterns listed by hand — 34 of them — and derives
 * the package directory generically from the tag (`PKG="${TAG%-v*}"`). So a
 * package missing only its PATTERN is not a loud failure: `git tag` and
 * `git push` both succeed, no workflow run is created, and nothing anywhere
 * says so. You discover it by noticing npm still has the old version.
 *
 * That is what happened to @orangecheck/vault-core, @orangecheck/vault-cli and
 * @orangecheck/stamp-cli — all three published to npm at some point, all three
 * with no trigger. vault-core mattered: a cross-tenant credential-disclosure
 * fix sat tagged-but-unpublished because the tag silently did nothing.
 *
 * It checks both directions: a publishable package with no pattern, and a
 * pattern with no package (a rename that left the trigger behind). Python
 * packages count — sdk-py ships to PyPI from the same workflow and has a
 * pyproject.toml rather than a package.json.
 *
 * Usage: node scripts/check-release-triggers.mjs
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const WORKFLOW = '.github/workflows/release.yml';

const yaml = readFileSync(WORKFLOW, 'utf8');
const tagsBlock = /tags:\n((?:[ \t]+(?:- |#).*\n)+)/.exec(yaml);
if (!tagsBlock) {
    console.error(`could not find the on.push.tags block in ${WORKFLOW}`);
    process.exit(1);
}
const patterns = new Set(
    [...tagsBlock[1].matchAll(/- '([^']+)'/g)].map((m) => m[1].replace(/-v\*$/, ''))
);

const missing = [];
const orphaned = [];

for (const name of readdirSync('.')) {
    if (name.startsWith('.') || name === 'node_modules') continue;
    let pj;
    try {
        if (!statSync(name).isDirectory()) continue;
        pj = JSON.parse(readFileSync(join(name, 'package.json'), 'utf8'));
    } catch {
        continue; // not a package directory
    }
    const publishable = !pj.private && String(pj.name ?? '').startsWith('@orangecheck/');
    if (publishable && !patterns.has(name)) missing.push(`${name} (${pj.name})`);
    if (!publishable && patterns.has(name)) orphaned.push(name);
}

// A pattern with no package at all — a rename that left the trigger behind.
// Accept BOTH manifests: sdk-py is a real Python package published to PyPI by
// the same workflow, and an earlier version of this check flagged it as
// orphaned because it only knew about package.json. A guard that cries wolf
// gets deleted, so it has to understand every kind of package here.
for (const p of patterns) {
    const hasNode = existsSync(join(p, 'package.json'));
    const hasPython = existsSync(join(p, 'pyproject.toml'));
    if (!hasNode && !hasPython) {
        orphaned.push(`${p} (no package.json or pyproject.toml)`);
    }
}

if (missing.length === 0 && orphaned.length === 0) {
    console.log(`release triggers: ${patterns.size} patterns, every publishable package covered`);
    process.exit(0);
}

if (missing.length) {
    console.error('\nPUBLISHABLE PACKAGES WITH NO RELEASE TRIGGER:');
    for (const m of missing) console.error(`  ${m}`);
    console.error(`\nTagging these does nothing — no run is created and nothing reports it.`);
    console.error(`Add "- '<dir>-v*'" to the tags list in ${WORKFLOW}.`);
}
if (orphaned.length) {
    console.error('\nTRIGGERS WITH NO PUBLISHABLE PACKAGE (stale after a rename or unpublish):');
    for (const o of orphaned) console.error(`  ${o}`);
}
process.exit(1);
