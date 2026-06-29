import type { Meta, StoryObj } from '@storybook/react';
import { ComparisonTable } from '../composites';

const meta = {
    title: 'Composites/ComparisonTable',
    component: ComparisonTable,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof ComparisonTable>;

export default meta;
type Story = StoryObj<typeof meta>;

const ROWS = [
    { label: 'Account required', theirs: 'Email + password', ours: 'A Bitcoin address' },
    { label: 'Sybil resistance', theirs: 'CAPTCHA, phone', ours: 'Stake + patience' },
    { label: 'Who holds your data', theirs: 'The platform', ours: 'Nobody — content-addressed' },
    { label: 'Verifiable offline', theirs: 'Trust the server', ours: 'Any node, any verifier' },
];

export const Default: Story = {
    render: () => <ComparisonTable rows={ROWS} />,
};

export const CustomColumns: Story = {
    render: () => (
        <ComparisonTable
            rows={ROWS}
            columns={{ feature: 'Property', theirs: 'A normal login', ours: 'OrangeCheck' }}
        />
    ),
};
