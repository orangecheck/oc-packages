import type { Meta, StoryObj } from '@storybook/react';
import { AlertTriangle } from 'lucide-react';

import { Callout } from '../composites';

const meta = {
    title: 'Composites/Callout',
    component: Callout,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Callout>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tones: Story = {
    render: () => (
        <div className="grid max-w-2xl gap-4">
            <Callout tone="info" label="simulation mode">
                this federation is running in dry-run. no real sats move until you fund the escrow.
            </Callout>
            <Callout tone="warning" label="action needed" icon={<AlertTriangle className="size-3.5" />}>
                your runway covers ~6 days at the current burn rate. top up to avoid a freeze.
            </Callout>
            <Callout tone="destructive" label="frozen">
                payouts are paused while a dispute is open. resolve it to resume.
            </Callout>
            <Callout tone="success" label="all clear">
                every guardian has signed. the charter is ratified.
            </Callout>
            <Callout tone="muted">a quiet, label-less notice for low-emphasis context.</Callout>
        </div>
    ),
};
