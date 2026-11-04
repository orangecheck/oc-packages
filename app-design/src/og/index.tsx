import type { ReactElement, ReactNode } from 'react';

import { MARK_FACES, MARK_POINTS } from '../brand/mark';
import { appColors } from '../tokens';
import ditherMark240 from '../../art/dither-mark-240.png';
import ditherMark480 from '../../art/dither-mark-480.png';
import ditherMarkOnBrand240 from '../../art/dither-mark-brand-240.png';
import ditherMarkOnBrand480 from '../../art/dither-mark-brand-480.png';
import ditherMarkInk240 from '../../art/dither-mark-ink-240.png';
import ditherMarkInk480 from '../../art/dither-mark-ink-480.png';
import ditherField from '../../art/dither-field.png';
import halftoneField from '../../art/halftone-field.png';
import inter300 from './fonts/inter-latin-300-normal.woff';
import inter400 from './fonts/inter-latin-400-normal.woff';
import inter300Ext from './fonts/inter-latin-ext-300-normal.woff';
import inter400Ext from './fonts/inter-latin-ext-400-normal.woff';
import mono400 from './fonts/jetbrains-mono-latin-400-normal.woff';

/*
 * The family's share images, for next/og's ImageResponse: `OgCard`, one page's
 * card at 1200×630, and `OgBento`, rounded tiles on a sheet at 1200×630 or
 * 1920×1080. Inline styles and flex only, as satori draws them; every colour
 * is a /tokens value. The route that serves them is the site's, or site-kit's:
 *
 *     import { ImageResponse } from 'next/og';
 *     import { OG_SIZE, OgCard, ogFonts } from '@orangecheck/app-design/og';
 *
 *     new ImageResponse(<OgCard product="stamp" eyebrow="OC Stamp" title={title} host="stamp.ochk.io" />,
 *         { ...OG_SIZE, fonts: ogFonts() });
 *
 * The fonts are Inter 300 (display) and 400 (the wordmark, body), Latin and
 * Latin Extended, and JetBrains Mono 400 (the label row), Latin: OFL-1.1,
 * ./fonts/OFL.txt and ./fonts/OFL-JetBrainsMono.txt, inlined so a route reads
 * no file. A title in another script needs a font of its own passed after these.
 *
 * The art is baked (scripts/art/bake.mjs, ./art in the package): satori cannot
 * run a canvas, so dither and halftone come in as PNG data URIs (`ogArt`). With
 * no art of its own, a card or a tile draws the dithered mark large; the small
 * mark in the lockup stays vector, which keeps its edges when a feed shows the
 * card at 300px.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;
/** A social post's size, for `OgBento` with `size="social"`. */
export const SOCIAL_SIZE = { width: 1920, height: 1080 } as const;

const { dark: D, light: L } = appColors;
const INK = L.foreground;
const PEACH = MARK_FACES.top;
const MONO = "'JetBrains Mono', 'OCA JetBrains Mono', monospace";

interface Tone {
    bg: string;
    fg: string;
    muted: string;
    /** The label row's text. */
    label: string;
    /** The label row's square, and a numeral's colour. */
    accent: string;
    line: string;
    /** The mark's top face: ink on a light ground, peach on a dark one. */
    top: string;
    /** A brand ground takes the ink mark: one colour at the mark's face opacities. */
    monoMark: boolean;
    /** The default art's dithered mark: the peach top on a dark ground, the ink top on a light one, ink alone on brand. */
    dither: 'mark' | 'ink' | 'brand';
}

// Every text pair here is one check-contrast holds to AA (the 2.0 tokens).
const TONES = {
    paper: {
        bg: L.background,
        fg: L.foreground,
        muted: L.mutedForeground,
        label: L.accentInk,
        accent: L.accentDisplay,
        line: L.hairlineStrong,
        top: INK,
        monoMark: false,
        dither: 'ink',
    },
    ink: {
        bg: D.card,
        fg: D.foreground,
        muted: D.mutedForeground,
        label: D.accentInk,
        accent: D.accentDisplay,
        line: D.hairlineStrong,
        top: PEACH,
        monoMark: false,
        dither: 'mark',
    },
    burnt: {
        bg: L.burnt,
        fg: L.burntForeground,
        muted: L.burntMuted,
        label: L.burntAccent,
        accent: L.burntAccent,
        line: L.burntEmber,
        top: PEACH,
        monoMark: false,
        dither: 'mark',
    },
    brand: {
        bg: L.brand,
        fg: L.brandForeground,
        muted: L.brandForeground,
        label: L.brandForeground,
        accent: L.brandForeground,
        line: L.brandForeground,
        top: INK,
        monoMark: true,
        dither: 'brand',
    },
} as const satisfies Record<string, Tone>;

/** A tile's ground: the card tones, plus the white product surface (a receipt). */
const TILE_TONES = {
    ...TONES,
    surface: {
        bg: L.surface,
        fg: L.surfaceForeground,
        muted: L.mutedForeground,
        label: L.accentInk,
        accent: L.accentDisplay,
        line: L.border,
        top: INK,
        monoMark: false,
        dither: 'ink',
    },
} as const satisfies Record<string, Tone>;

export type OgTone = keyof typeof TONES;
export type OgTileTone = keyof typeof TILE_TONES;

export interface OgImage {
    src: string;
    width: number;
    height: number;
}

// The build inlines each PNG as base64; a bundler that resolves it to a URL instead (Storybook) passes the URL.
const png = (v: string) => (v.startsWith('iVBORw0KGgo') ? `data:image/png;base64,${v}` : v);

/** Baked art as PNG data URIs, for an OG route (satori draws PNG, not AVIF). Sites import ./art/* for pages. */
export const ogArt = {
    ditherMark: { src: png(ditherMark480), width: 480, height: 240 },
    ditherMarkInk: { src: png(ditherMarkInk480), width: 480, height: 240 },
    ditherMark240: { src: png(ditherMark240), width: 240, height: 120 },
    ditherMarkInk240: { src: png(ditherMarkInk240), width: 240, height: 120 },
    ditherMarkOnBrand: { src: png(ditherMarkOnBrand480), width: 480, height: 240 },
    ditherMarkOnBrand240: { src: png(ditherMarkOnBrand240), width: 240, height: 120 },
    ditherField: { src: png(ditherField), width: 1200, height: 320 },
    halftoneField: { src: png(halftoneField), width: 320, height: 320 },
} as const satisfies Record<string, OgImage>;

/**
 * The default art: the tone's dithered mark from its coarse 240px bake, drawn at
 * whole multiples. Its 2px dots stay whole when a feed shows a 1200px card at
 * 300 (a quarter); the 480 bake's 3px dots beat against that into moiré.
 */
const ditherMark = (tone: Tone): OgImage => ({ mark: ogArt.ditherMark240, ink: ogArt.ditherMarkInk240, brand: ogArt.ditherMarkOnBrand240 })[tone.dither];

/**
 * A tile's default art: the dithered mark at 2× or 1×, the larger that fits the
 * lower right (55% of the tile's width, 45% of its height). A tile too small
 * for 1× takes it scaled down to fit.
 */
function defaultTileArt(tone: Tone, width: number, height: number): NonNullable<OgTile['art']> {
    const mark = ditherMark(tone);
    const scale = [2, 1].find((x) => mark.width * x <= width * 0.55 && mark.height * x <= height * 0.45) ?? 1;
    return { ...mark, width: mark.width * scale, height: mark.height * scale, place: 'right' };
}

function MarkSvg({ width, tone }: { width: number; tone: Tone }) {
    const face = (name: 'left' | 'right' | 'top') =>
        tone.monoMark
            ? {
                  fill: INK,
                  fillOpacity: name === 'top' ? 1 : name === 'left' ? 0.6 : 0.3,
              }
            : { fill: name === 'top' ? tone.top : MARK_FACES[name] };
    return (
        <svg width={width} height={width / 2} viewBox="0 0 16 8">
            <polygon points={MARK_POINTS.left} {...face('left')} />
            <polygon points={MARK_POINTS.right} {...face('right')} />
            <polygon points={MARK_POINTS.top} {...face('top')} />
        </svg>
    );
}

/** The lockup: the mark and the lowercase wordmark in Inter 400, then the site's word after a rule. */
function Lockup({ tone, size, product }: { tone: Tone; size: number; product?: string }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                fontSize: size,
                fontWeight: 400,
                letterSpacing: -size * 0.02,
            }}
        >
            <MarkSvg width={size * 1.4} tone={tone} />
            <span style={{ marginLeft: size * 0.4 }}>orangecheck</span>
            {product ? (
                <div style={{ display: 'flex', alignItems: 'center' }}>
                    <div
                        style={{
                            width: 2,
                            height: size * 1.05,
                            background: tone.line,
                            margin: `0 ${size * 0.6}px`,
                        }}
                    />
                    <span>{product}</span>
                </div>
            ) : null}
        </div>
    );
}

/** The label row: a square in the accent and a mono label, uppercase and tracked 0.08em. */
function LabelRow({ tone, size, children }: { tone: Tone; size: number; children: ReactNode }) {
    return (
        <div
            style={{
                display: 'flex',
                alignItems: 'center',
                fontFamily: MONO,
                fontSize: size,
                fontWeight: 400,
                letterSpacing: size * 0.08,
                textTransform: 'uppercase',
                color: tone.label,
            }}
        >
            <div
                style={{
                    width: size * 0.6,
                    height: size * 0.6,
                    background: tone.accent,
                    marginRight: size * 0.7,
                }}
            />
            <span>{children}</span>
        </div>
    );
}

export interface OgCardProps {
    /** The page's title, at display size. Three lines at most; a longer one is cut. */
    title: string;
    /** The label row above it, in mono: "OC Stamp", "Docs · Reference". */
    eyebrow?: string;
    /** The site's word beside the lockup: "stamp", "vault". */
    product?: string;
    /** At the top right, in mono: "stamp.ochk.io". */
    host?: string;
    tone?: OgTone;
    /** The large dithered mark at the lower right, 480px wide. On by default; off, the title takes the card's width. */
    mark?: boolean;
    /** Baked art in the mark's place (an `ogArt` entry, or the site's own PNG), at the lower right. */
    art?: OgImage;
}

/** The 1200×630 card. The card is the image, so it is square: rounding is for tiles laid on a sheet (`OgBento`). */
export function OgCard({ title, eyebrow, product, host, tone = 'ink', mark = true, art: given }: OgCardProps): ReactElement {
    const t = TONES[tone];
    // With no art of its own, the card draws the tone's dithered mark at 2×, 480px.
    const art = given ?? (mark ? { ...ditherMark(t), width: 480, height: 240 } : undefined);
    // Long titles step down a size before they would run past three lines.
    const size = title.length > 70 ? 60 : title.length > 40 ? 70 : 82;
    const text = title.length > 120 ? `${title.slice(0, 119).trimEnd()}…` : title;
    const hasArt = Boolean(art);
    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                overflow: 'hidden',
                background: t.bg,
                color: t.fg,
                // Inter as ogFonts() names it; 'OCA Inter' where the card is shown in a page (a story).
                fontFamily: "Inter, 'OCA Inter', sans-serif",
                padding: '64px 72px 56px',
            }}
        >
            {/* The art, large and cut by the edge, at the lower right. */}
            {art ? (
                <div
                    style={{
                        position: 'absolute',
                        right: -40,
                        // On a 4px grid (left 760, top 416), so the 2× mark's 4px dots land on whole pixels at a quarter.
                        bottom: -26,
                        display: 'flex',
                    }}
                >
                    <img src={art.src} width={art.width} height={art.height} alt="" />
                </div>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {/* A mono label at each end, as the page's section bar: the eyebrow, then the host. */}
                <div
                    style={{
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        marginBottom: 30,
                    }}
                >
                    {eyebrow ? (
                        <LabelRow tone={t} size={22}>
                            {eyebrow}
                        </LabelRow>
                    ) : (
                        <div style={{ display: 'flex' }} />
                    )}
                    <div
                        style={{
                            display: 'flex',
                            fontFamily: MONO,
                            fontSize: 22,
                            letterSpacing: 22 * 0.02,
                            color: t.muted,
                        }}
                    >
                        {host ?? 'ochk.io'}
                    </div>
                </div>
                {/* Three lines at most, whatever the words: the art keeps the lower right. */}
                <div
                    style={{
                        display: 'block',
                        lineClamp: 3,
                        fontSize: size,
                        fontWeight: 300,
                        lineHeight: 1.02,
                        letterSpacing: -size * 0.04,
                        maxWidth: hasArt ? 900 : 1056,
                    }}
                >
                    {text}
                </div>
            </div>
            <div style={{ display: 'flex' }}>
                <Lockup tone={t} size={30} product={product} />
            </div>
        </div>
    );
}

/** One tile of `OgBento`. Each part is optional; a tile shows what it is given. */
export interface OgTile {
    tone: OgTileTone;
    /** The mono label at the top. */
    kicker?: string;
    /** A large light numeral: "0", "80%". */
    numeral?: string;
    /** Display text, at the top. */
    title?: string;
    /** Lines at the foot. */
    body?: string | readonly string[];
    /** Label and value rows in mono (a receipt). */
    rows?: readonly (readonly [string, string])[];
    /** Mono fine print at the foot. */
    footer?: string;
    /**
     * Baked art: `fill` covers the tile, `left` and `right` sit at that edge, `center` in the middle.
     * Left out, a tile with no foot text (rows, body, footer, lockup) draws the dithered mark at the lower right.
     */
    art?: OgImage & { place?: 'fill' | 'left' | 'right' | 'center' };
    /** The orangecheck lockup at the foot. */
    lockup?: boolean;
}

export interface OgBentoProps {
    /** `og`: 1200×630, the large tile and three beside it. `social`: 1920×1080, with a row of four below. */
    size?: 'og' | 'social';
    /** The large tile, two rows high on the left. */
    hero: OgTile;
    /** The two tiles of the first row on the right. */
    top: readonly [OgTile, OgTile];
    /** The wide tile under them. */
    wide: OgTile;
    /** `social` only: the row of four along the foot. */
    row?: readonly [OgTile, OgTile, OgTile, OgTile];
}

/**
 * Where a tile's art sits, in whole pixels and inside the tile, so the tile's
 * rounded clip is the only edge it meets: art bleeds into its own corner, never
 * into the gutter.
 */
function artBox(art: NonNullable<OgTile['art']>, width: number, height: number, k: number) {
    const w = art.width * k;
    const h = art.height * k;
    const r = Math.round;
    switch (art.place ?? 'right') {
        case 'fill':
            return { left: 0, top: 0, width, height };
        case 'left':
            // A band down the left edge, at most a third of the tile: the text starts after it.
            return { left: 0, top: 0, width: r(Math.min((art.width * height) / art.height, width / 3)), height };
        case 'center': {
            // Centred art keeps clear of the tile's edges: at most 60% of its width.
            const cw = Math.min(w, width * 0.6);
            const ch = (cw * art.height) / art.width;
            return { left: r((width - cw) / 2), top: r((height - ch) / 2 - 16 * k), width: r(cw), height: r(ch) };
        }
        default: {
            // At the lower right, art leaves the foot's left half to the lockup and the body.
            const rw = Math.min(w, width * 0.55);
            const rh = (rw * h) / w;
            return { left: r(width - rw), top: r(height - rh), width: r(rw), height: r(rh) };
        }
    }
}

/**
 * The art's drawn size in its box: always its own aspect ratio. A band or a fill
 * covers the box at the art's height and is cropped by the box, never squashed.
 */
function artSize(art: NonNullable<OgTile['art']>, box: { width: number; height: number }) {
    const place = art.place ?? 'right';
    if (place !== 'left' && place !== 'fill') return { width: box.width, height: box.height };
    const scale = Math.max(box.width / art.width, box.height / art.height);
    return { width: Math.round(art.width * scale), height: Math.round(art.height * scale) };
}

function Tile({ tile, width, height, k, big }: { tile: OgTile; width: number; height: number; k: number; big?: boolean }) {
    const t = TILE_TONES[tile.tone];
    const pad = 32 * k;
    const body = typeof tile.body === 'string' ? [tile.body] : (tile.body ?? []);
    // With no art of its own, a tile whose foot is free of text draws the dithered mark there, at a whole multiple.
    const footFree = !tile.rows?.length && body.length === 0 && !tile.footer && !tile.lockup;
    const art = tile.art ?? (footFree ? defaultTileArt(t, width, height) : undefined);
    const box = art ? artBox(art, width, height, tile.art ? k : 1) : null;
    // Text never sits on art in a band: the column starts after the band's right edge.
    const band = art?.place === 'left' && box ? box.left + box.width : 0;
    const titleSize = (big ? 64 : 38) * k;
    return (
        <div
            style={{
                width,
                height,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                position: 'relative',
                overflow: 'hidden',
                borderRadius: Math.round(24 * k),
                background: t.bg,
                color: t.fg,
                padding: pad,
                paddingLeft: band + pad,
            }}
        >
            {art && box ? (
                <div style={{ position: 'absolute', display: 'flex', overflow: 'hidden', ...box }}>
                    <img src={art.src} {...artSize(art, box)} alt="" />
                </div>
            ) : null}
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {tile.kicker ? (
                    <div style={{ display: 'flex', marginBottom: 18 * k }}>
                        <LabelRow tone={t} size={15 * k}>
                            {tile.kicker}
                        </LabelRow>
                    </div>
                ) : null}
                {tile.numeral ? (
                    <div
                        style={{
                            display: 'flex',
                            fontSize: (big ? 160 : 140) * k,
                            fontWeight: 300,
                            lineHeight: 0.85,
                            letterSpacing: -8 * k,
                            color: tile.tone === 'brand' ? t.fg : t.accent,
                        }}
                    >
                        {tile.numeral}
                    </div>
                ) : null}
                {tile.title ? (
                    <div
                        style={{
                            display: 'block',
                            lineClamp: big ? 4 : 3,
                            fontSize: titleSize,
                            fontWeight: 300,
                            lineHeight: 1.04,
                            letterSpacing: -titleSize * 0.035,
                            maxWidth: big ? width * 0.62 : width - 2 * pad,
                        }}
                    >
                        {tile.title}
                    </div>
                ) : null}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
                {tile.rows?.length ? (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            fontFamily: MONO,
                            fontSize: 17 * k,
                            marginBottom: 18 * k,
                        }}
                    >
                        {tile.rows.map(([label, value]) => (
                            <div
                                key={label}
                                style={{
                                    display: 'flex',
                                    justifyContent: 'space-between',
                                    marginTop: 12 * k,
                                }}
                            >
                                <span style={{ color: t.muted }}>{label}</span>
                                <span>{value}</span>
                            </div>
                        ))}
                    </div>
                ) : null}
                {body.map((line) => (
                    <div
                        key={line}
                        style={{
                            display: 'flex',
                            fontSize: (big ? 28 : 24) * k,
                            fontWeight: 400,
                            lineHeight: 1.3,
                            letterSpacing: -0.2 * k,
                        }}
                    >
                        {line}
                    </div>
                ))}
                {tile.footer ? (
                    <div
                        style={{
                            display: 'flex',
                            fontFamily: MONO,
                            fontSize: 14 * k,
                            color: t.muted,
                            marginTop: 6 * k,
                        }}
                    >
                        {tile.footer}
                    </div>
                ) : null}
                {tile.lockup ? <Lockup tone={t} size={26 * k} /> : null}
            </div>
        </div>
    );
}

/**
 * The bento's grid in whole pixels, so every tile edge lands on a pixel: the
 * margin (48px at 1920, 30px at 1200, the remainder split about it), the
 * gutter (16 / 10), a column's width, a row's height, and the type scale `k`
 * (a 1920×1080 row is 317px tall).
 */
export function ogBentoGrid(size: 'og' | 'social' = 'og', withRow = size === 'social') {
    const { width: W, height: H } = size === 'social' ? SOCIAL_SIZE : OG_SIZE;
    const margin = size === 'social' ? 48 : 30;
    const gap = size === 'social' ? 16 : 10;
    const rows = withRow ? 3 : 2;
    const colW = Math.floor((W - 2 * margin - 3 * gap) / 4);
    const rowH = Math.floor((H - 2 * margin - (rows - 1) * gap) / rows);
    const left = Math.floor((W - 4 * colW - 3 * gap) / 2);
    const top = Math.floor((H - rows * rowH - (rows - 1) * gap) / 2);
    return { left, top, gap, colW, rowH, rows, k: rowH / 317 };
}

/**
 * Tiles on the social sheet (`--muted`, #e4e0dc), rounded 24px: pictures of
 * products are rounded, the page is not (PLAN §1). At 1920×1080 the grid is a
 * 48px margin and 16px gutters, as the bento image; at 1200×630 it keeps the
 * first two rows, which is what a 1.91:1 card can carry.
 */
export function OgBento({ size = 'og', hero, top, wide, row }: OgBentoProps): ReactElement {
    const foot = size === 'social' ? row : undefined;
    const { left, top: y0, gap, colW, rowH, k } = ogBentoGrid(size, Boolean(foot));
    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                background: L.muted,
                paddingLeft: left,
                paddingTop: y0,
                fontFamily: "Inter, 'OCA Inter', sans-serif",
            }}
        >
            <div style={{ display: 'flex' }}>
                <Tile tile={hero} width={2 * colW + gap} height={2 * rowH + gap} k={k} big />
                <div style={{ display: 'flex', flexDirection: 'column', marginLeft: gap }}>
                    <div style={{ display: 'flex' }}>
                        <Tile tile={top[0]} width={colW} height={rowH} k={k} />
                        <div style={{ display: 'flex', marginLeft: gap }}>
                            <Tile tile={top[1]} width={colW} height={rowH} k={k} />
                        </div>
                    </div>
                    <div style={{ display: 'flex', marginTop: gap }}>
                        <Tile tile={wide} width={2 * colW + gap} height={rowH} k={k} />
                    </div>
                </div>
            </div>
            {foot ? (
                <div style={{ display: 'flex', marginTop: gap }}>
                    {foot.map((tile, i) => (
                        <div key={i} style={{ display: 'flex', marginLeft: i ? gap : 0 }}>
                            <Tile tile={tile} width={colW} height={rowH} k={k} />
                        </div>
                    ))}
                </div>
            ) : null}
        </div>
    );
}

function decode(base64: string): ArrayBuffer {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return bytes.buffer;
}

type OgFont = {
    name: 'Inter' | 'JetBrains Mono';
    data: ArrayBuffer;
    weight: 300 | 400;
    style: 'normal';
};
let cached: OgFont[] | null = null;

/** The fonts for ImageResponse's `fonts`: Inter 300 and 400 (Latin, then Latin Extended), JetBrains Mono 400. Decoded once. */
export function ogFonts(): OgFont[] {
    cached ??= [
        { name: 'Inter', data: decode(inter300), weight: 300, style: 'normal' },
        { name: 'Inter', data: decode(inter400), weight: 400, style: 'normal' },
        { name: 'Inter', data: decode(inter300Ext), weight: 300, style: 'normal' },
        { name: 'Inter', data: decode(inter400Ext), weight: 400, style: 'normal' },
        {
            name: 'JetBrains Mono',
            data: decode(mono400),
            weight: 400,
            style: 'normal',
        },
    ];
    return cached;
}
