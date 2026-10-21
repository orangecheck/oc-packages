import type { Meta, StoryObj } from '@storybook/react';

import portrait from '../assets/portrait-halftone-600.webp';
import { OgCard } from '../og';
import { AppIcon, Crowd, HalftoneSphere, IsoCheck, Lockup, Mark } from './index';

const meta: Meta = { title: 'Brand' };
export default meta;

export const MarkAndIcon: StoryObj = {
    name: 'Mark and icon',
    render: () => (
        <div className="flex flex-wrap items-end gap-12">
            <Mark size={240} title="orangecheck" />
            <Mark size={96} />
            <Mark size={32} />
            <AppIcon size={96} title="orangecheck" />
            <AppIcon size={48} />
            <AppIcon size={24} />
        </div>
    ),
};

export const Lockups: StoryObj = {
    render: () => (
        <div className="flex flex-col gap-8">
            <Lockup size={40} />
            <Lockup size={28} />
            <Lockup size={22} />
            <div className="w-fit rounded-2xl bg-oca-ink p-6 text-white">
                <Lockup size={28} />
            </div>
        </div>
    ),
};

export const Check: StoryObj = {
    name: 'Isometric check',
    render: () => (
        <div className="flex items-center justify-center py-16">
            <IsoCheck size={420} settle title="A checkmark" />
        </div>
    ),
};

export const Sphere: StoryObj = {
    name: 'Halftone sphere',
    render: () => (
        <div className="grid items-center gap-12 md:grid-cols-2">
            <HalftoneSphere src={portrait} alt="A person smiling, in halftone" stadium className="mx-auto max-w-sm" />
            <HalftoneSphere src={portrait} alt="" float className="mx-auto max-w-[12rem]" />
        </div>
    ),
};

export const CrowdStory: StoryObj = {
    name: 'Crowd',
    render: () => (
        <div className="flex flex-col gap-8">
            <div className="rounded-2xl bg-oca-ink p-8">
                <Crowd />
            </div>
            <Crowd tone="canvas" cols={18} rows={6} real={4} className="max-w-xl" />
        </div>
    ),
};

/**
 * The share card, as next/og draws it (@orangecheck/app-design/og), shown here
 * at half size in the browser's own Inter. The route renders it with ogFonts().
 */
export const ShareCard: StoryObj = {
    name: 'Share card',
    render: () => (
        <div className="flex flex-col gap-6">
            {(
                [
                    { tone: 'ink', product: 'stamp', eyebrow: 'OC Stamp', title: 'Prove who signed it, and when.', host: 'stamp.ochk.io' },
                    { tone: 'paper', product: 'vault', eyebrow: 'Vault', title: 'Secrets your heirs can open, sealed to Bitcoin keys.', host: 'vault.ochk.io' },
                ] as const
            ).map((card) => (
                <div key={card.tone} className="max-w-full overflow-hidden rounded-2xl border border-border" style={{ width: 600, height: 315 }}>
                    <div style={{ width: 1200, height: 630, transform: 'scale(0.5)', transformOrigin: '0 0', display: 'flex' }}>
                        <OgCard {...card} />
                    </div>
                </div>
            ))}
        </div>
    ),
};
