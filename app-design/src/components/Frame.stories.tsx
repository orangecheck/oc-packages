import type { Meta, StoryObj } from '@storybook/react';

import { Button } from '../primitives';
import { Display, Faq, Lead, MonoLabel, PageFrame, PageHero, Section, SectionBar, SectionHeading, StatRow } from './index';

const meta: Meta = { title: 'Components/Frame (2.0)' };
export default meta;

/** The one eyebrow: mono, uppercase, a 7px ember square. */
export const Labels: StoryObj = {
    render: () => (
        <div className="flex flex-col gap-4">
            <MonoLabel>How it works</MonoLabel>
            <MonoLabel mark={false}>Without its square</MonoLabel>
        </div>
    ),
};

/** The framed column, a title-block bar, and the hairline stat grid. */
export const FramedColumn: StoryObj = {
    render: () => (
        <Section framed space="none" rule frameClassName="flex flex-col gap-10 py-12">
                <SectionBar start="Lumen Notes" end="01 / 04" />
                <Display level={2}>Notes that know who wrote them.</Display>
                <Lead>Lumen Notes asks for a backed account before a note can be shared.</Lead>
                <StatRow
                    items={[
                        { value: '240', label: 'Sign-ups this week' },
                        { value: '192', label: 'Backed', note: 'One coin each' },
                        { value: '48', label: 'Unbacked' },
                    ]}
                />
        </Section>
    ),
};

/**
 * The section shell: a Section's own bar across its frame, the body under it, and a heading with its
 * lead beside the title from lg. Contained in a PageFrame, then framed on the ink band.
 */
export const SectionShell: StoryObj = {
    render: () => (
        <PageFrame as="div">
            <Section rule bar={{ start: 'What you can store', end: '01 / 02' }}>
                <SectionHeading
                    layout="split"
                    title="Ten kinds of entry. Every secret you actually have."
                    lead="Each entry is encrypted on its own with AES-256-GCM under your vault key. Mix and match."
                />
            </Section>
            <Section framed tone="ink" bar={{ start: 'Data and funds', end: '02 / 02' }}>
                <SectionHeading layout="split" eyebrow="What we store" title="What we store, and what can move funds" lead="Every field, and what happens if we disappear." />
            </Section>
        </PageFrame>
    ),
};

/** The grounds a page header and a section can take. */
export const Grounds: StoryObj = {
    render: () => (
        <div className="flex flex-col">
            <PageHero eyebrow="Halfway Books" title="Paper ground" lead="The page itself." actions={<Button plus>Get started</Button>} />
            <PageHero ground="ink" eyebrow="Halfway Books" title="Ink ground" lead="The dark band, paper text." />
            <PageHero ground="brand" eyebrow="Halfway Books" title="Orange ground" lead="Ink text on orange, never white." />
            <Section tone="burnt">
                <div className="flex flex-col gap-6">
                    <MonoLabel>The burnt band</MonoLabel>
                    <Display level={3}>Paper text, orange and ember on dark brown.</Display>
                    <StatRow
                        columns={3}
                        items={[
                            { value: '3', label: 'Grounds' },
                            { value: '1', label: 'Eyebrow' },
                            { value: '0', label: 'Radius' },
                        ]}
                    />
                </div>
            </Section>
        </div>
    ),
};

/** 2.0's FAQ: hairline rows and a "+". */
export const FaqRule: StoryObj = {
    render: () => (
        <div className="max-w-3xl">
            <Faq
                items={[
                    { q: 'Does Halfway Books see my address?', a: 'No. Halfway Books learns only that you passed its check.' },
                    { q: 'Is backing required?', a: 'Backing is optional; an app may ask for it.' },
                ]}
            />
        </div>
    ),
};
