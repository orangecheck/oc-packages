#!/usr/bin/env node
/*
 * design.ochk.io's share card, drawn by app-design's own OgCard, so the system's showcase
 * shares the same 2.0 card every family site does. The card is committed as og.png and
 * finish-static.mjs copies it beside the built page; run this again when the card's words or
 * app-design's OgCard change. It reads app-design's build: `yarn --cwd ../app-design build` first.
 */
import { writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const pkg = join(here, '..', '..', 'app-design');
const require = createRequire(join(pkg, 'package.json'));
const { ImageResponse } = await import(require.resolve('next/og.js'));
const { createElement: h } = require('react');
const og = await import(join(pkg, 'dist', 'og.mjs'));

const card = h(og.OgCard, {
    title: 'Tokens, parts and pages, as stories.',
    eyebrow: 'Design system',
    product: 'design',
    host: 'design.ochk.io',
    tone: 'paper',
});
const res = new ImageResponse(card, { ...og.OG_SIZE, fonts: og.ogFonts() });
const png = new Uint8Array(await res.arrayBuffer());
writeFileSync(join(here, 'og.png'), png);
const view = new DataView(png.buffer);
console.log(`✓ og: .storybook/og.png, ${view.getUint32(16)}×${view.getUint32(20)}, ${png.length} bytes`);
