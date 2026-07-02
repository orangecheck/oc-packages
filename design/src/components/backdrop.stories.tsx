import type { Meta, StoryObj } from '@storybook/react';

import { OcAurora } from '../tokens';

/**
 * Backdrop utilities shipped in design 0.26.0 (aurora-depth release 1):
 * `.oc-guides` (the quieter 2026-register lattice), `.oc-halo` (the
 * glyph-shaped glow plate behind a hero artifact card), and the aurora's
 * grain pass. All zero-JS, token-reactive across every skin × mode.
 */
const meta = {
    title: 'Chrome/Backdrop',
    parameters: { layout: 'fullscreen', bareSurface: true },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

/** `.oc-halo` — the mark as a soft token-tinted mask behind a proof card.
 *  Soft bloom under ember; tight edge-glow under the cypherpunk skins. */
export const Halo: Story = {
    render: () => (
        <>
            <OcAurora />
            <div className="relative mx-auto max-w-md" style={{ margin: '14vh auto' }}>
                <div className="oc-halo" aria-hidden="true" />
                <div className="bg-card text-card-foreground border-border relative rounded-xl border p-6 shadow-sm">
                    <div className="label-mono text-primary">✓ verified · bc1qalice…</div>
                    <p className="text-muted-foreground mt-3 text-sm leading-relaxed">
                        The halo frames the artifact — it never replaces it. Swap the mark
                        per-site with <code>--oc-halo-mask</code>; dial with
                        <code> --oc-halo-op</code> / <code>--oc-halo-blur</code>.
                    </p>
                </div>
            </div>
        </>
    ),
};

/** `.oc-guides` — faint 56px lattice + plus-mark crosses, keyed to tokens. */
export const Guides: Story = {
    render: () => (
        <div className="oc-guides min-h-screen p-12">
            <div className="bg-card text-card-foreground border-border relative max-w-xl rounded-xl border p-8 shadow-sm">
                <h1 className="font-display text-3xl font-extrabold tracking-tight">guides</h1>
                <p className="text-muted-foreground mt-3">
                    The opt-in evolution of <code>.bg-grid</code>: quieter lines, plus-mark
                    crosses at the intersections. Colors derive from tokens, so it adapts to
                    every skin and mode.
                </p>
            </div>
        </div>
    ),
};

/** Grain rides inside the aurora slot (see Chrome/Aurora) — this story pushes
 *  the dial up so the tile is inspectable; production default is ~0.1. */
export const GrainInspect: Story = {
    name: 'Grain (inspection dial)',
    render: () => (
        <>
            <div style={{ ['--oc-grain-op' as string]: '0.35' }}>
                <OcAurora />
            </div>
            <div
                className="bg-card text-card-foreground border-border relative max-w-xl rounded-xl border p-8 shadow-sm"
                style={{ margin: '10vh auto' }}
            >
                <h1 className="font-display text-3xl font-extrabold tracking-tight">grain</h1>
                <p className="text-muted-foreground mt-3">
                    A 160px luminance-only noise tile riding the aurora slot — it inherits the
                    edge fade and intensity dampening. Shown here at 0.35 for inspection; ships
                    at 0.1. Zero it per-site with one line:{' '}
                    <code>.oc-aurora {'{'} --oc-grain-op: 0 {'}'}</code>.
                </p>
            </div>
        </>
    ),
};
