import type { Meta, StoryObj } from '@storybook/react';
import { StatGrid } from '@orangecheck/ui';

const meta = {
    title: 'Composites/StatGrid',
    component: StatGrid,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof StatGrid>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dashboard: Story = {
    render: () => (
        <StatGrid
            columns={4}
            items={[
                { label: 'stamps minted', value: '12,408', sub: 'all time' },
                { label: 'anchored', value: '12,401', tone: 'success', accent: true },
                { label: 'pending', value: '7', tone: 'warning' },
                { label: 'failed', value: '0', tone: 'muted' },
            ]}
        />
    ),
};

export const Tones: Story = {
    render: () => (
        <StatGrid
            columns={3}
            items={[
                { label: 'primary', value: '21M', tone: 'primary' },
                { label: 'success', value: '99.9%', tone: 'success' },
                { label: 'destructive', value: '3', tone: 'destructive' },
            ]}
        />
    ),
};
