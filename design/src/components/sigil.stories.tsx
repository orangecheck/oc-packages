import type { Meta, StoryObj } from '@storybook/react';

import { OcAurora, OcSigil } from '../tokens';

/**
 * OcSigil (aurora depth R3) — the brand mark as a deep-set corner-bleed
 * emboss. Ships DORMANT: mounting it on a hero is a per-site art decision
 * governed by the placement doctrine (research/AURORA-DEPTH-PLAN.md §3) —
 * the right column is the proof and is never displaced. Switch Skin in the
 * toolbar: lit letterpress relief under ember, unlit echo stack under the
 * cypherpunk skins. Frozen under reduced-motion / the ambient-motion switch;
 * hidden under forced-colors. On phones it re-anchors top-right.
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
 *  off the cell's bottom-left corner as it does in a real hero). Filled marks
 *  (vote bars, §, ₿) and the frame-stripped pictograms (padlock, badge, anchor,
 *  bust, flag) all render — this is the story that catches a broken glyph. */
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
    'analytics',
    'btc',
    'orangecheck',
] as const;

/** Band: the flagship's below-fold home for the mark. A full-bleed bg-brand
 *  finale with the § debossed into it via the `band` preset (walls sink into
 *  --brand, tone-on-tone, no gray fringe; the consumer supplies --oc-sigil-ink =
 *  --brand-foreground). The hero stays clean; the mark lives here. */
export const Band: Story = {
    args: { glyph: 'orangecheck', corner: 'bottom-right', band: true },
    render: (args) => (
        <div className="grid min-h-screen place-items-center bg-background p-10">
            <section
                className="bg-brand text-brand-foreground relative w-full max-w-5xl overflow-hidden rounded-lg px-8 py-16"
                style={
                    {
                        '--oc-sigil-ink': 'var(--brand-foreground)',
                        '--oc-sigil-opacity': '0.17',
                        '--oc-sigil-size': '460px',
                    } as React.CSSProperties
                }
            >
                <OcSigil {...args} />
                <div className="relative max-w-xl">
                    <h2 className="font-display text-3xl font-bold tracking-tight">
                        one identity. every product.
                    </h2>
                    <p className="mt-3 opacity-85">
                        Your Bitcoin address is the account. Sign in once, carry it across the
                        whole family.
                    </p>
                </div>
            </section>
        </div>
    ),
};

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
