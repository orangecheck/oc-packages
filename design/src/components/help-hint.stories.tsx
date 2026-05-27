import type { Meta, StoryObj } from '@storybook/react';

import { HelpHint, SectionHeader } from '../composites';

const meta = {
    title: 'Composites/HelpHint',
    component: HelpHint,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof HelpHint>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Standalone: Story = {
    render: () => (
        <p className="text-sm">
            participation fee
            <span className="ml-1 inline-flex">
                <HelpHint title="participation fee">
                    the share of each settlement retained by the federation to cover guardian
                    operating costs. set in the charter; visible to every member.
                </HelpHint>
            </span>
        </p>
    ),
};

export const InSectionHeader: Story = {
    render: () => (
        <div className="max-w-md">
            <SectionHeader
                label="bond anchor"
                hint={{
                    title: 'bond anchor',
                    body: 'the on-chain UTXO backing this identity. its balance gates how much can be staked.',
                }}
                meta="most recent first"
            />
            <p className="text-muted-foreground text-sm">section body…</p>
        </div>
    ),
};
