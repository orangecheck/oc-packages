'use client';

import { useEffect, useId, useMemo, useRef } from 'react';

import { cn } from './cn';
import { OC_GLYPHS, type OcGlyphSlug } from './glyphs';

/**
 * OcSigil — the brand mark as a deep-set 3D emboss (aurora depth R3, Tier A+B).
 *
 * The sanctioned figure placement is `corner-bleed`: the verb's own pictogram,
 * oversized and cropped by the hero's `overflow-hidden`, anchored to a corner
 * away from both the text column and the proof artifact. The RIGHT COLUMN
 * COVENANT is absolute: this frames a hero's proof — it never occupies,
 * replaces, or displaces it. Placement is a per-site art decision; the
 * component ships dormant and is mounted one line at a time (see MIGRATION.md
 * and research/AURORA-DEPTH-PLAN.md §3).
 *
 * Two registers from ONE geometry, switched by `data-oc-theme` in CSS via the
 * `--oc-sigil-lift` / `--oc-sigil-shade` / `--oc-sigil-ink-base` endpoint
 * custom properties (SSR-resolved, zero hydration flash): ember renders a lit
 * letterpress relief (a warm highlight enters upper-left, walls sink into a
 * chromatic sienna shade, the back dissolves to transparent so the aurora reads
 * through); the four cypherpunk skins render the same silhouette as an unlit
 * crisp echo stack (lift = ink, shade = transparent). No color is hardcoded —
 * every layer is a color-mix() off the skin's own tokens.
 *
 * Mark surgery (SSR string transforms, closed slug union, trusted vendored
 * markup): the tile glyphs shed their rounded-square FRAME so the pictogram —
 * not the tile — embosses; hairline strokes are floored and heavy ones capped
 * so no mark vanishes or bloats at watermark alpha; a per-verb focus transform
 * optically sizes each pictogram to fill the canvas. This intentionally
 * diverges the sigil silhouette from the media-kit tile at display scale.
 *
 * Degradation: SSR-painted markup (no JS needed for the static pose); drift
 * pauses under prefers-reduced-motion AND the oc_motion switch (`.oc-ambient`);
 * on phones it re-anchors top-right and stays quiet (never buried below fold);
 * hidden under forced-colors (SVG fills are not auto-stripped); parallax
 * (Tier B) only attaches on fine pointers with motion allowed, and a hero with
 * an animated/interactive proof must pass `parallax={false}` — one ambient
 * motion source per hero. The resting 0% keyframe IS the art: it is the
 * best-composed frame, which is what reduced-motion users are frozen at.
 */
export interface OcSigilProps {
    /** Which brand mark to emboss — the closed media-kit union, no default:
     *  a property without a normalized glyph cannot mount a sigil. */
    glyph: OcGlyphSlug;
    /** Corner the mark bleeds off (crops against the hero's overflow-hidden). */
    corner?: 'bottom-left' | 'bottom-right' | 'top-left' | 'top-right';
    /**
     * Pointer parallax (±5°, damped). Set `false` when the hero's proof
     * artifact is animated or interactive (typing demos, countdowns, live
     * forms) — the motion-budget rule, enforced by the caller's declaration.
     */
    parallax?: boolean;
    /**
     * Emboss into a solid brand band (the `.oc-sigil--band` deboss preset:
     * band-shaped mask + walls that sink into `--brand`) rather than
     * corner-bleed. The consumer supplies `--oc-sigil-ink` (e.g.
     * `--brand-foreground`). Under ember the band reads as a tone-on-tone
     * deboss; under a cypherpunk skin it follows that skin's echo register.
     */
    band?: boolean;
    /** Size/position via the consumer's utility classes (e.g. `w-[min(56vmin,540px)]`). */
    className?: string;
}

// Extrusion: 22 thin layers give a smooth 3D slab. The z of each layer eases
// (t^1.4) so front steps land sub-pixel where the eye reads the bevel and the
// coarse steps hide in the dissolving tail — no countable "cardboard" bands.
// Filled letterforms extrude shallower so their walls never outgrow the face.
const DEPTH = 22;
const LAYERS = Array.from({ length: DEPTH }, (_, i) => i);
const FILL = new Set<OcGlyphSlug>(['orangecheck', 'btc', 'vote']);

// Endpoint custom properties drive the two registers (see docstring). Defaults
// here are the ember/lit values; CSS overrides --oc-sigil-lift on light grounds
// and swaps both for the cypherpunk skins. --oc-sigil-ink-base lets ember dark
// ride the brighter --brand without disturbing the www band's --oc-sigil-ink.
const INK = 'var(--oc-sigil-ink, var(--oc-sigil-ink-base, var(--primary)))';
const LIFT = 'var(--oc-sigil-lift, white)';
const SHADE = `var(--oc-sigil-shade, color-mix(in oklab, black, ${INK} 30%))`;

function layerStyle(i: number, relief: number): React.CSSProperties {
    const t = i / (DEPTH - 1); // 0 = front face, 1 = deepest
    // A lit relief: a gently-lifted front face, a wall that sinks into a
    // chromatic shade (never achromatic black — that muds the hue), and a back
    // that dissolves to TRANSPARENT so it composites correctly over the aurora
    // (which never equals any fixed --background). The wrapper opacity then
    // composites the whole stack translucent — keep the endpoints restrained.
    let color: string;
    if (t < 0.14) {
        // Directional light is carried by the specular leaf; this is a small,
        // even face-lift so the front plane sits above the wall.
        color = `color-mix(in oklab, ${INK}, ${LIFT} ${Math.round(((0.14 - t) / 0.14) * 18)}%)`;
    } else if (t < 0.55) {
        const k = (t - 0.14) / 0.41; // 0..1 across the wall
        color = `color-mix(in oklab, ${INK}, ${SHADE} ${Math.round(k * 45)}%)`;
    } else {
        const k = (t - 0.55) / 0.45; // 0..1 dissolving out to transparent
        color = `color-mix(in oklab, color-mix(in oklab, ${INK}, ${SHADE} 45%), transparent ${Math.round(Math.pow(k, 1.3) * 100)}%)`;
    }
    return { transform: `translateZ(${(-Math.pow(t, 1.4) * relief).toFixed(1)}px)`, color };
}

// The six tile glyphs are FRAMED pictograms (an outer invisible box + a
// rounded-square frame + the detail). At watermark scale three of them read as
// the same rounded-square debris, so we strip the frame and emboss the
// pictogram alone. Coordinates below match the vendored glyphs.ts markup
// (verify-sigil-transforms.mjs locks the hit-count so a re-vendor can't silently
// break these regexes).
const TILE = new Set<OcGlyphSlug>(['stamp', 'pledge', 'cosign', 'me', 'fleet', 'docs']);

// Optical sizing — scale the surviving pictogram to fill the ~1024 canvas.
// orangecheck is deliberately ABSENT so the approved www band § is untouched;
// attest/lock/vault/chat/agent/analytics already fill the canvas.
const FOCUS: Partial<Record<OcGlyphSlug, string>> = {
    stamp: 'translate(512 512) scale(1.5) translate(-512 -512)', // anchor-cross
    pledge: 'translate(512 512) scale(1.7) translate(-491 -512)', // ₱ mark, recentered
    cosign: 'translate(512 512) scale(1.35) translate(-512 -512)', // two figures
    me: 'translate(512 512) scale(1.45) translate(-512 -544)', // bust, recentered down
    fleet: 'translate(512 512) scale(1.5) translate(-512 -512)', // play + bar
    docs: 'translate(512 512) scale(1.4) translate(-512 -512)', // text lines
    vote: 'translate(512 512) scale(0.92) translate(-512 -542)', // tall bars, nudged down
    btc: 'translate(512 512) scale(1.25) translate(-512 -512)', // ₿
};

// Stroke floor/ceiling: at the x42.67 scale the set spans 0.5..2.0 units (a 4×
// spread), so hairlines vanish and shackles bloat under the mask+alpha. Clamp
// to 1.3..1.7 → intra-set spread drops to ~1.3×.
function normSw(w: number): number {
    return w < 1.3 ? 1.3 : w > 1.8 ? 1.7 : w;
}

function prepare(glyph: OcGlyphSlug, markup: string): string {
    let m = markup
        .split('__INK__')
        .join('currentColor')
        .split('__BG__')
        .join('none')
        .split('__FG__')
        .join('none');
    if (TILE.has(glyph)) {
        m = m.replace(/<rect x="6" y="6" width="12" height="12"[^>]*\/>/, '');
    }
    m = m.replace(/stroke-width="([\d.]+)"/g, (_, w) => `stroke-width="${normSw(parseFloat(w))}"`);
    const focus = FOCUS[glyph];
    return focus ? `<g transform="${focus}">${m}</g>` : m;
}

// Per-slug resting pose offset [yaw°, pitch°] so five clone heroes never read as
// one glyph-swapped template. An explicit table (not a hash — the old hash blew
// past its ±4.5° envelope on negative values and collided 7 buckets over 15
// slugs). Envelope ±7° yaw / ±3° pitch; composes with the base pose + parallax.
const SEED: Record<OcGlyphSlug, [number, number]> = {
    attest: [-7, 2],
    lock: [-4, -2],
    vote: [6, 0],
    stamp: [2, -2],
    agent: [-2, 3],
    pledge: [5, 2],
    chat: [-6, -1],
    cosign: [1, -3],
    vault: [4, 1],
    me: [-3, 2],
    fleet: [7, -2],
    docs: [0, 0],
    analytics: [-5, 1],
    btc: [4, 3],
    orangecheck: [0, 0],
};

export function OcSigil({
    glyph,
    corner = 'bottom-left',
    parallax = true,
    band = false,
    className,
}: OcSigilProps) {
    const rawId = useId();
    const id = useMemo(() => `oc-sigil-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [rawId]);
    const parRef = useRef<HTMLDivElement>(null);

    const mark = useMemo(() => prepare(glyph, OC_GLYPHS[glyph]), [glyph]);
    const relief = FILL.has(glyph) ? 30 : 48;
    const [seedY, seedX] = SEED[glyph];

    // Tier B — damped pointer parallax. Gates: prop, fine pointer, PRM (live),
    // ambient-motion switch (live via attribute). Listener on window; the
    // sigil itself is inert (pointer-events: none). tanh eases to a ±5° ceiling
    // with no hard clamp seam.
    useEffect(() => {
        if (!parallax) return;
        const el = parRef.current;
        if (!el) return;
        if (!matchMedia('(pointer: fine)').matches) return;

        const prm = matchMedia('(prefers-reduced-motion: reduce)');
        let raf = 0;
        let tx = 0;
        let ty = 0;
        let cx = 0;
        let cy = 0;

        const allowed = () =>
            !prm.matches && document.documentElement.getAttribute('data-oc-motion') !== 'off';

        const onMove = (e: PointerEvent) => {
            if (!allowed()) return;
            tx = Math.tanh(((e.clientX / innerWidth - 0.5) * 2) * 1.2) * 5;
            ty = Math.tanh(((e.clientY / innerHeight - 0.5) * 2) * 1.2) * -5;
            if (!raf) raf = requestAnimationFrame(step);
        };
        const step = () => {
            raf = 0;
            cx += (tx - cx) * 0.045;
            cy += (ty - cy) * 0.045;
            el.style.setProperty('--oc-sigil-ry', `${cx.toFixed(2)}deg`);
            el.style.setProperty('--oc-sigil-rx', `${cy.toFixed(2)}deg`);
            if (Math.abs(tx - cx) + Math.abs(ty - cy) > 0.05) raf = requestAnimationFrame(step);
        };
        const onPrm = () => {
            if (prm.matches) {
                el.style.setProperty('--oc-sigil-rx', '0deg');
                el.style.setProperty('--oc-sigil-ry', '0deg');
            }
        };
        window.addEventListener('pointermove', onMove, { passive: true });
        prm.addEventListener?.('change', onPrm);
        return () => {
            window.removeEventListener('pointermove', onMove);
            prm.removeEventListener?.('change', onPrm);
            cancelAnimationFrame(raf);
        };
    }, [parallax]);

    return (
        <div
            aria-hidden="true"
            className={cn('oc-sigil', `oc-sigil--${corner}`, band && 'oc-sigil--band', className)}
            style={
                {
                    '--oc-sigil-seed': `${seedY}deg`,
                    '--oc-sigil-seed-x': `${seedX}deg`,
                } as React.CSSProperties
            }
        >
            <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
                <defs>
                    <g id={`${id}-mark`} dangerouslySetInnerHTML={{ __html: mark }} />
                </defs>
            </svg>
            <div className="oc-sigil__drift oc-ambient">
                <div ref={parRef} className="oc-sigil__par">
                    {LAYERS.map((n) => (
                        <svg
                            key={n}
                            viewBox="0 0 1024 1024"
                            className="oc-sigil__layer"
                            style={layerStyle(n, relief)}
                        >
                            <use href={`#${id}-mark`} />
                        </svg>
                    ))}
                    {/* One directional specular leaf, front of the stack, masked
                        upper-left. Colored through --oc-sigil-lift so the
                        cypherpunk register (lift = ink) neutralizes it for free.
                        The mask is on this LEAF (no 3D descendants) — never on
                        __drift/__par, which would flatten preserve-3d. */}
                    <svg
                        viewBox="0 0 1024 1024"
                        className="oc-sigil__layer oc-sigil__spec"
                        style={{
                            transform: 'translateZ(1.5px)',
                            color: `color-mix(in oklab, ${INK}, ${LIFT} 45%)`,
                        }}
                    >
                        <use href={`#${id}-mark`} />
                    </svg>
                </div>
            </div>
        </div>
    );
}
