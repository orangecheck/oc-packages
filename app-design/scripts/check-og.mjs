#!/usr/bin/env node
/*
 * ./og draws through next/og as a site's route does: each tone renders a
 * 1200×630 PNG, the fonts are Inter's and JetBrains Mono's WOFF files carried
 * inline, the card's colours are tokens.css's, a title that would run long
 * stops at three lines, and the bento draws at 1200×630 and 1920×1080. Run
 * after `yarn build`; OG_REVIEW_DIR=<dir> also writes every image drawn.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
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
const sharp = require('sharp');

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ og: ${msg}`);
        failures++;
    }
};

// The fonts: Inter 300 and 400 (Latin, Latin Extended) and JetBrains Mono 400, decoded once.
const fonts = og.ogFonts();
const want = ['Inter 300', 'Inter 400', 'Inter 300', 'Inter 400', 'JetBrains Mono 400'];
check(fonts.map((f) => `${f.name} ${f.weight}`).join() === want.join(), `ogFonts: not ${want.join(', ')}`);
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
const satoriSafe = (tree) =>
    tree.every((e) => typeof e.type !== 'string' || ['svg', 'polygon', 'rect', 'g', 'img'].includes(e.type) || e.props.style?.display === 'flex' || e.props.style?.display === 'block' || e.props.children == null || typeof e.props.children === 'string');

// The review images, when asked for: OG_REVIEW_DIR=<dir> writes each card and bento drawn here.
const reviewDir = process.env.OG_REVIEW_DIR;
if (reviewDir) mkdirSync(reviewDir, { recursive: true });
async function draw(el, size, name) {
    const res = new ImageResponse(el, { ...size, fonts });
    const png = new Uint8Array(await res.arrayBuffer());
    if (reviewDir) writeFileSync(join(reviewDir, `${name}.png`), png);
    const view = new DataView(png.buffer);
    return { type: res.headers.get('content-type'), width: view.getUint32(16), height: view.getUint32(20), bytes: png.length, png };
}

// Each tone's ground and ink are the 2.0 tokens: paper, ink, burnt and brand.
const L = appColors.light;
const grounds = { paper: [L.background, L.foreground], ink: [appColors.dark.card, appColors.dark.foreground], burnt: [L.burnt, L.burntForeground], brand: [L.brand, L.brandForeground] };
for (const [tone, [bg, fg]] of Object.entries(grounds)) {
    const card = h(og.OgCard, { title: 'Prove who signed it, and when.', eyebrow: 'OC Stamp', product: 'stamp', host: 'stamp.ochk.io', tone });
    const tree = walk(card);
    const root = tree[0].props.style;
    check(root.background === bg && root.color === fg, `${tone}: the card's ground and ink are not the 2.0 tokens`);
    check(satoriSafe(tree), `${tone}: a box with children is not flex, as satori needs`);
    // The title is light display type; the label row and the host are mono.
    check(tree.some((e) => e.props.style?.lineClamp === 3 && e.props.style.fontWeight === 300), `${tone}: the title is not Inter 300`);
    check(tree.filter((e) => String(e.props.style?.fontFamily ?? '').startsWith("'JetBrains Mono'")).length === 2, `${tone}: the label row and the host are not mono`);
    try {
        const png = await draw(card, og.OG_SIZE, `og-card-${tone}`);
        check(png.type === 'image/png' && png.width === 1200 && png.height === 630, `${tone}: not a 1200×630 PNG`);
    } catch (e) {
        check(false, `${tone}: next/og cannot draw the card (${String(e.message).slice(0, 100)})`);
    }
}

// A title of long words stops at three lines.
const long = walk(h(og.OgCard, { title: 'W'.repeat(40) + ' ' + 'w'.repeat(60) + ' ' + 'w'.repeat(30) }));
const title = long.find((e) => e.props.style?.lineClamp !== undefined);
check(title?.props.style.lineClamp === 3 && title.props.style.display === 'block', 'a long title is not held to three lines');
check(String(title?.props.children ?? '').length <= 120, 'a long title is not cut');

// The large mark is on unless the caller leaves it out; baked art takes its place.
{
    const art = (props) => walk(h(og.OgCard, { title: 'bc1q… holds 0.5 BTC', ...props })).filter((e) => e.type === 'svg' && e.props.width === 640).length;
    check(art({}) === 1, 'the large mark is not on by default');
    check(art({ mark: false }) === 0, 'mark: false still draws the large mark');
    const withArt = walk(h(og.OgCard, { title: 'A page', art: og.ogArt.ditherMark }));
    check(withArt.some((e) => e.type === 'img' && e.props.src === og.ogArt.ditherMark.src) && !withArt.some((e) => e.type === 'svg' && e.props.width === 640), 'art does not take the mark’s place');
    const res = await draw(h(og.OgCard, { title: 'bc1q… holds 0.5 BTC', mark: false }), og.OG_SIZE, 'og-card-no-mark');
    check(res.type === 'image/png' && res.bytes > 1000, 'mark: false does not draw');
    const drawn = await draw(h(og.OgCard, { title: 'Your keys, your account.', eyebrow: 'Lumen Notes', tone: 'burnt', art: og.ogArt.ditherMark }), og.OG_SIZE, 'og-card-burnt-art');
    check(drawn.width === 1200 && drawn.height === 630, 'a card with art does not draw at 1200×630');
}

// The baked art is PNG, as satori draws it, in its data URIs.
for (const [name, a] of Object.entries(og.ogArt)) check(a.src.startsWith('data:image/png;base64,iVBORw0KGgo'), `ogArt.${name} is not a PNG data URI`);

// The bento: tiles as props, rounded on the sheet, at 1200×630 and 1920×1080.
{
    const tiles = {
        hero: { tone: 'paper', title: 'Lumen Notes keeps your notes on your own keys.', lockup: true, art: { ...og.ogArt.ditherMarkInk, place: 'right' } },
        top: [
            { tone: 'brand', numeral: '0', body: 'passwords to remember' },
            { tone: 'ink', numeral: '0', body: 'forms to fill in' },
        ],
        wide: { tone: 'burnt', numeral: '80%', body: ['of every shelf at Halfway Books', 'is second hand.'], art: { ...og.ogArt.halftoneField, place: 'left' } },
        row: [
            { tone: 'paper', title: 'Notes that stay yours.', art: { ...og.ogArt.ditherMarkInk, place: 'center' } },
            { tone: 'ink', footer: 'lumen.example', art: { ...og.ogArt.ditherMark, place: 'center' } },
            { tone: 'surface', kicker: 'Receipts', title: 'Every order comes with a receipt.', rows: [['Paperback', '£4'], ['Hardback', '£9']], footer: 'Example data' },
            { tone: 'brand', kicker: 'For shops', title: 'Listing a book is free.', body: 'halfway.example/shops' },
        ],
    };
    const tree = walk(h(og.OgBento, tiles));
    check(tree[0].props.style.background === appColors.light.muted, 'the bento sheet is not --muted (#e4e0dc)');
    const rounded = tree.filter((e) => e.props.style?.borderRadius !== undefined);
    check(rounded.length === 4 && rounded.every((e) => e.props.style.borderRadius > 0), 'the 1200×630 bento is not four rounded tiles');
    check(satoriSafe(tree), 'bento: a box with children is not flex, as satori needs');
    const social = walk(h(og.OgBento, { ...tiles, size: 'social' })).filter((e) => e.props.style?.borderRadius !== undefined);
    check(social.length === 8 && social.every((e) => Math.round(e.props.style.borderRadius) === 24), 'the 1920×1080 bento is not eight tiles rounded 24px');
    const a = await draw(h(og.OgBento, tiles), og.OG_SIZE, 'og-bento-1200');
    check(a.type === 'image/png' && a.width === 1200 && a.height === 630, 'the bento is not a 1200×630 PNG');
    const b = await draw(h(og.OgBento, { ...tiles, size: 'social' }), og.SOCIAL_SIZE, 'og-bento-1920');
    check(b.type === 'image/png' && b.width === 1920 && b.height === 1080, 'the social bento is not a 1920×1080 PNG');

    // Text never sits on a band of art: the halftone tile's text column starts after the band.
    for (const t of [tree, walk(h(og.OgBento, { ...tiles, size: 'social' }))]) {
        const tile = t.find((e) => e.props.style?.borderRadius !== undefined && walk(e).some((x) => x.type === 'img' && x.props.src === og.ogArt.halftoneField.src));
        const band = tile && walk(tile).find((x) => x.props.style?.position === 'absolute');
        check(band && tile.props.style.paddingLeft >= band.props.style.left + band.props.style.width && band.props.style.width <= tile.props.style.width / 3, 'the halftone tile’s text overlaps its dot band, or the band is past a third');
    }

    // Art keeps its own aspect ratio in every tile, within a pixel: a band is cropped, never squashed.
    const arts = Object.values(og.ogArt);
    for (const [size, t] of [['1200', tree], ['1920', walk(h(og.OgBento, { ...tiles, size: 'social' }))]]) {
        for (const img of t.filter((e) => e.type === 'img')) {
            const a = arts.find((x) => x.src === img.props.src);
            const want = (img.props.height * a.width) / a.height;
            check(Math.abs(img.props.width - want) <= 1, `${size}: art drawn at ${img.props.width}×${img.props.height}, not its own ${a.width}:${a.height}`);
        }
    }

    // Tiles clip their own art: the gutters and margins stay the sheet's colour, pixel for pixel.
    const { data, info } = await sharp(Buffer.from(b.png)).raw().toBuffer({ resolveWithObject: true });
    const sheet = appColors.light.muted.slice(1).match(/../g).map((x) => parseInt(x, 16));
    const g = og.ogBentoGrid('social');
    const off = [];
    const row = (y, x0, x1) => {
        for (let x = x0; x < x1; x++) {
            const i = (y * info.width + x) * info.channels;
            if (data[i] !== sheet[0] || data[i + 1] !== sheet[1] || data[i + 2] !== sheet[2]) off.push(`${x},${y}`);
        }
    };
    const col = (x, y0, y1) => {
        for (let y = y0; y < y1; y++) row(y, x, x + 1);
    };
    // The gutter under rows 1 and 2, and the one right of the large tile.
    for (let y = g.top + 2 * g.rowH + g.gap; y < g.top + 2 * g.rowH + 2 * g.gap; y++) row(y, 0, info.width);
    for (let x = g.left + 2 * g.colW + g.gap; x < g.left + 2 * g.colW + 2 * g.gap; x++) col(x, 0, g.top + 2 * g.rowH + g.gap);
    // The margins.
    for (let y = 0; y < g.top; y++) row(y, 0, info.width);
    col(0, 0, info.height);
    check(off.length === 0, `art runs past its tile into the sheet at ${off.length} pixels (first ${off.slice(0, 3).join(' ')})`);
}

if (failures) {
    console.error(`\n${failures} og failure(s)`);
    process.exit(1);
}
console.log(`✓ og: ${checks} checks; Inter 300/400 and JetBrains Mono inline, four tones in the 2.0 tokens, a 1200×630 PNG per tone, three lines at most, art in the mark's place, the bento at 1200×630 and 1920×1080`);
