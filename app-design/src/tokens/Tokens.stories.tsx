import type { Meta, StoryObj } from '@storybook/react';

import { Display, Eyebrow, Lead } from '../components';

const meta: Meta = { title: 'Tokens' };
export default meta;

const SWATCHES: [string, string][] = [
    ['--background', 'canvas'],
    ['--card', 'card'],
    ['--muted', 'muted'],
    ['--foreground', 'ink'],
    ['--muted-foreground', 'muted text'],
    ['--oca-subtle-foreground', 'subtle text'],
    ['--border', 'hairline'],
    ['--oca-hairline-strong', 'hairline, strong'],
    ['--brand', 'brand orange (fills)'],
    ['--oca-accent-display', 'accent, display text'],
    ['--oca-accent-ink', 'accent, small text'],
    ['--oca-peach', 'mark top'],
    ['--oca-orange-light', 'mark left'],
    ['--oca-orange-deep', 'mark right'],
    ['--oca-ink', 'ink band'],
    ['--oca-ink-card', 'ink card'],
    ['--oca-ink-title', 'ink card title'],
    ['--oca-code-package', 'code: package'],
    ['--oca-code-tag', 'code: tag'],
    ['--oca-code-link', 'code: link'],
    ['--success', 'success'],
    ['--warning', 'warning'],
    ['--destructive', 'danger'],
    ['--info', 'info'],
];

export const Colors: StoryObj = {
    render: () => (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
            {SWATCHES.map(([v, label]) => (
                <div key={v} className="overflow-hidden rounded-2xl border border-border bg-card">
                    <div className="h-20 border-b border-border" style={{ background: `var(${v})` }} />
                    <div className="flex flex-col gap-0.5 p-3">
                        <span className="text-sm font-medium">{label}</span>
                        <code className="text-xs text-muted-foreground">{v}</code>
                    </div>
                </div>
            ))}
        </div>
    ),
};

export const Type: StoryObj = {
    render: () => (
        <div className="flex max-w-4xl flex-col gap-10">
            <div className="flex flex-col gap-2">
                <Eyebrow>oca-display-1 · hero</Eyebrow>
                <Display level={1}>Make fake accounts cost something real.</Display>
            </div>
            <div className="flex flex-col gap-2">
                <Eyebrow>oca-display-2 · section</Eyebrow>
                <Display level={2}>Ask for something a bot can't fake cheaply.</Display>
            </div>
            <div className="flex flex-col gap-2">
                <Eyebrow>oca-display-3 · page</Eyebrow>
                <Display level={3}>What's true today.</Display>
            </div>
            <div className="flex flex-col gap-2">
                <Eyebrow>oca-title · card</Eyebrow>
                <p className="oca-title">Sign in</p>
            </div>
            <div className="flex flex-col gap-2">
                <Eyebrow>oca-lead</Eyebrow>
                <Lead>Fewer bots, without holding your users' data.</Lead>
            </div>
            <div className="flex flex-col gap-2">
                <Eyebrow>oca-body</Eyebrow>
                <p className="oca-body max-w-md">
                    A user signs one message with their Bitcoin address. Nothing else to fill in.
                </p>
            </div>
            <div className="flex flex-col gap-2">
                <Eyebrow>mono</Eyebrow>
                <code className="text-[0.9375rem]">did:oc:ed30f1d9fc9acf7a88283069a2f97fc8</code>
            </div>
        </div>
    ),
};
