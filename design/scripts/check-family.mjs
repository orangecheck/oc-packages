// check-family — the family registry links to live frontends only. me.ochk.io's
// pages are retiring into ochk.app (me.ochk.io stays as the API), and fleet.ochk.io is
// gone, so no registry entry and no rendered footer link may point at either.
// Runs against the built dist (CI builds before `yarn test`).
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// The CJS build: the ESM one imports `next/link` bare, which only a bundler resolves.
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'chrome.js');
if (!existsSync(dist)) {
    console.error('check-family: build first (yarn build); dist/chrome.js is missing');
    process.exit(1);
}
const require = createRequire(import.meta.url);
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { FAMILY_PROPERTIES, findFamilyProperty, OcFamilyFooter } = require(dist);

const RETIRED = /\b(me|fleet)\.ochk\.io\b/;
const fails = [];
const expect = (name, got, want) => {
    if (JSON.stringify(got) !== JSON.stringify(want)) fails.push(`${name}: got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};

for (const p of FAMILY_PROPERTIES) {
    if (RETIRED.test(`${p.origin} ${p.hostname} ${p.label}`)) fails.push(`${p.slug} points at a retired frontend: ${p.origin}`);
}

const me = findFamilyProperty('me');
expect('the me product is served at ochk.app', [me?.origin, me?.hostname, me?.label], ['https://ochk.app', 'ochk.app', 'ochk.app']);

const footer = renderToStaticMarkup(
    React.createElement(OcFamilyFooter, { family: 'products', brand: { wordmark: 'x', tagline: 'y' } })
);
expect('footer products link to ochk.app', footer.includes('href="https://ochk.app"'), true);
expect('footer links to no retired frontend', RETIRED.test(footer), false);

if (fails.length) {
    console.error('check-family:\n  ' + fails.join('\n  '));
    process.exit(1);
}
console.log('check-family: ok');
