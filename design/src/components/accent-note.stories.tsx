import type { Meta, StoryObj } from '@storybook/react';
import { AccentList, AccentNote } from '../composites';

const meta = {
    title: 'Composites/AccentNote',
    component: AccentNote,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof AccentNote>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <div className="max-w-xl">
            <AccentNote lead="Trust anchor:">
                v0 relays on a named beacon. Its address is plaintext in the spec — receipt-freeness
                is not solved yet, and we say so.
            </AccentNote>
        </div>
    ),
};

export const OnBrand: Story = {
    render: () => (
        <div className="bg-brand max-w-xl p-8">
            <AccentNote tone="onBrand" lead="No custody.">
                Funds never move. The protocol only reads public chain state.
            </AccentNote>
        </div>
    ),
};

export const Stepped: Story = {
    render: () => (
        <div className="max-w-md">
            <AccentList
                items={[
                    { title: 'Sign', children: 'Prove control of your address with BIP-322.' },
                    {
                        title: 'Mint',
                        active: true,
                        children: 'The signed bytes are hashed to a content address and published.',
                    },
                    { title: 'Verify', children: 'Anyone checks it offline against chain data.' },
                ]}
            />
        </div>
    ),
};
