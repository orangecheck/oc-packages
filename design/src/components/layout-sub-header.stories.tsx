import type { Meta, StoryObj } from '@storybook/react';

import { LayoutSubHeader } from '../chrome';

const meta = {
    title: 'Chrome/LayoutSubHeader',
    component: LayoutSubHeader,
    parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof LayoutSubHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Canonical: one quiet capability phrase on the right. */
export const Stamp: Story = {
    render: () => (
        <LayoutSubHeader product="oc · stamp" tags={[{ label: 'bip-322 · opentimestamps' }]} />
    ),
};

/** The hub (ochk.io). */
export const Home: Story = {
    render: () => (
        <LayoutSubHeader product="6 protocols · 1 family" tags={[{ label: 'bip-322 · sats × days' }]} />
    ),
};

/** Custom status + alpha state. */
export const Vote: Story = {
    render: () => (
        <LayoutSubHeader
            product="oc · vote"
            status="live · signet"
            tags={[{ label: 'stake-weighted · sybil-resistant' }]}
        />
    ),
};

/** Owner-gated surface. */
export const Owner: Story = {
    render: () => (
        <LayoutSubHeader
            product="oc · analytics"
            status="owners only · gated"
            tags={[{ label: 'cross-product cockpit' }]}
        />
    ),
};

/** Two tags, the second deferred to wider viewports. */
export const TwoTags: Story = {
    render: () => (
        <LayoutSubHeader
            product="oc · pledge"
            tags={[{ label: 'bip-322 · stake-bonded' }, { label: 'offline-verifiable', hideBelow: 'lg' }]}
        />
    ),
};
