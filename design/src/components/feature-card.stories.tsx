import type { Meta, StoryObj } from '@storybook/react';
import { Ban, Infinity as InfinityIcon, Unlock } from 'lucide-react';
import { FeatureCard } from '../composites';

const meta = {
    title: 'Composites/FeatureCard',
    component: FeatureCard,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof FeatureCard>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Grid: Story = {
    render: () => (
        <div className="grid gap-4 sm:grid-cols-3">
            <FeatureCard icon={<Ban />} title="No KYC">
                Your Bitcoin address is the identity. No email, no password, no phone.
            </FeatureCard>
            <FeatureCard icon={<Unlock />} title="No custody">
                Funds never move. No deposits, no escrow, no wallet inside the app.
            </FeatureCard>
            <FeatureCard icon={<InfinityIcon />} title="Offline-verifiable">
                Any observer with a node and a verifier can check it without trusting a service.
            </FeatureCard>
        </div>
    ),
};

export const Horizontal: Story = {
    render: () => (
        <div className="mx-auto max-w-lg">
            <FeatureCard icon={<Ban />} orientation="horizontal" title="No KYC">
                Your Bitcoin address is the identity. BIP-322 is the ceremony.
            </FeatureCard>
        </div>
    ),
};

export const Centered: Story = {
    render: () => (
        <div className="mx-auto max-w-xs">
            <FeatureCard icon={<Unlock />} align="center" title="No custody">
                Funds never move.
            </FeatureCard>
        </div>
    ),
};

export const OnBrand: Story = {
    render: () => (
        <div className="bg-brand grid gap-4 p-8 sm:grid-cols-2">
            <FeatureCard icon={<Ban />} tone="onBrand" iconTone="onBrand" title="No KYC">
                Your Bitcoin address is the identity.
            </FeatureCard>
            <FeatureCard icon={<Unlock />} tone="onBrand" iconTone="onBrand" title="No custody">
                Funds never move.
            </FeatureCard>
        </div>
    ),
};
