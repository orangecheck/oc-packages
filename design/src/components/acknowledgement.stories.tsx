import type { Meta, StoryObj } from '@storybook/react';
import { Acknowledgement } from '../composites';

const meta = {
    title: 'Composites/Acknowledgement',
    component: Acknowledgement,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Acknowledgement>;

export default meta;
type Story = StoryObj<typeof meta>;

/** The usual placement: a bottom CTA sitting on a BrandBand. */
export const OnBrand: Story = {
    render: () => (
        <div className="bg-brand p-10 text-center">
            <Acknowledgement tone="onBrand" />
        </div>
    ),
};

export const Default: Story = {
    render: () => (
        <div className="p-10 text-center">
            <Acknowledgement />
        </div>
    ),
};
