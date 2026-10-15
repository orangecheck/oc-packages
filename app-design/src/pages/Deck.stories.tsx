import type { Meta, StoryObj } from '@storybook/react';

import portrait from '../assets/portrait-halftone-600.webp';
import { HalftoneSphere, IsoCheck, Lockup } from '../brand';
import {
    Accent,
    Display,
    Eyebrow,
    Footnote,
    Lead,
    PackageCard,
    Section,
    SectionIntro,
    StepGrid,
    TruthTable,
} from '../components';
import { Button } from '../primitives';

/*
 * Souheila's partner deck (2026-10-15), slide for slide, as one web page. It is
 * the reference the system is checked against, and the template for a partner
 * page. The fee line on slide 5 is hers, flagged in her own notes to confirm before
 * it goes out; it is true of the open layer and not of me.ochk, which takes a fee.
 */
const meta: Meta = { title: 'Pages/Partner deck', parameters: { fullBleed: true } };
export default meta;

export const Deck: StoryObj = {
    render: () => (
        <div>
            {/* 1 — title */}
            <Section space="lg">
                <div className="grid items-center gap-12 md:grid-cols-[1.4fr_1fr] md:gap-10">
                    <div className="flex flex-col gap-7">
                        <Lockup size={36} />
                        <Display level={1}>
                            Make fake accounts cost something <Accent>real</Accent>.
                        </Display>
                        <Lead>Fewer bots, without holding your users' data.</Lead>
                    </div>
                    <HalftoneSphere src={portrait} alt="A person smiling, printed as a halftone" stadium className="mx-auto w-full max-w-[26rem]" />
                </div>
                <p className="mt-16 text-[0.875rem] text-muted-foreground">Design partner deck · in testing · ochk.io</p>
            </Section>

            {/* 2 — the problem */}
            <Section tone="ink" space="lg">
                <SectionIntro className="max-w-3xl">
                    <Eyebrow onInk>The problem</Eyebrow>
                    <Display level={2}>A bot farm can pretend to be a crowd for almost nothing.</Display>
                    <p className="oca-lead text-oca-ink-muted">The usual fixes ask your real users for more: a phone number, a puzzle, an ID.</p>
                </SectionIntro>
            </Section>

            {/* 3 — how it works */}
            <Section>
                <SectionIntro>
                    <Eyebrow>How it works</Eyebrow>
                    <Display level={2}>Ask for something a bot can't fake cheaply.</Display>
                </SectionIntro>
                <StepGrid
                    look="plain"
                    className="mt-12"
                    items={[
                        { title: 'Sign one message', body: 'A user signs one message with their Bitcoin address. Nothing else to fill in.' },
                        { title: 'You set the bar', body: 'Your app checks the address held a minimum of sats, unspent, for a minimum number of days.' },
                        { title: 'Nothing moves', body: 'No sats change hands. Nobody holds them. Anyone can check the result against Bitcoin.' },
                    ]}
                />
            </Section>

            {/* 4 — what you get */}
            <Section tone="ink">
                <SectionIntro>
                    <Eyebrow onInk>What you get</Eyebrow>
                    <Display level={2}>Open packages for the stack you already run.</Display>
                </SectionIntro>
                <PackageCard
                    className="mt-10"
                    items={[
                        { title: 'A drop-in gate', code: '@orangecheck/gate', note: 'Middleware for Express, Next, Fastify, Hono and Workers.' },
                        { title: 'A Nostr relay filter', code: '@orangecheck/relay-filter', note: 'For strfry. Turns away events from npubs with no bitcoin behind them.' },
                        { title: 'Sign in with Bitcoin', code: '<OcSignInButton />', kind: 'tag', note: 'React components, and sessions that work across your sites.' },
                        { title: 'All of it open', code: 'MIT code · CC-BY-4.0 specs', kind: 'link', note: 'TypeScript and Python SDKs. Fork it or host it yourself.' },
                    ]}
                />
            </Section>

            {/* 5 — what it costs */}
            <Section tone="brand" space="lg">
                <SectionIntro className="max-w-3xl">
                    <p className="text-[0.9375rem]">What it costs</p>
                    <Display level={2}>An afternoon of integration. No fees.</Display>
                    <p className="text-[1.0625rem]">We help you wire it up and answer technical questions directly.</p>
                </SectionIntro>
            </Section>

            {/* 6 — for your users */}
            <Section>
                <SectionIntro>
                    <Eyebrow>For your users</Eyebrow>
                    <Display level={2}>Sign in. Earn. Own.</Display>
                </SectionIntro>
                <StepGrid
                    className="mt-12"
                    items={[
                        { title: 'Sign in', body: 'The way they always do. Email or a wallet. Nothing new to learn.' },
                        { title: 'Earn', badge: 'in testing', body: 'Small amounts for things they already do online, shared by your app.' },
                        { title: 'Own', badge: 'on the path', body: 'Over time, it moves into a wallet they hold themselves.' },
                    ]}
                />
            </Section>

            {/* 7 — the honest version */}
            <Section>
                <SectionIntro>
                    <Eyebrow>The honest version</Eyebrow>
                    <Display level={2}>What's true today.</Display>
                </SectionIntro>
                <TruthTable
                    className="mt-10"
                    rows={[
                        { status: 'yes', what: 'Open source. Anyone can verify it against Bitcoin.' },
                        { status: 'yes', what: 'No token. No ads.' },
                        { status: 'testing', what: 'Earning on me.ochk.io. Payouts run on test networks until testing ends.' },
                        { status: 'testing', what: "Custody. orangecheck holds it today, then independent operators, then users' own wallets." },
                    ]}
                />
                <Footnote className="mt-6">
                    Who holds what today: <a className="underline underline-offset-4" href="https://me.ochk.io/custody">me.ochk.io/custody</a>
                </Footnote>
            </Section>

            {/* 8 — why partner now */}
            <Section tone="ink">
                <SectionIntro className="max-w-3xl">
                    <Eyebrow onInk>Why partner now</Eyebrow>
                    <Display level={2}>We're building it with a few apps before it opens up.</Display>
                </SectionIntro>
                <StepGrid
                    look="ink"
                    className="mt-12"
                    items={[
                        { title: 'You shape it', body: 'What your integration needs gets built. Real needs, not guesses.' },
                        { title: 'A direct line', body: 'You talk to the person who built it. Not a sales team.' },
                        { title: 'Ready when it opens', body: 'Integrate during testing. Be live when real users arrive early next year.' },
                    ]}
                />
            </Section>

            {/* 9 — the call */}
            <Section space="lg">
                <div className="grid items-center gap-14 md:grid-cols-[1.2fr_1fr]">
                    <div className="flex flex-col gap-8">
                        <Display level={2}>A 20-minute call. Tell us about your spam problem.</Display>
                        <div className="flex flex-wrap gap-3">
                            <Button size="lg" asChild>
                                <a href="mailto:hello@ochk.io">hello@ochk.io</a>
                            </Button>
                            <Button size="lg" variant="secondary" asChild>
                                <a href="https://docs.ochk.io">docs.ochk.io</a>
                            </Button>
                        </div>
                    </div>
                    <div className="flex justify-center">
                        <IsoCheck size={380} settle />
                    </div>
                </div>
                <p className="mt-20 text-[0.875rem] text-muted-foreground">
                    The open layer is supported by an OpenSats grant · ochk.io · github.com/orangecheck
                </p>
            </Section>
        </div>
    ),
};
