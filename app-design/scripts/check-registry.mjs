#!/usr/bin/env node
/*
 * The registry's links land on working pages, on the live sites: each
 * protocol's tools (`toolHref`) and docs (`docsHref`) answer 200 with no
 * redirect. A tool site's root 308s back to ochk.io/<verb>, so a toolHref
 * pointing there sent people in a circle. Reads the built ./family. Set
 * OCA_OFFLINE=1 to skip where there is no network.
 */
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

if (process.env.OCA_OFFLINE === '1') {
    console.log('- registry: skipped (OCA_OFFLINE=1)');
    process.exit(0);
}
const here = dirname(fileURLToPath(import.meta.url));
const { PROTOCOLS } = createRequire(import.meta.url)(join(here, '../dist/family.js'));

let failures = 0;
let checks = 0;
const answer = async (url) => {
    // Twice before calling it, so a single dropped request is not a failure.
    for (let i = 0; i < 2; i++) {
        try {
            const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': 'app-design-check-registry' } });
            return `${res.status}${res.headers.get('location') ? ` → ${res.headers.get('location')}` : ''}`;
        } catch (e) {
            if (i === 1) return `no answer (${e.cause?.code ?? e.message})`;
        }
    }
};
for (const p of PROTOCOLS) {
    for (const key of ['toolHref', 'docsHref']) {
        checks++;
        const got = await answer(p[key]);
        if (got !== '200') {
            console.error(`✗ registry: ${p.slug} ${key} ${p[key]} answers ${got}, not 200`);
            failures++;
        }
    }
}
if (failures) {
    console.error(`\n${failures} registry failure(s)`);
    process.exit(1);
}
console.log(`✓ registry: ${checks} links, each protocol's tools and docs answer 200 with no redirect`);
