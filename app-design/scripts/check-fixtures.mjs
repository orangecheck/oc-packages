#!/usr/bin/env node
/*
 * A story's made-up customers, integrators and logos are plainly fictional
 * (Lumen Notes, Halfway Books), never a real relay, wallet or explorer we
 * deal with: a design site that shows one as a customer claims a
 * relationship that does not exist. A real service may appear only where it
 * is the truth: the named source of a number, or a wallet the tools really
 * sign with.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const DENY = [
    // Relays and Nostr services.
    'nostr.band', 'damus', 'primal', 'nos.lol', 'snort.social', 'iris.to',
    // Wallets and exchanges.
    'alby', 'xverse', 'unisat', 'leather', 'sparrow', 'phoenix', 'zeus', 'breez', 'muun', 'strike', 'wallet of satoshi', 'cash app', 'coinbase', 'river.com', 'swan bitcoin',
    // Explorers and data.
    'mempool.space', 'blockstream.info', 'bitnodes', 'blockchair',
];
const TRUTH = [
    // Where a number comes from: SourceNote, a `source`, a parameter's `default`.
    /SourceNote|\bsource[=:]|\bdefault:/,
    // A wallet the tools sign with, its button and the stand-in that shows it detected.
    /Sign with|stand-in|window as unknown/,
];

const stories = [];
(function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
        if (e.isDirectory()) walk(join(d, e.name));
        else if (e.name.endsWith('.stories.tsx')) stories.push(join(d, e.name));
    }
})(join(pkg, 'src'));

const found = [];
for (const f of stories) {
    readFileSync(f, 'utf8')
        .split('\n')
        .forEach((line, i) => {
            const lower = line.toLowerCase();
            for (const name of DENY) {
                if (new RegExp(`(^|[^a-z0-9.])${name.replace(/\./g, '\\.')}([^a-z0-9]|$)`).test(lower) && !TRUTH.some((t) => t.test(line))) {
                    found.push(`${relative(pkg, f)}:${i + 1} names ${name}: ${line.trim().slice(0, 90)}`);
                }
            }
        });
}

if (stories.length < 10) {
    console.error(`✗ fixtures: found only ${stories.length} story files; the scan is looking in the wrong place`);
    process.exit(1);
}
if (found.length) {
    for (const f of found) console.error(`✗ fixtures: ${f}`);
    console.error(`\n${found.length} real service(s) in story fixtures; use a plainly fictional name`);
    process.exit(1);
}
console.log(`✓ fixtures: ${stories.length} story files name no real relay, wallet or explorer as a customer`);
