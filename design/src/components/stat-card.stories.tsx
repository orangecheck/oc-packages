import type { Meta, StoryObj } from '@storybook/react';

import { StatCard } from '../composites';

const meta = {
    title: 'Composites/StatCard',
    component: StatCard,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof StatCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = {
    render: () => (
        <div className="grid max-w-3xl gap-4 sm:grid-cols-3">
            <StatCard label="balance · sats" value="210,000" sub="$199.50" />
            <StatCard label="earned · 30d" value="12,408" tone="success" delta={{ value: 8.2 }} />
            <StatCard label="runway" value="6 days" tone="warning" sub="top up to avoid freeze" />
        </div>
    ),
};
