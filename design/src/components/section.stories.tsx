import type { Meta, StoryObj } from '@storybook/react';
import { BrandBand, MarketingHeading, Section } from '../composites';
import { Button } from '../primitives';

const meta = {
    title: 'Composites/Section',
    component: Section,
    parameters: { layout: 'fullscreen' },
} satisfies Meta<typeof Section>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Tones: Story = {
    render: () => (
        <>
            <Section tone="default">
                <MarketingHeading lead="Default band." muted="The neutral page background." />
            </Section>
            <Section tone="muted">
                <MarketingHeading lead="Muted band." muted="A recessed gray stripe." />
            </Section>
            <Section tone="dark">
                <MarketingHeading lead="Dark band." muted="Forced-dark on a light page." />
            </Section>
        </>
    ),
};

export const Brand: Story = {
    render: () => (
        <BrandBand>
            <div className="flex flex-col items-center gap-6 text-center">
                <MarketingHeading
                    tone="onBrand"
                    align="center"
                    lead="One identity for the open web."
                    muted="No KYC, no custody, no permission."
                />
                <div className="flex gap-3">
                    <Button variant="onBrand">Get started</Button>
                    <Button variant="onBrandOutline">Read the spec</Button>
                </div>
            </div>
        </BrandBand>
    ),
};
