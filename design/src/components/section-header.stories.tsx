import type { Meta, StoryObj } from '@storybook/react';
import { SectionHeader } from '@orangecheck/ui';

const meta = {
    title: 'Composites/SectionHeader',
    component: SectionHeader,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof SectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tones: Story = {
    render: () => (
        <div className="max-w-2xl space-y-6">
            <SectionHeader label="how it works" />
            <SectionHeader label="the ecosystem" meta="one spec · two packages" />
            <SectionHeader label="pending" tone="warning" meta="awaiting anchor" />
            <SectionHeader label="verified" tone="success" />
            <SectionHeader label="revoked" tone="destructive" />
            <SectionHeader label="archived" tone="muted" />
        </div>
    ),
};
