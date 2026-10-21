#!/usr/bin/env node
/*
 * design.ochk.io's served page names itself. Storybook writes
 * "<title>storybook - Storybook</title>" and no description; manager-head's
 * script renames the tab only once JavaScript runs, so a link preview or a
 * crawler saw "storybook - Storybook". This rewrites the built index.html's
 * head and copies the share card beside it. It fails the build when the
 * template moves, rather than ship the old head unnoticed.
 */
import { copyFileSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'storybook-static');
const file = join(out, 'index.html');

const TITLE = 'orangecheck design system';
const DESCRIPTION =
    'The orangecheck family’s design system: tokens, parts, the family’s chrome and page blocks, as stories, in light and dark, at a phone’s width and a desk’s.';
const URL = 'https://design.ochk.io/';
const esc = (s) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

let html = readFileSync(file, 'utf8');
const title = /<title>[^<]*<\/title>/;
if (!title.test(html)) {
    console.error('✗ finish-static: no <title> in storybook-static/index.html; the template moved');
    process.exit(1);
}
const head = [
    `<title>${esc(TITLE)}</title>`,
    `<meta name="description" content="${esc(DESCRIPTION)}" />`,
    `<link rel="canonical" href="${URL}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="orangecheck" />`,
    `<meta property="og:title" content="${esc(TITLE)}" />`,
    `<meta property="og:description" content="${esc(DESCRIPTION)}" />`,
    `<meta property="og:url" content="${URL}" />`,
    `<meta property="og:image" content="${URL}og.png" />`,
    `<meta property="og:image:width" content="1200" />`,
    `<meta property="og:image:height" content="630" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
].join('\n    ');
html = html.replace(title, head);
writeFileSync(file, html);
copyFileSync(join(here, 'og.png'), join(out, 'og.png'));
console.log(`✓ finish-static: index.html names "${TITLE}", with its description, canonical and card`);
