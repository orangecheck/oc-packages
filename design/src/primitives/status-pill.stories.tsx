import type { Meta, StoryObj } from '@storybook/react';
import { CheckCircle2, Circle, Clock, ShieldOff } from 'lucide-react';

import { StatusPill, makeStatusPill } from './status-pill';

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

// The ergonomic that fleet (AgentStatus/PledgeStatus), www (StateBadge), and
// me (compliance/severity) each hand-roll: declare the status→spec map once.
const PledgeStatusPill = makeStatusPill({
    pending: { tone: 'warning' },
    kept: { tone: 'success' },
    broken: { tone: 'destructive' },
    expired: { tone: 'muted' },
    disputed: { tone: 'info', label: 'in dispute' },
});

export const Mapped: Story = {
    render: () => (
        <div className="flex flex-wrap items-center gap-4">
            <PledgeStatusPill status="pending" />
            <PledgeStatusPill status="kept" />
            <PledgeStatusPill status="broken" />
            <PledgeStatusPill status="expired" />
            <PledgeStatusPill status="disputed" />
        </div>
    ),
};
