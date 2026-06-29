import type { Meta, StoryObj } from '@storybook/react';

import { EmailCapture } from '../composites';

const meta = {
    title: 'Composites/EmailCapture',
    component: EmailCapture,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof EmailCapture>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="max-w-md">
            <EmailCapture note="no spam, unsubscribe anytime" />
        </div>
    ),
};

export const OnBrand: Story = {
    render: () => (
        <div className="bg-brand p-8">
            <div className="max-w-md">
                <EmailCapture
                    tone="onBrand"
                    cta="Get early access"
                    note="sats as signal — no KYC, no custody"
                />
            </div>
        </div>
    ),
};
