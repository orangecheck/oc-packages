import type { Meta, StoryObj } from '@storybook/react';
import { MarketingHeading, TwoToneHeading } from '../composites';

const meta = {
    title: 'Composites/MarketingHeading',
    component: MarketingHeading,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof MarketingHeading>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <MarketingHeading
            eyebrow="identity, not access"
            lead="Your Bitcoin address is who you are."
            muted="No account. No KYC. No permission."
            body="Sign one message to prove control of an address. Every artifact is content-addressed and verifiable offline."
        />
    ),
};

export const Centered: Story = {
    render: () => (
        <MarketingHeading
            align="center"
            eyebrow="sats as signal"
            lead="Stake is the spam filter."
            muted="Patience and capital, not passwords."
            body="One primitive, six verbs, every surface in the family."
        />
    ),
};

export const OnBrand: Story = {
    render: () => (
        <div className="bg-brand p-10">
            <MarketingHeading
                tone="onBrand"
                eyebrow="ship the api first"
                lead="Everything works from curl."
                muted="The UI is a convenience."
            />
        </div>
    ),
};

export const TwoToneOnly: Story = {
    render: () => (
        <TwoToneHeading lead="Sats as weight." muted="One address, one vote, no sybils." />
    ),
};
