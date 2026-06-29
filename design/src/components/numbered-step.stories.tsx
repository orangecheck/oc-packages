import type { Meta, StoryObj } from '@storybook/react';
import { StepList } from '../composites';

const meta = {
    title: 'Composites/StepList',
    component: StepList,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof StepList>;

export default meta;
type Story = StoryObj<typeof meta>;

const STEPS = [
    { title: 'Sign a message', children: 'Prove control of your Bitcoin address with BIP-322 — no account, no KYC.' },
    { title: 'Mint the artifact', children: 'The signed bytes are hashed to a content address and published.' },
    { title: 'Verify offline', children: 'Anyone with a node and a verifier can check it without trusting a service.' },
];

export const Bare: Story = {
    render: () => <StepList variant="bare" steps={STEPS} />,
};

export const Cards: Story = {
    render: () => <StepList variant="card" steps={STEPS} />,
};

export const OnBrand: Story = {
    render: () => (
        <div className="bg-brand p-8">
            <StepList variant="card" tone="onBrand" steps={STEPS} />
        </div>
    ),
};
