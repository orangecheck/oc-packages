import type { Meta, StoryObj } from '@storybook/react';

import { LayoutSubHeader } from '../chrome';

const meta = {
    title: 'Chrome/LayoutSubHeader',
    component: LayoutSubHeader,
    parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LayoutSubHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Stamp: Story = {
    render: () => (
        <LayoutSubHeader
            product="oc · stamp"
            tags={[
                { label: 'bip-322 · opentimestamps' },
                { label: 'authorship + priority', hideBelow: 'sm' },
                { label: 'verifies offline forever', hideBelow: 'md' },
            ]}
        />
    ),
};

export const Vote: Story = {
    render: () => (
        <LayoutSubHeader
            product="oc · vote"
            status="live · signet"
            tags={[{ label: 'commit-reveal' }, { label: 'tally verifies offline', hideBelow: 'sm' }]}
        />
    ),
};
