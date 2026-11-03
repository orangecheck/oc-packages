import type { Meta, StoryObj } from '@storybook/react';
import { useId, useState } from 'react';

import { Mark } from '../brand/mark';
import { Section } from '../components/section';
import { BentoGrid, BentoTile, CostDemo, DitherMark, ReceiptCard, SignInDemo, Slider, StepPath } from './index';

/*
 * The interactive blocks, with made-up apps (Lumen Notes, Halfway Books) and
 * placeholder words: a site passes its own gated copy.
 */

const meta: Meta = { title: 'Interactive blocks', parameters: { fullBleed: true } };
export default meta;

export const SignIn: StoryObj = {
    name: 'Sign-in demo',
    render: () => (
        // On the burnt band, as the prototype stages it: the band re-points the steps' colours.
        <Section tone="burnt">
            <div className="mx-auto max-w-[50rem]">
                <SignInDemo />
            </div>
        </Section>
    ),
};

export const SignInPaper: StoryObj = {
    name: 'Sign-in demo, on paper',
    render: () => (
        <Section>
            <div className="mx-auto max-w-[50rem]">
                <SignInDemo url="lumen-notes.example" />
            </div>
        </Section>
    ),
};

export const Cost: StoryObj = {
    name: 'Cost demo',
    render: () => (
        <div className="bg-oca-ink px-4 py-14 md:px-12">
            <div className="mx-auto max-w-[82.5rem]">
                <CostDemo labels={{ foot: 'Backed accounts pass. A thousand new ones cost a thousand coins.' }} />
            </div>
        </div>
    ),
};

export const CostPaper: StoryObj = {
    name: 'Cost demo, on paper',
    render: () => (
        <div className="bg-background px-4 py-14 md:px-12">
            <div className="mx-auto max-w-[82.5rem]">
                <CostDemo tone="paper" />
            </div>
        </div>
    ),
};

function SliderExample() {
    const id = useId();
    const [days, setDays] = useState(30);
    return (
        <div className="flex max-w-sm flex-col gap-2">
            <span id={id} className="text-[0.875rem] text-muted-foreground">
                Held for at least
            </span>
            <span className="text-[2rem] font-light leading-none">{days} days</span>
            <Slider
                aria-labelledby={id}
                min={1}
                max={90}
                value={days}
                onValueChange={setDays}
                valueText={(d) => `${d} ${d === 1 ? 'day' : 'days'}`}
                marks={[
                    { value: 1, label: '1 day' },
                    { value: 45, label: '45' },
                    { value: 90, label: '90' },
                ]}
            />
        </div>
    );
}

export const SliderStory: StoryObj = {
    name: 'Slider',
    render: () => (
        <div className="bg-background p-6 md:p-12">
            <SliderExample />
        </div>
    ),
};

const RECEIPT = (
    <ReceiptCard
        label="Receipt"
        title="A signed receipt you can check yourself."
        caption="Receipt from Halfway Books"
        unit="sats"
        rows={[
            { label: 'Reward from Halfway Books', amount: 240 },
            { label: 'To you', amount: 192 },
            { label: 'Fee', amount: 48 },
        ]}
        split={[
            { pct: 80, label: 'to you' },
            { pct: 20, label: 'fee' },
        ]}
        footer="Signed by the app"
        action={
            <a href="#check" className="inline-flex min-h-11 items-center font-mono text-[0.75rem] uppercase tracking-[0.08em] text-oca-accent-ink underline-offset-4 hover:underline">
                Check it →
            </a>
        }
    />
);

export const Receipt: StoryObj = {
    name: 'Receipt card',
    render: () => (
        <div className="bg-background p-4 md:p-12">
            <div className="max-w-[28rem]">{RECEIPT}</div>
        </div>
    ),
};

export const Bento: StoryObj = {
    name: 'Bento',
    render: () => (
        <div className="bg-muted p-4 md:p-12">
            <BentoGrid>
                <BentoTile span={2} rows={2} title="Sign in to Lumen Notes without showing your ID." art={<DitherMark size="md" />} footer={<Mark size={48} title="orangecheck" />} />
                <BentoTile tone="brand" numeral="0" title="new passwords to remember" />
                <BentoTile tone="ink" numeral="0" title="ID checks to get in" />
                <BentoTile tone="burnt" span={2} halftone numeral="up to 80%" title="of a reward can go to you.">
                    Coming soon.
                </BentoTile>
                <BentoTile tone="paper" title="You stand out as real." />
                <BentoTile tone="ink" art={<DitherMark size="sm" />} />
                <BentoTile tone="white" label="Receipts" title="Every reward comes with a receipt you can check." />
                <BentoTile tone="brand" label="For apps" title="Keep bots out of Halfway Books." />
            </BentoGrid>
        </div>
    ),
};

export const Path: StoryObj = {
    name: 'Step path',
    render: () => (
        <div className="bg-background p-6 md:p-16">
            <div className="mx-auto max-w-[36rem]">
                <StepPath current={2} steps={[{ label: 'Sign in' }, { label: 'Back it' }, { label: 'Get paid' }, { label: 'Own it' }]} />
            </div>
        </div>
    ),
};

export const Dither: StoryObj = {
    name: 'Dither mark',
    render: () => (
        <div className="flex flex-wrap items-end gap-10 bg-background p-6 md:p-12">
            <DitherMark size="sm" />
            <DitherMark size="md" />
            <DitherMark size="lg" title="orangecheck" />
        </div>
    ),
};
