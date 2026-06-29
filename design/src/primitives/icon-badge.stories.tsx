import type { Meta, StoryObj } from '@storybook/react';

import { Lock } from 'lucide-react';

import { IconBadge } from './icon-badge';

const TONES = ['peach', 'dark', 'brand', 'onBrand', 'muted', 'surface'] as const;
const SIZES = ['sm', 'md', 'lg', 'xl'] as const;

const meta = {
    title: 'Primitives/IconBadge',
    component: IconBadge,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof IconBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tones: Story = {
    render: () => (
        <div className="flex flex-wrap items-center gap-3">
            {TONES.map((tone) =>
                tone === 'onBrand' ? (
                    <div key={tone} className="bg-brand p-6">
                        <IconBadge tone={tone}>
                            <Lock />
                        </IconBadge>
                    </div>
                ) : (
                    <IconBadge key={tone} tone={tone}>
                        <Lock />
                    </IconBadge>
                )
            )}
        </div>
    ),
};

export const Sizes: Story = {
    render: () => (
        <div className="flex flex-wrap items-end gap-3">
            {SIZES.map((size) => (
                <IconBadge key={size} size={size}>
                    <Lock />
                </IconBadge>
            ))}
        </div>
    ),
};

export const Numbered: Story = {
    render: () => (
        <div className="bg-brand p-6">
            <IconBadge tone="onBrand">{1}</IconBadge>
        </div>
    ),
};
