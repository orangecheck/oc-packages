import type { Meta, StoryObj } from '@storybook/react';

import { Surface } from './surface';

const TONES = ['default', 'muted', 'brand', 'contrast', 'outline'] as const;
const ELEVATIONS = ['sm', 'md', 'lg'] as const;

const meta = {
    title: 'Primitives/Surface',
    component: Surface,
    parameters: { layout: 'padded' },
    args: { children: 'surface', tone: 'default', elevation: 'sm', pad: 'md' },
} satisfies Meta<typeof Surface>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Playground: Story = {};

export const Tones: Story = {
    render: () => (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
            {TONES.map((tone) => (
                <Surface key={tone} tone={tone}>
                    {tone}
                </Surface>
            ))}
            <div className="bg-brand p-6">
                <Surface tone="onBrand">onBrand</Surface>
            </div>
        </div>
    ),
};

export const Elevations: Story = {
    render: () => (
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
            {ELEVATIONS.map((elevation) => (
                <Surface key={elevation} elevation={elevation}>
                    elevation {elevation}
                </Surface>
            ))}
        </div>
    ),
};

export const Padding: Story = {
    render: () => (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Surface pad="sm">pad sm</Surface>
            <Surface pad="md">pad md</Surface>
            <Surface pad="lg">pad lg</Surface>
        </div>
    ),
};
