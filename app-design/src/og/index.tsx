import type { ReactElement } from 'react';

import { MARK_FACES, MARK_POINTS } from '../brand/mark';
import { appColors } from '../tokens';
import inter500 from './fonts/inter-latin-500-normal.woff';
import inter600 from './fonts/inter-latin-600-normal.woff';
import inter500Ext from './fonts/inter-latin-ext-500-normal.woff';
import inter600Ext from './fonts/inter-latin-ext-600-normal.woff';

/*
 * The family's share card, for next/og's ImageResponse: the lockup and the
 * site's word, an eyebrow, the page's title at display size, the host.
 * Inline styles and flex only, as satori draws them. The route that serves
 * it (a title from the query, a cache header) is the site's, or site-kit's:
 *
 *     import { ImageResponse } from 'next/og';
 *     import { OG_SIZE, OgCard, ogFonts } from '@orangecheck/app-design/og';
 *
 *     new ImageResponse(<OgCard product="stamp" eyebrow="OC Stamp" title={title} host="stamp.ochk.io" />,
 *         { ...OG_SIZE, fonts: ogFonts() });
 *
 * The fonts are Inter (OFL-1.1, ./fonts/OFL.txt), Latin and Latin Extended
 * at 500 and 600, inlined so the route reads no file. A title in another
 * script needs a font of its own passed after these.
 */

export const OG_SIZE = { width: 1200, height: 630 } as const;

// The page's own colours, from tokens.css: every text pair here is one the contrast check holds to AA.
const { dark: D, light: L, brand: B } = appColors;
const TONES = {
    // The ink band: dark in both modes, as the deck's closing band.
    ink: { bg: D.background, fg: D.foreground, muted: D.mutedForeground, accent: D.accentInk, line: D.hairlineStrong, tile: D.iconTile, ring: D.iconRing },
    paper: { bg: L.background, fg: L.foreground, muted: L.mutedForeground, accent: L.accentInk, line: L.hairlineStrong, tile: B.ink, ring: B.ink },
} as const;

export interface OgCardProps {
    /** The page's title, at display size. Three lines at most; a longer one is cut. */
    title: string;
    /** One line above it, in the accent: "OC Stamp", "Docs · Reference". */
    eyebrow?: string;
    /** The site's word beside the lockup: "stamp", "vault". */
    product?: string;
    /** At the foot: "stamp.ochk.io". */
    host?: string;
    tone?: keyof typeof TONES;
}

function MarkSvg({ width, x = 0, y = 0 }: { width: number; x?: number; y?: number }) {
    return (
        <svg width={width} height={width / 2} viewBox="0 0 16 8" style={{ position: 'absolute', left: x, top: y }}>
            <polygon points={MARK_POINTS.left} fill={MARK_FACES.left} />
            <polygon points={MARK_POINTS.right} fill={MARK_FACES.right} />
            <polygon points={MARK_POINTS.top} fill={MARK_FACES.top} />
        </svg>
    );
}

/** The 1200×630 card. Satori-safe: every box is flex, every style inline. */
export function OgCard({ title, eyebrow, product, host, tone = 'ink' }: OgCardProps): ReactElement {
    const t = TONES[tone];
    // Long titles step down a size before they would run past three lines.
    const size = title.length > 70 ? 58 : title.length > 40 ? 68 : 80;
    const text = title.length > 120 ? `${title.slice(0, 119).trimEnd()}…` : title;
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
                fontFamily: 'Inter',
                padding: '64px 72px 56px',
            }}
        >
            {/* The mark, large and cut by the edge: the closing band's art, in two colours of light. */}
            <div style={{ position: 'absolute', right: -150, bottom: -140, width: 640, height: 320, display: 'flex', opacity: tone === 'ink' ? 0.9 : 1 }}>
                <MarkSvg width={640} />
            </div>
            <div style={{ display: 'flex', alignItems: 'center', fontSize: 34, fontWeight: 500, letterSpacing: -0.4 }}>
                <svg width={56} height={56} viewBox="0 0 24 24">
                    <rect width="24" height="24" rx="6.25" fill={t.tile} stroke={t.ring} strokeWidth="0.5" />
                    <g transform="translate(4.25 8.1) scale(0.97)">
                        <polygon points={MARK_POINTS.left} fill={MARK_FACES.left} />
                        <polygon points={MARK_POINTS.right} fill={MARK_FACES.right} />
                        <polygon points={MARK_POINTS.top} fill={MARK_FACES.top} />
                    </g>
                </svg>
                <span style={{ marginLeft: 18 }}>orangecheck</span>
                {product ? (
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                        <div style={{ width: 2, height: 36, background: t.line, margin: '0 22px' }} />
                        <span>{product}</span>
                    </div>
                ) : null}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', maxWidth: 860 }}>
                {eyebrow ? <div style={{ fontSize: 28, fontWeight: 500, color: t.accent, marginBottom: 22 }}>{eyebrow}</div> : null}
                {/* Three lines at most, whatever the words: the art keeps the lower right. */}
                <div style={{ display: 'block', lineClamp: 3, fontSize: size, fontWeight: 600, lineHeight: 1.04, letterSpacing: -size * 0.03 }}>
                    {text}
                </div>
            </div>
            <div style={{ display: 'flex', fontSize: 24, fontWeight: 500, color: t.muted }}>{host ?? 'ochk.io'}</div>
        </div>
    );
}

function decode(base64: string): ArrayBuffer {
    const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
    return bytes.buffer;
}

let cached: { name: string; data: ArrayBuffer; weight: 500 | 600; style: 'normal' }[] | null = null;

/** Inter for ImageResponse's `fonts`: Latin first, then Latin Extended, at 500 and 600. Decoded once. */
export function ogFonts(): { name: string; data: ArrayBuffer; weight: 500 | 600; style: 'normal' }[] {
    cached ??= [
        { name: 'Inter', data: decode(inter500), weight: 500, style: 'normal' },
        { name: 'Inter', data: decode(inter600), weight: 600, style: 'normal' },
        { name: 'Inter', data: decode(inter500Ext), weight: 500, style: 'normal' },
        { name: 'Inter', data: decode(inter600Ext), weight: 600, style: 'normal' },
    ];
    return cached;
}
