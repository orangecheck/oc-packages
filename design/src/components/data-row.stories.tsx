import type { Meta, StoryObj } from '@storybook/react';

import { StatusPill } from '../primitives';
import { DataRow } from '../composites';

const meta = {
    title: 'Composites/DataRow',
    component: DataRow,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof DataRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const List: Story = {
    render: () => (
        <ul className="max-w-2xl divide-y border">
            <DataRow
                as="li"
                className="px-4"
                meta="3m ago"
                action={<StatusPill tone="success" label="settled" />}
            >
                <p className="text-sm">payout · federation alpha</p>
                <p className="text-muted-foreground font-mono text-xs">12,408 sats</p>
            </DataRow>
            <DataRow
                as="li"
                className="px-4"
                meta="1h ago"
                action={<StatusPill tone="warning" label="pending" />}
            >
                <p className="text-sm">payout · federation beta</p>
                <p className="text-muted-foreground font-mono text-xs">7,000 sats</p>
            </DataRow>
            <DataRow as="li" className="px-4" meta="yesterday">
                <p className="text-sm">incident · relay timeout</p>
                <p className="text-muted-foreground font-mono text-xs">auto-resolved</p>
            </DataRow>
        </ul>
    ),
};
