import type { Meta, StoryObj } from '@storybook/react';

import { Card } from './card';
import { StatBlock } from './stat-block';

const meta = {
    title: 'Primitives/Data/Card',
    component: Card,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

export const TerminalCard: Story = {
    render: () => (
        <div className="max-w-xl">
            <Card title="network activity" subtitle="last 24h" refreshedAt="refreshed 2m ago">
                <div className="grid grid-cols-3 gap-6">
                    <StatBlock label="attestations" value="412" />
                    <StatBlock label="stamps" value="1,208" delta={{ value: 8.1 }} tone="success" />
                    <StatBlock label="revocations" value="3" tone="warning" />
                </div>
            </Card>
        </div>
    ),
};

export const Tones: Story = {
    render: () => (
        <div className="grid max-w-3xl gap-4 md:grid-cols-3">
            <Card title="ok" expandable={false}>
                <p className="text-muted-foreground text-sm">healthy.</p>
            </Card>
            <Card title="warning" tone="warning" expandable={false}>
                <p className="text-muted-foreground text-sm">escrow low.</p>
            </Card>
            <Card title="error" tone="destructive" expandable={false}>
                <p className="text-muted-foreground text-sm">smoke failed.</p>
            </Card>
        </div>
    ),
};
