#!/usr/bin/env node
/*
 * ./og draws through next/og as a site's route does: each tone renders a
 * 1200×630 PNG, the fonts are Inter's and JetBrains Mono's WOFF files carried
 * inline, the card's colours are tokens.css's, a title that would run long
 * stops at three lines, and the bento draws at 1200×630 and 1920×1080. The
 * mono font holds every character each family caller's mono fields can draw
 * (scripts/og/mono-inventory.mjs), read from its cmap; each caller's real
 * cards draw with no warning; a character outside it draws in Inter with a
 * warning; Latin Extended draws from Inter's own Latin Extended files; and
 * nothing fetches a font. A card asked for the pixel logo draws its cells
 * whole, the word in the card's ink. Run after `yarn build`; OG_REVIEW_DIR=<dir> also
 * writes every image drawn.
 */
import { createRequire } from 'node:module';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { CARDS, INVENTORY, fieldClass, fieldReal } from './og/mono-inventory.mjs';
import { cmapCodePoints } from './og/woff.mjs';

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

// No network. next/og asks Google Fonts for a glyph no loaded font has (its loadAdditionalAsset), and a share card must
// never wait on that. Every render here runs with fetch trapped: a data: URI (next/og's own wasm) passes, anything else
// is recorded and refused. Only the trap's own control, below, may fetch.
const fetched = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
    const url = String(input?.url ?? input);
    if (url.startsWith('data:')) return realFetch(input, init);
    fetched.push(url);
    return Promise.reject(new Error(`check-og: no network (${url.slice(0, 80)})`));
};

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ og: ${msg}`);
        failures++;
    }
};

// The fonts: Inter 300 and 400, Inter's Latin Extended cut at 300 and 400 as a family of its own, JetBrains Mono 400,
// decoded once.
const fonts = og.ogFonts();
const want = ['Inter 300', 'Inter 400', 'Inter Latin Ext 300', 'Inter Latin Ext 400', 'JetBrains Mono 400'];
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

// Art drawn at its own pixels keeps its bake's few colours; satori smooths any image it scales, which
// rings each dot with dozens more. The opaque colours of a baked PNG, and those inside a rect of a render.
const rgb = (d, i) => (d[i] << 16) | (d[i + 1] << 8) | d[i + 2];
async function bakeColours(src) {
    const { data, info } = await sharp(Buffer.from(src.split(',')[1], 'base64')).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = new Set();
    for (let i = 0; i < info.width * info.height * 4; i += 4) if (data[i + 3] === 255) out.add(rgb(data, i));
    return out;
}
async function renderColours(png, { left, top, width, height }, skip = () => false) {
    const { data, info } = await sharp(Buffer.from(png)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const out = new Set();
    for (let y = Math.max(0, top); y < Math.min(info.height, top + height); y++)
        for (let x = Math.max(0, left); x < Math.min(info.width, left + width); x++) if (!skip(x, y)) out.add(rgb(data, (y * info.width + x) * 4));
    return out;
}
const hexRgb = (h) => parseInt(h.slice(1), 16);
const stray = (seen, bake, ground) => [...seen].filter((c) => !bake.has(c) && c !== hexRgb(ground)).length;

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

// The pixel logo, asked for by `logo`: a lockup of whole-pixel cells in every tone, the word in the tone's ink,
// drawn by next/og where the classic one is. With no `logo` a card draws the default (crawlers send no cookie).
for (const [tone, [, fg]] of Object.entries(grounds)) {
    const props = { title: 'Prove who signed it, and when.', eyebrow: 'OC Stamp', product: 'stamp', host: 'stamp.ochk.io', tone };
    const tree = walk(h(og.OgCard, { ...props, logo: 'pixel' }));
    const svgs = tree.filter((e) => e.type === 'svg' && e.props.shapeRendering === 'crispEdges');
    const whole = svgs.every((e) => {
        const [, , w, ht] = e.props.viewBox.split(' ').map(Number);
        return Number.isInteger(e.props.width / w) && e.props.width / w === e.props.height / ht;
    });
    check(svgs.length === 2 && whole, `${tone}: logo="pixel" is not the pixel check and word in whole-pixel cells`);
    check(tree.some((e) => e.type === 'path' && e.props.fill === fg), `${tone}: the pixel word is not in the card's ink`);
    check(!walk(h(og.OgCard, props)).some((e) => e.props.shapeRendering === 'crispEdges'), `${tone}: with no logo the card does not draw the default, classic`);
    try {
        const a = await draw(h(og.OgCard, { ...props, logo: 'pixel' }), og.OG_SIZE, `og-card-${tone}-pixel`);
        const b = await draw(h(og.OgCard, props), og.OG_SIZE, `og-card-${tone}-classic`);
        check(a.width === 1200 && a.height === 630 && Buffer.compare(Buffer.from(a.png), Buffer.from(b.png)) !== 0, `${tone}: the pixel card does not draw, or draws as the classic one`);
    } catch (e) {
        check(false, `${tone}: next/og cannot draw the pixel card (${String(e.message).slice(0, 100)})`);
    }
}

// A title of long words stops at three lines.
const long = walk(h(og.OgCard, { title: 'W'.repeat(40) + ' ' + 'w'.repeat(60) + ' ' + 'w'.repeat(30) }));
const title = long.find((e) => e.props.style?.lineClamp !== undefined);
check(title?.props.style.lineClamp === 3 && title.props.style.display === 'block', 'a long title is not held to three lines');
check(String(title?.props.children ?? '').length <= 120, 'a long title is not cut');

// The large art is on unless the caller leaves it out: the tone's dithered mark, its coarse 240px bake
// doubled (480×240, each pixel twice), the peach top on ink and burnt, the ink top on paper, ink alone on brand (its orange
// sides would vanish into the ground). Baked art takes its
// place. The lockup's small mark stays vector, so it keeps its edges when a feed shows the card at 300px.
{
    const imgs = (props) => walk(h(og.OgCard, { title: 'bc1q… holds 0.5 BTC', ...props })).filter((e) => e.type === 'img');
    const dither = { paper: og.ogArt.ditherMarkInk240x2, ink: og.ogArt.ditherMark240x2, burnt: og.ogArt.ditherMark240x2, brand: og.ogArt.ditherMarkOnBrand240x2 };
    for (const [tone, a] of Object.entries(dither)) {
        const d = imgs({ tone });
        check(d.length === 1 && d[0].props.src === a.src && d[0].props.width === 480 && d[0].props.height === 240, `${tone}: the default art is not the tone's dithered mark at 480×240`);
    }
    check(imgs({}).length === 1 && imgs({})[0].props.src === og.ogArt.ditherMark240x2.src, 'the dithered mark is not on by default');
    // Its box sits on a 4px grid, so the doubled mark's 4px dots land on whole pixels when a feed shows the card at 300.
    const slot = walk(h(og.OgCard, { title: 'A page' })).find((e) => e.props.style?.position === 'absolute')?.props.style;
    check(slot && (1200 - 480 - slot.right) % 4 === 0 && (630 - 240 - slot.bottom) % 4 === 0, 'the dithered mark is off the 4px grid');
    // Each tone's card draws it at its own pixels: its art box, as rendered, holds the bake's colours and the ground's, no others.
    for (const [tone, [bg]] of Object.entries(grounds)) {
        const card = h(og.OgCard, { title: 'Prove who signed it, and when.', eyebrow: 'OC Stamp', product: 'stamp', host: 'stamp.ochk.io', tone });
        const tree = walk(card);
        const img = tree.find((e) => e.type === 'img');
        const box = tree.find((e) => e.props.style?.position === 'absolute').props.style;
        const rect = { left: 1200 + -box.right - img.props.width, top: 630 + -box.bottom - img.props.height, width: img.props.width, height: img.props.height };
        const { png } = await draw(card, og.OG_SIZE, `og-card-${tone}-art`);
        const n = stray(await renderColours(png, rect), await bakeColours(img.props.src), bg);
        check(n === 0, `${tone}: the default art's box holds ${n} colours its bake and the ground do not: it is smoothed, not drawn at its own pixels`);
    }
    check(imgs({ mark: false }).length === 0, 'mark: false still draws the large art');
    const svgs = walk(h(og.OgCard, { title: 'A page' })).filter((e) => e.type === 'svg');
    check(svgs.length === 1 && svgs[0].props.width <= 60, 'the card’s marks are not one small vector mark in the lockup');
    const withArt = imgs({ art: og.ogArt.halftoneField });
    check(withArt.length === 1 && withArt[0].props.src === og.ogArt.halftoneField.src, 'art does not take the dithered mark’s place');
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

    // A tile with no art and no foot text draws the tone's dithered mark (the 240px bake) at its lower
    // right, doubled or at 1×, the larger that fits 55% of its width and 45% of its height, at its own
    // pixels. A tile with foot text (rows, body, footer, lockup) and no art draws none.
    const bakes = {
        mark: [og.ogArt.ditherMark240, og.ogArt.ditherMark240x2],
        ink: [og.ogArt.ditherMarkInk240, og.ogArt.ditherMarkInk240x2],
        brand: [og.ogArt.ditherMarkOnBrand240, og.ogArt.ditherMarkOnBrand240x2],
    };
    const bare = {
        hero: { tone: 'paper', title: 'Lumen Notes keeps your notes on your own keys.' },
        top: [{ tone: 'ink', numeral: '0' }, { tone: 'brand', numeral: '0' }],
        wide: { tone: 'burnt', title: 'Every second-hand shelf, one search.', body: 'halfway.example' },
        row: [
            { tone: 'surface', kicker: 'Receipts', title: 'Every order comes with a receipt.' },
            { tone: 'brand', title: 'Listing a book is free.', footer: 'halfway.example' },
            { tone: 'ink', title: 'Notes that stay yours.', lockup: true },
            { tone: 'paper', kicker: 'For shops', rows: [['Listing', 'free']] },
        ],
    };
    const shade = { paper: 'ink', brand: 'brand', surface: 'ink', ink: 'mark', burnt: 'mark' };
    for (const size of ['og', 'social']) {
        const cells = walk(h(og.OgBento, { ...bare, size })).filter((e) => e.props.style?.borderRadius !== undefined);
        const given = [bare.hero, ...bare.top, bare.wide, ...(size === 'social' ? bare.row : [])];
        check(cells.length === given.length, `${size}: the bare bento has ${cells.length} tiles, not ${given.length}`);
        cells.forEach((tile, i) => {
            const spec = given[i];
            const { width, height } = tile.props.style;
            const img = walk(tile).find((e) => e.type === 'img');
            const footText = Boolean(spec.rows || spec.body || spec.footer || spec.lockup);
            if (footText) return check(!img, `${size}: a ${spec.tone} tile with foot text draws art it was not given`);
            const [one, two] = bakes[shade[spec.tone]];
            const fits = (a) => a.width <= width * 0.55 && a.height <= height * 0.45;
            const want = fits(two) ? two : one;
            check(img?.props.src === want.src, `${size}: a bare ${spec.tone} tile (${width}×${height}) does not draw its tone's dithered mark ${want === two ? 'doubled' : 'at 1×'}, the larger that fits`);
            const box = walk(tile).find((e) => e.props.style?.position === 'absolute')?.props.style;
            check(box && box.left + box.width === width && box.top + box.height === height, `${size}: a bare ${spec.tone} tile's dithered mark is not at its lower right`);
            if (fits(want)) check(img.props.width === want.width && img.props.height === want.height, `${size}: a bare ${spec.tone} tile's dithered mark is not drawn at its own pixels`);
        });
        const drawn = await draw(h(og.OgBento, { ...bare, size }), size === 'social' ? og.SOCIAL_SIZE : og.OG_SIZE, `og-bento-bare-${size}`);
        check(drawn.type === 'image/png', `${size}: the bare bento does not draw`);
        // A tile's mark, drawn at its own pixels, keeps its bake's colours, away from the tile's rounded corner.
        if (size === 'social') {
            const g = og.ogBentoGrid('social');
            const at = [
                [0, g.left, g.top],
                [1, g.left + 2 * g.colW + 2 * g.gap, g.top],
            ];
            for (const [i, x0, y0] of at) {
                const tile = cells[i];
                const img = walk(tile).find((e) => e.type === 'img');
                const box = walk(tile).find((e) => e.props.style?.position === 'absolute').props.style;
                const { width, height, borderRadius: r, background } = tile.props.style;
                const rect = { left: x0 + box.left, top: y0 + box.top, width: box.width, height: box.height };
                const corner = (x, y) => x >= x0 + width - r && y >= y0 + height - r;
                const n = stray(await renderColours(drawn.png, rect, corner), await bakeColours(img.props.src), background);
                check(n === 0, `social: a bare ${given[i].tone} tile's mark (${img.props.width}px) holds ${n} colours its bake and the tile do not: it is smoothed`);
            }
        }
    }

    // Every tile image's visible rect stays inside its own art box, and the box inside its tile: the box
    // clips what it holds (the halftone band's crop among them), and sits within the tile's own bounds.
    for (const [size, t] of [
        ['1200', tree],
        ['1920', walk(h(og.OgBento, { ...tiles, size: 'social' }))],
        ['1200 bare', walk(h(og.OgBento, bare))],
        ['1920 bare', walk(h(og.OgBento, { ...bare, size: 'social' }))],
    ]) {
        for (const tile of t.filter((e) => e.props.style?.borderRadius !== undefined)) {
            const { width, height, overflow } = tile.props.style;
            check(overflow === 'hidden', `${size}: a tile does not clip to its own rounded edge`);
            for (const box of walk(tile).filter((e) => e.props.style?.position === 'absolute')) {
                const s = box.props.style;
                const halftone = walk(box).some((x) => x.type === 'img' && x.props.src === og.ogArt.halftoneField.src);
                check(s.overflow === 'hidden', `${size}: ${halftone ? 'the halftone band' : 'an art box'} does not clip its image`);
                check(s.left >= 0 && s.top >= 0 && s.left + s.width <= width && s.top + s.height <= height, `${size}: an art box (${s.left},${s.top} ${s.width}×${s.height}) is not inside its ${width}×${height} tile`);
                for (const v of [s.left, s.top, s.width, s.height]) check(Number.isInteger(v), `${size}: an art box is off the pixel grid (${v})`);
            }
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

// The mono font is JetBrains Mono cut to what the family's mono fields can draw (scripts/og/subset-mono.mjs). Every
// caller's field, by the class of characters it can hold, and its real strings today (scripts/og/mono-inventory.mjs),
// draw only what the font's cmap maps, read from the bytes ogFonts() hands satori.
const monoCmap = cmapCodePoints(fonts.find((f) => f.name === 'JetBrains Mono').data);
const cp = (c) => `U+${c.codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
const uncovered = (inventory) =>
    inventory.flatMap((e) => {
        const miss = [...new Set([...fieldClass(e), ...fieldReal(e)])].filter((c) => !monoCmap.has(c.codePointAt(0)));
        return miss.length ? [`${e.caller} ${e.field}: ${miss.map(cp).join(' ')}`] : [];
    });
const gaps = uncovered(INVENTORY);
check(gaps.length === 0, `a caller's mono field can hold characters the mono font lacks: ${gaps.join('; ')}`);
// The plant below, as a caller, is caught.
const PLANT = [
    { caller: 'plant', field: 'OgCard.eyebrow', upper: true, source: 'a literal', strings: ['É'] },
    { caller: 'plant', field: 'OgCard.host', source: 'a literal', strings: ['€'] },
];
check(uncovered([...INVENTORY, ...PLANT]).join('; ') === 'plant OgCard.eyebrow: U+00C9; plant OgCard.host: U+20AC', 'the coverage check does not catch a plant caller whose mono fields hold É and €');
const wide = INVENTORY.filter((e) => e.wide);

/** What a render warns and fetches while it runs. */
async function watched(fn) {
    const warns = [];
    const errors = [];
    const from = fetched.length;
    const { warn, error } = console;
    console.warn = (...a) => warns.push(a.join(' '));
    console.error = (...a) => errors.push(a.join(' '));
    try {
        return { value: await fn(), warns, errors, fetches: fetched.slice(from) };
    } finally {
        Object.assign(console, { warn, error });
    }
}
const pixels = async (png) => sharp(Buffer.from(png)).raw().toBuffer();

// Each caller's real cards draw with no warning and no fetch: every mono character is the font's own.
for (const { name, props } of CARDS) {
    const { value: png, warns, fetches } = await watched(() => draw(h(og.OgCard, props), og.OG_SIZE, `caller-${name}`));
    check(png.width === 1200 && png.height === 630, `${name}: not a 1200×630 PNG`);
    check(warns.length === 0, `${name} warns: ${warns.join(' | ')}`);
    check(fetches.length === 0, `${name} fetches ${fetches.join(' ')}`);
}

// ./og's warning knows the font: each character of its cmap draws quietly, and each Latin-1 one it lacks is named.
{
    const all = [...monoCmap].map((c) => String.fromCodePoint(c)).join('');
    const quiet = await watched(() => walk(h(og.OgCard, { title: 'x', host: all })));
    check(quiet.warns.length === 0, `a character of the mono font draws with a warning: ${quiet.warns.join(' | ')}`);
    const lacks = [];
    for (let c = 0xa0; c <= 0xff; c++) if (!monoCmap.has(c)) lacks.push(String.fromCodePoint(c));
    const loud = await watched(() => walk(h(og.OgCard, { title: 'x', host: lacks.join('') })));
    check(loud.warns.length === 1 && lacks.every((c) => loud.warns[0].includes(cp(c))), `the warning does not name each of ${lacks.length} Latin-1 characters the mono font lacks`);
}

// The net. A mono field holding a character no caller draws today (É, €) draws it in Inter, says so, fetches nothing.
{
    const interCmap = cmapCodePoints(fonts[1].data);
    check(interCmap.has(0xc9) && interCmap.has(0x20ac), 'Inter 400 Latin has no É or €');
    // É and € as words of their own: satori draws each from Inter outright. The card is the same pixels as one drawn
    // with no mono font loaded at all, where the label row and the host are Inter’s, so it holds no .notdef.
    const plant = h(og.OgCard, { title: 'A plant', eyebrow: 'É', host: '€', mark: false });
    const p = await watched(() => draw(plant, og.OG_SIZE, 'og-plant'));
    const noMono = fonts.filter((f) => f.name !== 'JetBrains Mono');
    const inter = await watched(async () => new Uint8Array(await new ImageResponse(plant, { ...og.OG_SIZE, fonts: noMono }).arrayBuffer()));
    if (reviewDir) writeFileSync(join(reviewDir, 'og-plant-inter.png'), inter.value);
    check((await pixels(p.value.png)).equals(await pixels(inter.value)), 'the plant’s É and € are not the pixels Inter draws them in');
    const blank = await draw(h(og.OgCard, { title: 'A plant', eyebrow: ' ', host: ' ', mark: false }), og.OG_SIZE, 'og-plant-blank');
    check(!(await pixels(blank.png)).equals(await pixels(p.value.png)), 'the plant draws nothing for É and €');
    const said = [
        '@orangecheck/app-design/og: OgCard eyebrow has U+00C9, which the mono font lacks: drawn in Inter',
        '@orangecheck/app-design/og: OgCard host has U+20AC, which the mono font lacks: drawn in Inter',
    ];
    check(p.warns.join('\n') === said.join('\n'), `the plant does not warn once per field by code point: ${p.warns.join(' | ') || 'nothing'}`);
    check(p.fetches.length === 0 && inter.fetches.length === 0, `the plant fetches ${[...p.fetches, ...inter.fetches].join(' ')}`);

    // Inside a word, satori draws the word in the mono font and swaps in Inter's glyph for the one it lacks. The trap's
    // controls put Ạ, then Ặ, in the same places: Latin letters no loaded font has, so next/og asks Google Fonts for a
    // font, which the trap refuses, and each draws as .notdef (empty in the cut: hb-subset drops its outline), so the two
    // controls match. Were É or € drawn as .notdef, its half of the top band would match the controls'.
    const card = (eyebrow, host) => h(og.OgCard, { title: 'A plant', eyebrow, host, mark: false });
    const inWord = await watched(() => draw(card('Café', 'prix-€.example'), og.OG_SIZE, 'og-plant-word'));
    const beforeControls = fetched.length;
    const controls = [
        await watched(() => draw(card('CafẠ', 'prix-Ạ.example'), og.OG_SIZE, 'og-plant-notdef')),
        await watched(() => draw(card('CafẶ', 'prix-Ặ.example'), og.OG_SIZE, 'og-plant-notdef-2')),
    ];
    check(inWord.fetches.length === 0, `the plant in a word fetches ${inWord.fetches.join(' ')}`);
    check(
        inWord.warns.length === 2 && inWord.warns[0].includes('OgCard eyebrow has U+00C9,') && inWord.warns[1].includes('OgCard host has U+20AC,'),
        `the plant in a word does not warn by field: ${inWord.warns.join(' | ')}`
    );
    for (const c of controls)
        check(
            c.fetches.some((u) => u.startsWith('https://fonts.googleapis.com/')),
            `the trap misses next/og's font fetch (${c.fetches.length})`
        );
    const band = async (png, left) => sharp(Buffer.from(png)).extract({ left, top: 40, width: 600, height: 80 }).raw().toBuffer();
    for (const [left, what] of [
        [0, 'É in the eyebrow'],
        [600, '€ in the host'],
    ]) {
        const box = await band(controls[0].value.png, left);
        check(box.equals(await band(controls[1].value.png, left)), `the controls' .notdef glyphs differ where ${what} sits`);
        check(!box.equals(await band(inWord.value.png, left)), `${what}, inside a word, draws as .notdef`);
    }
    fetched.splice(beforeControls);
}

// Latin Extended. satori keeps one font per family and weight, so Inter's Latin Extended files under 'Inter' were never
// drawn, and a letter only they have made next/og fetch a font while a route rendered. A card with Latin Extended-A in
// its title (Inter 300) and in a mono field (drawn from Inter 400) fetches nothing, is the pixels Inter's Latin Extended
// files draw, and draws none of those letters as .notdef.
const latinExt = { title: 'Ševčík signed in Łódź, Gdańsk and Plzeň', host: 'gdańsk.example' };
{
    const file = (name) => readFileSync(join(pkg, 'src/og/fonts', name));
    const carried = (name, weight) => fonts.find((f) => f.weight === weight && Buffer.from(f.data).equals(file(`${name}-${weight}-normal.woff`)));
    const [latin, ext] = ['inter-latin', 'inter-latin-ext'].map((name) => [300, 400].map((w) => carried(name, w)));
    check([...latin, ...ext].every(Boolean), 'ogFonts() does not carry Inter Latin and Latin Extended at 300 and 400');
    const [latinCmap, extCmap] = ['inter-latin', 'inter-latin-ext'].map((name) => cmapCodePoints(file(`${name}-300-normal.woff`)));
    const text = [...new Set(latinExt.title + latinExt.host)];
    // The letters only the Latin Extended files map: Inter's Latin files lack them, and the mono cut is ASCII and three more.
    const only = text.filter((c) => [extCmap, latinCmap, monoCmap].map((m) => m.has(c.codePointAt(0))).join() === 'true,false,false');
    check(
        only.length === 6 && only.every((c) => c.codePointAt(0) >= 0x100 && c.codePointAt(0) <= 0x17f),
        `the card's letters only Inter Latin Extended maps are ${only.map(cp).join(' ')}, not six of Latin Extended-A`
    );
    check(
        text.every((c) => [latinCmap, extCmap, monoCmap].some((m) => m.has(c.codePointAt(0)))),
        'the Latin Extended card holds a character no loaded font maps'
    );

    const card = ({ title, host }) => h(og.OgCard, { title, host, mark: false });
    const swapped = (c, to) => ({ title: latinExt.title.replaceAll(c, to), host: latinExt.host.replaceAll(c, to) });
    const drawn = await watched(() => draw(card(latinExt), og.OG_SIZE, 'og-latin-ext'));
    check(drawn.fetches.length === 0, `a Latin Extended card fetches ${drawn.fetches.join(' ')}`);
    check(
        drawn.warns.join('\n') === '@orangecheck/app-design/og: OgCard host has U+0144, which the mono font lacks: drawn in Inter',
        `the Latin Extended card does not warn of ń in its host alone: ${drawn.warns.join(' | ') || 'nothing'}`
    );
    const px = await pixels(drawn.value.png);

    // The reference loads Inter's Latin Extended files as the 'Inter' family itself, first for every letter, and its Latin
    // files as a family after them, for the letters Latin Extended lacks.
    const extFirst = [...ext, ...latin, fonts.find((f) => f.name === 'JetBrains Mono')].map((f, i) => ({ ...f, name: i < 2 ? 'Inter' : i < 4 ? 'Inter Latin' : f.name }));
    const ref = await watched(async () => new Uint8Array(await new ImageResponse(card(latinExt), { ...og.OG_SIZE, fonts: extFirst }).arrayBuffer()));
    if (reviewDir) writeFileSync(join(reviewDir, 'og-latin-ext-reference.png'), ref.value);
    check(ref.fetches.length === 0, `the Latin Extended reference fetches ${ref.fetches.join(' ')}`);
    check(px.equals(await pixels(ref.value)), 'the Latin Extended card is not the pixels Inter Latin Extended draws');

    // No .notdef: each of those letters swapped for Ạ, then for Ặ (letters no loaded font has, so next/og's fetch for
    // them is refused and they draw as .notdef) gives two cards of the same pixels, and the card itself differs from them.
    const beforeControls = fetched.length;
    for (const c of only) {
        const hex = c.codePointAt(0).toString(16);
        const controls = [
            await watched(() => draw(card(swapped(c, 'Ạ')), og.OG_SIZE, `og-latin-ext-notdef-${hex}`)),
            await watched(() => draw(card(swapped(c, 'Ặ')), og.OG_SIZE, `og-latin-ext-notdef-${hex}-2`)),
        ];
        check(
            controls.every((x) => x.fetches.some((u) => u.startsWith('https://fonts.googleapis.com/'))),
            `${cp(c)}: the trap misses next/og's font fetch for its controls`
        );
        const notdef = await pixels(controls[0].value.png);
        check(notdef.equals(await pixels(controls[1].value.png)), `${cp(c)}: its controls' .notdef glyphs differ`);
        check(!px.equals(notdef), `${cp(c)} draws as .notdef`);
    }
    fetched.splice(beforeControls);
}
check(fetched.length === 0, `./og fetched ${fetched.length} URL(s): ${fetched.slice(0, 3).join(' ')}`);

if (failures) {
    console.error(`\n${failures} og failure(s)`);
    process.exit(1);
}
console.log(`✓ og: ${checks} checks; Inter 300/400 and JetBrains Mono inline, four tones in the 2.0 tokens, a 1200×630 PNG per tone, three lines at most, the dithered mark as default art and the vector mark in the lockup, the bento at 1200×630 and 1920×1080 with each image inside its art box`);
console.log(`✓ og: the mono font's ${monoCmap.size} characters hold ${INVENTORY.length} caller fields; ${CARDS.length} real cards draw quietly; É and € draw in Inter, with a warning; no fetch`);
console.log(`✓ og: "${latinExt.title}" and "${latinExt.host}" draw from Inter Latin Extended, no .notdef, no fetch; Ạ and Ặ, in neither Inter cut, still fetch`);
for (const e of wide) console.log(`  wide: ${e.caller} ${e.field} is free user text. The font holds its spec class; ./og warns of any other character, drawn in Inter where Inter has it.`);
