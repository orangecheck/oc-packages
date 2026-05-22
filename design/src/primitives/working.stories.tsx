import type { Meta, StoryObj } from '@storybook/react';

import { Working, WorkingPanel } from './working';

const meta = {
    title: 'Primitives/Working',
    component: Working,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Working>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Inline: Story = {
    args: { text: 'publishing to nostr' },
};

export const WithProgress: Story = {
    args: { text: 'broadcasting', progress: '2 of 4 relays' },
};

export const Small: Story = {
    args: { text: 'signing', size: 'sm' },
};

export const Panel: Story = {
    render: () => (
        <div className="max-w-md">
            <WorkingPanel text="anchoring to bitcoin" progress="block 1 of 6" />
        </div>
    ),
};
