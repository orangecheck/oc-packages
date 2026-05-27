import type { Meta, StoryObj } from '@storybook/react';

import { DefinitionList } from '../composites';

const meta = {
    title: 'Composites/DefinitionList',
    component: DefinitionList,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof DefinitionList>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="max-w-lg border p-5">
            <DefinitionList
                items={[
                    { label: 'anchor', value: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh' },
                    { label: 'balance', value: '210,000 sats' },
                    { label: 'state', value: 'ratified' },
                    { label: 'txid', value: '4a5e1e4baab89f3a32518a88c31bc87f618f76673e2cc77ab2127b7afdeda33b' },
                ]}
            />
        </div>
    ),
};
