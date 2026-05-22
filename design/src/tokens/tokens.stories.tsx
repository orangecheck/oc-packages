import type { Meta, StoryObj } from '@storybook/react';

import { OC_THEMES } from './themes';

const meta = {
    title: 'Tokens/Colors',
    parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

const SURFACE_PAIRS: Array<[string, string, string]> = [
    ['background', 'foreground', 'page'],
    ['card', 'card-foreground', 'card'],
    ['popover', 'popover-foreground', 'popover'],
    ['primary', 'primary-foreground', 'primary'],
    ['secondary', 'secondary-foreground', 'secondary'],
    ['muted', 'muted-foreground', 'muted'],
    ['accent', 'accent-foreground', 'accent'],
    ['destructive', 'destructive-foreground', 'destructive'],
    ['warning', 'warning-foreground', 'warning'],
    ['info', 'info-foreground', 'info'],
    ['success', 'success-foreground', 'success'],
    ['brand', 'brand-foreground', 'brand'],
];

const LINE_TOKENS = ['border', 'input', 'ring'];

function Swatch({ bg, fg, label }: { bg: string; fg: string; label: string }) {
    return (
        <div className="overflow-hidden rounded-md border">
            <div
                className="flex h-20 items-end p-2"
                style={{ background: `var(--${bg})`, color: `var(--${fg})` }}
            >
                <span className="font-mono text-xs">Aa</span>
            </div>
            <div className="label-mono text-foreground bg-card px-2 py-1.5">--{label}</div>
        </div>
    );
}

export const Surfaces: Story = {
    render: () => (
        <div className="container py-2">
            <p className="label-mono text-primary mb-3">§ surface + foreground pairs</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6">
                {SURFACE_PAIRS.map(([bg, fg, label]) => (
                    <Swatch key={label} bg={bg} fg={fg} label={label} />
                ))}
            </div>

            <p className="label-mono text-primary mt-8 mb-3">§ line tokens</p>
            <div className="flex flex-wrap gap-6">
                {LINE_TOKENS.map((t) => (
                    <div key={t} className="flex items-center gap-2">
                        <span
                            className="size-10 rounded-md border-2"
                            style={{ borderColor: `var(--${t})` }}
                        />
                        <span className="label-mono text-foreground">--{t}</span>
                    </div>
                ))}
            </div>
        </div>
    ),
};

export const Radius: Story = {
    parameters: { layout: 'fullscreen' },
    render: () => {
        const radii: Array<[string, string]> = [
            ['rounded-sm', 'bg-secondary size-20 border rounded-sm'],
            ['rounded-md', 'bg-secondary size-20 border rounded-md'],
            ['rounded-lg', 'bg-secondary size-20 border rounded-lg'],
            ['rounded-xl', 'bg-secondary size-20 border rounded-xl'],
        ];
        return (
            <div className="container py-2">
                <p className="label-mono text-primary mb-3">§ radius scale (base --radius)</p>
                <div className="flex flex-wrap items-end gap-4">
                    {radii.map(([label, cls]) => (
                        <div key={label} className="text-center">
                            <div className={cls} />
                            <span className="label-mono text-foreground mt-2 block">{label}</span>
                        </div>
                    ))}
                </div>
            </div>
        );
    },
};

export const Typography: Story = {
    parameters: { layout: 'fullscreen' },
    render: () => (
        <div className="container space-y-4 py-2">
            <p className="label-mono text-primary">§ type</p>
            <p className="font-display text-3xl">font-display · the quick brown fox · 0123</p>
            <p className="font-mono text-sm">font-mono · jetbrains · const sats = 21_000_000n;</p>
            <p className="text-base">font-sans · Inter · body copy at base size.</p>
            <p className="label-mono text-foreground">label-mono · UPPERCASE TRACKING</p>
        </div>
    ),
};

export const SkinMatrix: Story = {
    name: 'Skin matrix',
    parameters: { layout: 'fullscreen' },
    render: () => (
        <div className="container py-2">
            <p className="label-mono text-primary mb-3">§ skins (use the Skin + Mode toolbars)</p>
            <p className="text-muted-foreground mb-6 max-w-prose text-sm">
                Every component reads the same semantic tokens, so switching skin re-colors the
                entire system at once. Registered skins:
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
                {OC_THEMES.map((t) => (
                    <div key={t.id} className="rounded-md border p-4">
                        <div className="font-display text-lg">{t.label}</div>
                        <div className="text-muted-foreground text-sm">{t.description}</div>
                        <code className="text-primary mt-2 block font-mono text-xs">
                            data-oc-theme="{t.id}"
                        </code>
                    </div>
                ))}
            </div>
        </div>
    ),
};
