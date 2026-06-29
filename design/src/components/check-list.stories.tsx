import type { Meta, StoryObj } from '@storybook/react';
import { CheckList } from '../composites';

const meta = {
    title: 'Composites/CheckList',
    component: CheckList,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof CheckList>;

export default meta;
type Story = StoryObj<typeof meta>;

const ITEMS = ['No KYC', 'No custody', 'No permission'];

export const Horizontal: Story = {
    render: () => <CheckList items={ITEMS} />,
};

export const Vertical: Story = {
    render: () => (
        <CheckList
            orientation="vertical"
            items={[
                'Sign in with your Bitcoin address',
                'Prove stake with BIP-322',
                'Verify the artifact offline',
            ]}
        />
    ),
};

export const OnBrand: Story = {
    render: () => (
        <div className="bg-brand p-8">
            <CheckList tone="onBrand" items={ITEMS} />
        </div>
    ),
};
