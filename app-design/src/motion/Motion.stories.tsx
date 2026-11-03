import type { Meta, StoryObj } from '@storybook/react';

import portrait from '../assets/portrait-halftone-600.webp';
import { Eyebrow } from '../components/typography';
import { CrowdDissolve, DitherImage, Marquee, MiniCheck, ParticlePortrait, ParticleText, PORTRAIT_ANCHORS, ScrollStory, StackCards, StorySwap, Wipe } from './index';

/*
 * The family's motion (@orangecheck/app-design/motion). Each scene draws its
 * moment and then sleeps; under reduced motion each shows its end. The words
 * here are examples: a site brings its own, checked against its truth tests.
 */
const meta: Meta = { title: 'Motion' };
export default meta;

export const Portrait: StoryObj = {
    name: 'Particle portrait',
    render: () => (
        <section className="mx-auto max-w-[82.5rem]">
            <ParticlePortrait
                alt="A person drawn in dots"
                className="h-[min(78svh,44rem)]"
                callouts={[
                    { at: PORTRAIT_ANCHORS.eye, label: 'A note on a hairline leader' },
                    { at: PORTRAIT_ANCHORS.hand, label: 'Real text, not canvas' },
                    { at: PORTRAIT_ANCHORS.shoulder, label: 'Dots from the deck portrait', side: 'right' },
                    { at: PORTRAIT_ANCHORS.sleeve, label: 'It sleeps once formed', side: 'right' },
                    { at: PORTRAIT_ANCHORS.wrist, label: 'Pause it any time' },
                ]}
            />
        </section>
    ),
};

export const Text: StoryObj = {
    name: 'Particle text',
    render: () => (
        <div className="flex flex-col items-center gap-4 py-12">
            <p className="m-0 leading-none">
                <ParticleText className="text-[clamp(4.5rem,18vw,9rem)] font-light tracking-[-0.04em] text-[var(--oca-accent-display)]">
                    80%
                </ParticleText>
            </p>
            <p className="m-0 text-muted-foreground">An example caption under the numeral.</p>
        </div>
    ),
};

export const Crowd: StoryObj = {
    name: 'Crowd dissolve',
    render: () => (
        <ScrollStory length={2.6}>
            <div className="mx-auto grid w-full max-w-[82.5rem] items-center gap-8 px-4 md:grid-cols-[2fr_3fr]">
                <StorySwap
                    before={
                        <>
                            <Eyebrow>To an app</Eyebrow>
                            <h2 className="oca-display-2 mt-3">You look like everyone else.</h2>
                        </>
                    }
                    after={
                        <>
                            <Eyebrow>With a backed account</Eyebrow>
                            <h2 className="oca-display-2 mt-3">You stand out as real.</h2>
                        </>
                    }
                />
                <CrowdDissolve className="aspect-[4/3] w-full" />
            </div>
        </ScrollStory>
    ),
};

export const Check: StoryObj = {
    name: 'Mini check',
    render: () => (
        <div className="flex flex-col items-center gap-3 py-12">
            <MiniCheck title="Signed in to Lumen Notes" />
            <p className="m-0">You’re in.</p>
        </div>
    ),
};

export const Stack: StoryObj = {
    name: 'Stack cards',
    render: () => (
        <StackCards top="4rem" className="mx-auto max-w-[60rem] pb-[50svh]">
            {['01', '02', '03'].map((n) => (
                <article key={n} className="flex h-[min(70svh,30rem)] flex-col justify-between border border-border bg-card p-8">
                    <h3 className="oca-display-3 m-0">An example step {n}</h3>
                    <p className="m-0 self-end text-[4.5rem] font-light leading-none text-[var(--oca-accent-display)]">{n}</p>
                </article>
            ))}
        </StackCards>
    ),
};

export const Line: StoryObj = {
    name: 'Marquee',
    render: () => (
        <Marquee>
            {['Lumen Notes', 'Halfway Books', 'An example line'].map((w) => (
                <span key={w} className="pr-[0.5em] text-[clamp(3rem,8vw,6rem)] font-light tracking-[-0.04em]">
                    {w} <span className="text-[var(--oca-accent-display)]">·</span>
                </span>
            ))}
        </Marquee>
    ),
};

export const Dither: StoryObj = {
    name: 'Dither image',
    render: () => (
        <div className="flex flex-col items-center gap-4 py-8">
            {/* A site passes a baked two-tone still from ./art; the deck's halftone stands in here. */}
            <DitherImage src={portrait} width={600} height={600} alt="" dark="#0d0a08" className="w-full max-w-[28rem]" />
            <p className="m-0 text-muted-foreground">With a mouse, move over the picture: the screen comes alive where you pass, then settles.</p>
        </div>
    ),
};

export const Opening: StoryObj = {
    name: 'Wipe',
    render: () => (
        <div className="flex flex-col gap-[60svh] py-[30svh]">
            <p className="m-0 text-muted-foreground">Scroll: the banner below opens as it comes into view.</p>
            <Wipe className="bg-[var(--oca-burnt)] p-16 text-[var(--oca-burnt-foreground)]">
                <h2 className="oca-display-2 m-0">An example statement, framed and opened.</h2>
            </Wipe>
        </div>
    ),
};
