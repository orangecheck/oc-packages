'use client';

import { useEffect, useId, useMemo, useRef } from 'react';

import { cn } from './cn';
import { OC_GLYPHS, type OcGlyphSlug } from './glyphs';

/**
 * OcSigil — the brand mark as a deep-set 3D emboss (aurora depth R3, Tier A+B).
 *
 * The sanctioned figure placement is `corner-bleed`: the verb's own glyph,
 * oversized and cropped by the hero section's `overflow-hidden`, anchored to a
 * corner away from both the text column and the proof artifact. The RIGHT
 * COLUMN COVENANT is absolute: this component frames a hero's proof — it never
 * occupies, replaces, or displaces it. Placement is a per-site art decision;
 * the component ships dormant and is mounted one line at a time
 * (see MIGRATION.md and research/AURORA-DEPTH-PLAN.md §3).
 *
 * Two registers from one geometry, switched in CSS (zero hydration flash):
 * ember renders an opaque layered letterpress emboss; the four cypherpunk
 * skins render the same silhouette as a wireframe stack. Layer colors are
 * color-mix()es toward --background, so contrast ceilings are compiled into
 * the stylesheet, not tunable per consumer.
 *
 * Degradation: SSR-painted markup (no JS needed for Tier A); drift pauses
 * under prefers-reduced-motion AND the oc_motion switch (`.oc-ambient`);
 * hidden below 640px (decoration never spends phone-fold real estate);
 * hidden under forced-colors (SVG fills are not auto-stripped); parallax
 * (Tier B) only ever attaches on fine pointers with motion allowed, and a
 * hero with an animated/interactive proof must pass `parallax={false}`
 * (one ambient motion source per hero).
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
    /** Size/position via the consumer's utility classes (e.g. `w-[min(56vmin,540px)]`). */
    className?: string;
}

// Extrusion depth: many thin layers give a smooth 3D slab (6 overlapped flat).
// The front face is a lit --primary; the extrusion recedes into shadow, and the
// deepest layers dissolve toward --background so the object melts into the
// aurora rather than ending in a hard edge.
const DEPTH = 22;
const Z_STEP = 3; // px between layers → ~63px of relief
const LAYERS = Array.from({ length: DEPTH }, (_, i) => i);

function layerStyle(i: number): React.CSSProperties {
    const t = i / (DEPTH - 1); // 0 = front face, 1 = deepest
    // A soft relief, not a loud fill: the front face is a gently-lifted primary,
    // the wall darkens into shadow, the back dissolves toward --background. The
    // whole stack is then composited translucent by the wrapper's opacity, so
    // these colors read muted — keep them restrained (small highlight, moderate
    // shadow) or the translucent watermark turns garish.
    let color: string;
    if (t < 0.14) {
        color = `color-mix(in oklab, var(--primary), white ${Math.round((0.14 - t) * 26)}%)`;
    } else if (t < 0.6) {
        const k = (t - 0.14) / 0.46; // 0..1 across the wall
        color = `color-mix(in oklab, var(--primary), black ${Math.round(k * 34)}%)`;
    } else {
        const k = (t - 0.6) / 0.4; // 0..1 dissolving out
        color = `color-mix(in oklab, color-mix(in oklab, var(--primary), black 34%), var(--background) ${Math.round(k * 100)}%)`;
    }
    return {
        transform: `translateZ(${-i * Z_STEP}px)`,
        color,
    };
}

// Glyphs are emitted in their correct form (solid for is_glyph_only, outline
// for the rest); the only sentinel left to resolve is the ink → currentColor,
// so the layer colour ramp drives the whole mark. __FG__/__BG__ are already
// baked to literals but we null them defensively.
function sub(markup: string): string {
    return markup
        .split('__INK__')
        .join('currentColor')
        .split('__BG__')
        .join('none')
        .split('__FG__')
        .join('none');
}

export function OcSigil({ glyph, corner = 'bottom-left', parallax = true, className }: OcSigilProps) {
    const rawId = useId();
    const id = useMemo(() => `oc-sigil-${rawId.replace(/[^a-zA-Z0-9_-]/g, '')}`, [rawId]);
    const parRef = useRef<HTMLDivElement>(null);

    // Deterministic per-verb geometry seed (slug hash → small rotation offset)
    // so five clone heroes never read as one glyph-swapped template.
    const seed = useMemo(() => {
        let h = 0;
        for (const ch of glyph) h = (h * 31 + ch.charCodeAt(0)) | 0;
        return ((h % 7) - 3) * 1.5; // −4.5°..+4.5°
    }, [glyph]);

    // The sub-brand glyphs are TILES (filled square + frame + detail): filling
    // fg makes a solid block. We always render the OUTLINE form (fg='none') —
    // the tile drops away, leaving the recognizable framed mark, which embosses
    // as an engraved seal (thematically exact for stamp; recolors per skin via
    // the layer color ramp). ink=currentColor so the depth ramp drives it.
    const mark = useMemo(() => sub(OC_GLYPHS[glyph]), [glyph]);

    // Tier B — damped pointer parallax. Gates: prop, fine pointer, PRM (live),
    // ambient-motion switch (live via attribute). Listener on window; the
    // sigil itself is inert (pointer-events: none).
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
            tx = (e.clientX / innerWidth - 0.5) * 10;
            ty = (e.clientY / innerHeight - 0.5) * -10;
            if (!raf) raf = requestAnimationFrame(step);
        };
        const step = () => {
            raf = 0;
            cx += (tx - cx) * 0.06;
            cy += (ty - cy) * 0.06;
            el.style.setProperty('--oc-sigil-ry', `${Math.max(-5, Math.min(5, cx)).toFixed(2)}deg`);
            el.style.setProperty('--oc-sigil-rx', `${Math.max(-5, Math.min(5, cy)).toFixed(2)}deg`);
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
            className={cn('oc-sigil', `oc-sigil--${corner}`, className)}
            style={{ '--oc-sigil-seed': `${seed}deg` } as React.CSSProperties}
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
                            style={layerStyle(n)}
                        >
                            <use href={`#${id}-mark`} />
                        </svg>
                    ))}
                </div>
            </div>
        </div>
    );
}
