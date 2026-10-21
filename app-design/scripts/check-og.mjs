#!/usr/bin/env node
/*
 * ./og draws through next/og as a site's route does: each tone renders a
 * 1200×630 PNG, the fonts are Inter's WOFF files carried inline, the card's
 * colours are tokens.css's, and a title that would run long stops at three
 * lines. Run after `yarn build`.
 */
import { createRequire } from 'node:module';
import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
if (!existsSync(join(pkg, 'dist/og.mjs'))) {
    console.error('✗ og: dist/og.mjs is missing; run yarn build first');
    process.exit(1);
}
const require = createRequire(join(pkg, 'package.json'));
const { ImageResponse } = await import(require.resolve('next/og.js'));
const { createElement: h, isValidElement, Children } = require('react');
const og = await import(join(pkg, 'dist/og.mjs'));
const { appColors } = require(join(pkg, 'dist/tokens.js'));

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ og: ${msg}`);
        failures++;
    }
};

// The fonts: four WOFF files, Inter at 500 and 600, decoded once.
const fonts = og.ogFonts();
check(fonts.length === 4 && fonts.every((f) => f.name === 'Inter' && [500, 600].includes(f.weight)), 'ogFonts: not Inter at 500 and 600, Latin and Latin Extended');
check(fonts.every((f) => f.data instanceof ArrayBuffer && new TextDecoder().decode(new Uint8Array(f.data, 0, 4)) === 'wOFF'), 'ogFonts: a font is not a WOFF file');
check(og.ogFonts() === fonts, 'ogFonts: decodes on every call');

// Every element's inline styles, flattened, to read what satori will draw.
function walk(el, out = []) {
    if (!isValidElement(el)) return out;
    if (typeof el.type === 'function') return walk(el.type(el.props), out);
    out.push(el);
    Children.forEach(el.props.children, (c) => walk(c, out));
    return out;
}

for (const tone of ['ink', 'paper']) {
    const palette = tone === 'ink' ? appColors.dark : appColors.light;
    const tree = walk(h(og.OgCard, { title: 'Prove who signed it, and when.', eyebrow: 'OC Stamp', product: 'stamp', host: 'stamp.ochk.io', tone }));
    const root = tree[0].props.style;
    check(root.background === palette.background && root.color === palette.foreground, `${tone}: the card's ground and ink are not the page's tokens`);
    check(tree.every((e) => typeof e.type !== 'string' || ['svg', 'polygon', 'rect', 'g'].includes(e.type) || e.props.style?.display === 'flex' || e.props.style?.display === 'block' || e.props.children == null || typeof e.props.children === 'string'), `${tone}: a box with children is not flex, as satori needs`);
    try {
        const res = new ImageResponse(h(og.OgCard, { title: 'Prove who signed it, and when.', eyebrow: 'OC Stamp', product: 'stamp', host: 'stamp.ochk.io', tone }), { ...og.OG_SIZE, fonts });
        const png = new Uint8Array(await res.arrayBuffer());
        const view = new DataView(png.buffer);
        check(res.headers.get('content-type') === 'image/png' && view.getUint32(16) === 1200 && view.getUint32(20) === 630, `${tone}: not a 1200×630 PNG`);
    } catch (e) {
        check(false, `${tone}: next/og cannot draw the card (${String(e.message).slice(0, 100)})`);
    }
}

// A title of long words stops at three lines.
const long = walk(h(og.OgCard, { title: 'W'.repeat(40) + ' ' + 'w'.repeat(60) + ' ' + 'w'.repeat(30) }));
const title = long.find((e) => e.props.style?.lineClamp !== undefined);
check(title?.props.style.lineClamp === 3 && title.props.style.display === 'block', 'a long title is not held to three lines');
check(String(title?.props.children ?? '').length <= 120, 'a long title is not cut');

// The large mark is on unless the caller leaves it out (a badge whose owner chose no mark).
{
    const art = (props) => walk(h(og.OgCard, { title: 'bc1q… holds 0.5 BTC', ...props })).filter((e) => e.type === 'svg' && e.props.width === 640).length;
    check(art({}) === 1, 'the large mark is not on by default');
    check(art({ mark: false }) === 0, 'mark: false still draws the large mark');
    const res = new ImageResponse(h(og.OgCard, { title: 'bc1q… holds 0.5 BTC', mark: false }), { ...og.OG_SIZE, fonts });
    check(res.headers.get('content-type') === 'image/png' && (await res.arrayBuffer()).byteLength > 1000, 'mark: false does not draw');
}

if (failures) {
    console.error(`\n${failures} og failure(s)`);
    process.exit(1);
}
console.log(`✓ og: ${checks} checks; Inter inline, the card in tokens.css's colours, a 1200×630 PNG per tone, three lines at most, the mark left out on request`);
