import type { Meta, StoryObj } from '@storybook/react';
import { Faq } from '../composites';

const meta = {
    title: 'Composites/Faq',
    component: Faq,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Faq>;

export default meta;
type Story = StoryObj<typeof meta>;

const ITEMS = [
    {
        q: 'Do I need an account?',
        a: 'No. Your Bitcoin address is your identity and BIP-322 is the ceremony — no email, no password, no KYC.',
    },
    {
        q: 'Where do funds go?',
        a: 'Nowhere. OrangeCheck never takes custody. The stake stays in your wallet; the protocol only reads public chain state.',
    },
    {
        q: 'Can I verify this without trusting you?',
        a: 'Yes. Given the artifact and public chain data, any observer with a Bitcoin node and a BIP-322 verifier can check it offline.',
    },
];

export const Default: Story = {
    render: () => (
        <div className="mx-auto max-w-2xl">
            <Faq items={ITEMS} />
        </div>
    ),
};

export const FirstOpen: Story = {
    render: () => (
        <div className="mx-auto max-w-2xl">
            <Faq items={ITEMS} defaultOpen={0} />
        </div>
    ),
};
