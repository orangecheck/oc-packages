import type { Meta, StoryObj } from '@storybook/react';
import { EmptyState } from '../composites';

const meta = {
    title: 'Composites/EmptyState',
    component: EmptyState,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {
    render: () => (
        <div className="max-w-xl">
            <EmptyState
                label="no stamps yet"
                cta={{ label: 'create a stamp', href: '/create' }}
                secondary={{ label: 'read the docs', href: 'https://docs.ochk.io/stamp', external: true }}
            >
                stamps you mint will appear here, each anchored to Bitcoin and verifiable forever.
            </EmptyState>
        </div>
    ),
};

export const Tones: Story = {
    render: () => (
        <div className="grid max-w-4xl gap-4 md:grid-cols-3">
            <EmptyState label="info" tone="info">
                neutral guidance for an empty surface.
            </EmptyState>
            <EmptyState label="warning" tone="warning">
                something needs your attention before data appears.
            </EmptyState>
            <EmptyState label="muted" tone="muted">
                quiet, low-emphasis placeholder.
            </EmptyState>
        </div>
    ),
};
