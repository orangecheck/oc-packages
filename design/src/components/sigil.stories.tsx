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
                <OcSigil {...args} className="h-[min(56vmin,540px)] w-[min(56vmin,540px)]" />
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

/** Per-verb identity: same component, each verb's own mark + seeded geometry. */
export const PerVerb: Story = {
    args: { glyph: 'vote' },
    render: () => (
        <div className="bg-background grid gap-0 lg:grid-cols-2">
            {(['vote', 'lock', 'agent', 'pledge'] as const).map((g) => (
                <section key={g} className="relative h-[46vh] overflow-hidden border-b">
                    <OcSigil glyph={g} corner="bottom-left" parallax={false} className="h-[52vmin] w-[52vmin]" />
                    <div className="label-mono text-muted-foreground relative p-6">oc · {g}</div>
                </section>
            ))}
        </div>
    ),
};
