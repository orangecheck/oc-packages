import type { Meta, StoryObj } from '@storybook/react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from './accordion';

const meta = {
    title: 'Primitives/Accordion',
    component: Accordion,
    parameters: { layout: 'padded' },
} satisfies Meta<typeof Accordion>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
    render: () => (
        <Accordion type="single" collapsible className="max-w-xl">
            <AccordionItem value="a">
                <AccordionTrigger>what is a stamp?</AccordionTrigger>
                <AccordionContent>
                    A Bitcoin-anchored signature over any hash — authorship + priority, verifiable
                    offline forever.
                </AccordionContent>
            </AccordionItem>
            <AccordionItem value="b">
                <AccordionTrigger>does it cost anything?</AccordionTrigger>
                <AccordionContent>
                    No fees. Stamps anchor via OpenTimestamps aggregation.
                </AccordionContent>
            </AccordionItem>
            <AccordionItem value="c">
                <AccordionTrigger>can I verify without OrangeCheck?</AccordionTrigger>
                <AccordionContent>
                    Yes — the proof is self-contained and checks against Bitcoin directly.
                </AccordionContent>
            </AccordionItem>
        </Accordion>
    ),
};
