import type { Meta, StoryObj } from '@storybook/react';

import { StatBlock } from './stat-block';

const meta = {
    title: 'Data/StatBlock',
    component: StatBlock,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof StatBlock>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = {
    render: () => (
        <div className="grid max-w-2xl grid-cols-2 gap-6 sm:grid-cols-4">
            <StatBlock label="lifetime sats" value="2.1M" sub="all products" />
            <StatBlock label="paid identities" value="1,284" delta={{ value: 12.4 }} tone="success" />
            <StatBlock label="open invoices" value="7" tone="warning" />
            <StatBlock label="errors 24h" value="0" delta={{ value: -100 }} tone="destructive" />
        </div>
    ),
};
