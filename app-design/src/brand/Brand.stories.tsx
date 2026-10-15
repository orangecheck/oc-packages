import type { Meta, StoryObj } from '@storybook/react';

import portrait from '../assets/portrait-halftone-600.webp';
import { AppIcon, HalftoneSphere, IsoCheck, Lockup, Mark } from './index';

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
