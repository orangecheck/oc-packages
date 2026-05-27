import type { Meta, StoryObj } from '@storybook/react';
import { StatGrid } from '../composites';
import { AppShell, OcDashboardHub, OcDashboardShell } from '../chrome';
import { CheckCircle, FileSignature, Plus } from 'lucide-react';

const meta = {
    title: 'Composites/Dashboard',
    parameters: { layout: 'fullscreen' },
} satisfies Meta;

export default meta;
type Story = StoryObj;

const TOOLS = [
    {
        id: 'create',
        href: '/create',
        label: 'create',
        tagline: 'mint a Bitcoin-anchored stamp over any hash',
        icon: <Plus className="size-3.5" aria-hidden />,
    },
    {
        id: 'verify',
        href: '/verify',
        label: 'verify',
        tagline: 'check a stamp · signer + timestamp anchor',
        icon: <CheckCircle className="size-3.5" aria-hidden />,
    },
    {
        id: 'history',
        href: '/history',
        label: 'history',
        tagline: 'every stamp you have minted',
        icon: <FileSignature className="size-3.5" aria-hidden />,
    },
];

export const Hub: Story = {
    render: () => (
        <div className="container py-8">
            <OcDashboardHub tools={TOOLS} />
        </div>
    ),
};

export const ShellWithSidebar: Story = {
    name: 'OcDashboardShell (tool rail)',
    render: () => (
        <OcDashboardShell
            tools={TOOLS}
            active="create"
            eyebrow="oc · stamp"
            title="create"
            description="mint a Bitcoin-anchored stamp over any hash."
        >
            <StatGrid
                columns={2}
                items={[
                    { label: 'drafts', value: '1' },
                    { label: 'minted today', value: '4', tone: 'success' },
                ]}
            />
        </OcDashboardShell>
    ),
};

export const Shell: Story = {
    name: 'AppShell',
    render: () => (
        <AppShell
            eyebrow="oc · stamp"
            title="dashboard"
            description="mint, verify, and review your Bitcoin-anchored stamps."
        >
            <StatGrid
                columns={3}
                items={[
                    { label: 'minted', value: '128' },
                    { label: 'anchored', value: '126', tone: 'success' },
                    { label: 'pending', value: '2', tone: 'warning' },
                ]}
            />
        </AppShell>
    ),
};
