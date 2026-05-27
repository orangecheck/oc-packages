import type { Meta, StoryObj } from '@storybook/react';

import { Sparkline } from './sparkline';

const meta = {
    title: 'Primitives/Data/Sparkline',
    component: Sparkline,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Sparkline>;

export default meta;
type Story = StoryObj<typeof meta>;

const series = [4, 6, 5, 8, 7, 10, 9, 13, 12, 16, 15, 19];

export const Line: Story = { args: { data: series } };
export const Area: Story = { args: { data: series, area: true, width: 160, height: 40 } };
export const Flat: Story = { args: { data: [] } };
export const InContext: Story = {
    render: () => (
        <div className="flex items-center gap-3">
            <span className="font-display text-2xl">12,408</span>
            <Sparkline data={series} area className="text-success" />
        </div>
    ),
};
