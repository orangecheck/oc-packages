import type { Meta, StoryObj } from '@storybook/react';
import { CheckCircle2, Circle, Clock, ShieldOff } from 'lucide-react';

import { StatusPill } from './status-pill';

const meta = {
    title: 'Data/StatusPill',
    component: StatusPill,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof StatusPill>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tones: Story = {
    render: () => (
        <div className="flex flex-wrap items-center gap-4">
            <StatusPill tone="success" label="active" icon={<CheckCircle2 className="size-3" />} />
            <StatusPill tone="warning" label="paused" icon={<Circle className="size-3" />} />
            <StatusPill tone="destructive" label="broken" icon={<ShieldOff className="size-3" />} />
            <StatusPill tone="muted" label="expired" icon={<Clock className="size-3" />} />
            <StatusPill tone="primary" label="pending" />
            <StatusPill tone="info" label="forming" />
        </div>
    ),
};
