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

if (failures) {
    console.error(`\n${failures} og failure(s)`);
    process.exit(1);
}
console.log(`✓ og: ${checks} checks; Inter 300/400 and JetBrains Mono inline, four tones in the 2.0 tokens, a 1200×630 PNG per tone, three lines at most, the dithered mark as default art and the vector mark in the lockup, the bento at 1200×630 and 1920×1080 with each image inside its art box`);
