import type { Meta, StoryObj } from '@storybook/react';

import { OcAurora, OcSigil } from '../tokens';

/**
 * OcSigil (aurora depth R3) — the brand mark as a deep-set corner-bleed
 * emboss. Ships DORMANT: mounting it on a hero is a per-site art decision
 * governed by the placement doctrine (research/AURORA-DEPTH-PLAN.md §3) —
 * the right column is the proof and is never displaced. Switch Skin in the
 * toolbar: filled letterpress under ember, wireframe under the cypherpunk
 * skins. Hidden below 640px, under forced-colors, and frozen under
 * reduced-motion / the ambient-motion switch.
 */
const meta = {
    title: 'Chrome/Sigil',
    component: OcSigil,
    parameters: { layout: 'fullscreen', bareSurface: true },
} satisfies Meta<typeof OcSigil>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The canonical composition: corner-bleed behind a stamp-style hero — text
 *  left, proof card right (untouched), mark cropping off the bottom-left. */
export const CornerBleed: Story = {
    args: { glyph: 'stamp', corner: 'bottom-left' },
    render: (args) => (
        <>
            <OcAurora />
            <section className="relative min-h-screen overflow-hidden border-b">
                <OcSigil {...args} />
                <div className="relative mx-auto grid max-w-5xl gap-10 p-10 pt-[12vh] lg:grid-cols-[1.1fr_1fr]">
                    <div>
                        <h1 className="font-display text-4xl font-extrabold tracking-tight">
                            sign anything with a <span className="text-primary">bitcoin address.</span>
                        </h1>
                        <p className="text-muted-foreground mt-4 max-w-[48ch]">
                            The mark condenses out of the aurora in the corner — cropped, deep-set,
                            slower than feels necessary. The proof card keeps the right column.
                        </p>
                    </div>
                    <div className="terminal">
                        <div className="terminal-title">
                            <span className="terminal-dot" />
                            <span className="terminal-dot" />
                            <span className="terminal-dot" />
                            <span className="ml-2">envelope.json</span>
                        </div>
                        <pre className="p-4 text-[11px]">{`{ "v": 1, "kind": "stamp", "sig": { "alg": "bip322" } }`}</pre>
                    </div>
                </div>
            </section>
        </>
    ),
};

/** Per-verb identity: the same component, each brand's own mark. Every glyph
 *  is shown at a controlled size so its geometry reads (the mark still bleeds
 *  off the cell's bottom-left corner as it does in a real hero). Solid-slab
 *  marks (vote bars, § , ₿) and outline marks (padlock, badge, framed icons)
 *  both render — this is the story that catches a broken glyph. */
const CATALOG = [
    'stamp',
    'lock',
    'vote',
    'agent',
    'pledge',
    'attest',
    'me',
    'vault',
    'chat',
    'cosign',
    'docs',
    'fleet',
    'analytics',
    'btc',
    'orangecheck',
] as const;

export const PerVerb: Story = {
    args: { glyph: 'stamp' },
    render: () => (
        <div className="bg-background grid grid-cols-2 gap-px md:grid-cols-3">
            {CATALOG.map((g) => (
                <section
                    key={g}
                    className="bg-background relative h-[240px] overflow-hidden border"
                    style={
                        {
                            '--oc-sigil-size': '210px',
                            '--oc-sigil-opacity': '0.85',
                            '--oc-sigil-opacity-sm': '0.85',
                        } as React.CSSProperties
                    }
                >
                    <OcSigil glyph={g} corner="bottom-left" parallax={false} />
                    <div className="label-mono text-muted-foreground relative p-4">oc · {g}</div>
                </section>
            ))}
        </div>
    ),
};
