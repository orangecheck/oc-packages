import type { Meta, StoryObj } from '@storybook/react';

import { Bar } from './bar';

const meta = {
    title: 'Data/Bar',
    component: Bar,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Bar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Accents: Story = {
    render: () => (
        <div className="max-w-md space-y-4">
            <Bar pct={72} label="escrow used" right="72%" />
            <Bar pct={88} accent="warning" label="seats" right="88 / 100" />
            <Bar pct={96} accent="destructive" label="rate limit" right="96%" />
            <Bar pct={40} accent="success" label="anchored" right="40%" />
        </div>
    ),
};
