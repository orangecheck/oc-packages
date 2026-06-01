import type { Meta, StoryObj } from '@storybook/react';

import { OcAurora } from '../tokens';

const meta = {
    title: 'Chrome/Aurora',
    component: OcAurora,
    // bareSurface: paint the theme bg on <body> + keep the wrapper transparent so
    // the fixed z-(-1) aurora shows. Toolbar Skin/Mode still drive it.
    parameters: { layout: 'fullscreen', bareSurface: true },
} satisfies Meta<typeof OcAurora>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The ambient family background. Switch Skin + Mode in the toolbar to watch it recolour. */
export const Default: Story = {
    render: (args) => (
        <>
            <OcAurora {...args} />
            <div
                className="bg-card text-card-foreground border-border relative max-w-xl rounded-xl border p-8 shadow-sm"
                style={{ margin: '10vh auto' }}
            >
                <h1 className="font-display text-4xl font-extrabold tracking-tight">
                    Bitcoin aurora
                </h1>
                <p className="text-muted-foreground mt-3 text-lg">
                    A soft, theme-reactive background that slowly undulates behind every family
                    site. Try the Skin and Mode toggles in the toolbar — it recolours from the
                    same tokens with zero JS, and the card sits cleanly on top.
                </p>
            </div>
        </>
    ),
};

export const Soft: Story = {
    name: 'Soft (intensity 0.5)',
    args: { intensity: 0.5 },
    render: Default.render,
};
