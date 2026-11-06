import { Activity, AppWindow, Check, CircleUser, House, Wallet } from 'lucide-react';
import { useLayoutEffect, useRef, type ReactNode } from 'react';

import { PhoneFrame } from '../components/frames';
import { cn } from '../lib/cn';
import { DitherMark } from './dither-mark';

/*
 * The phone beside the sign-in demo's window: the account in your hand. It
 * rests dark while the window signs in, and wakes on the account's Home
 * once the demo reaches its last step. What it shows is ochk.app as it is
 * drawn: square, hairlines, mono labels, the five places under the thumb.
 * Only the device itself is round. Its words are placeholders until a site
 * passes its own, and none is a real account.
 */

export interface SignInDemoPhoneCopy {
    /** The page on the phone. */
    title: string;
    /** Beside the title: the picture is a sample. null shows none. */
    sample: string | null;
    signedInAs: string;
    email: string;
    /** The account at a glance: a label and its value. */
    rows: { label: string; value: ReactNode }[];
    recentTitle: string;
    /** What happened lately: what, where, and what it paid. */
    recent: { title: string; where: string; amount: string }[];
    /** The tab bar, drawn as AppShell's: the first is the page shown. */
    tabs: { label: string; icon: ReactNode }[];
}

const PLACEHOLDER: SignInDemoPhoneCopy = {
    title: 'Home',
    sample: 'Sample',
    signedInAs: 'Signed in as',
    email: 'you@example.com',
    rows: [
        { label: 'Sign in', value: '2 ways' },
        {
            label: 'Back it',
            value: (
                <span className="inline-flex items-center gap-1">
                    <Check aria-hidden className="size-3.5 text-oca-accent-ink" />
                    Yes
                </span>
            ),
        },
        { label: 'Get paid', value: '217 sats' },
    ],
    recentTitle: 'Recent activity',
    recent: [
        { title: 'Comment posted', where: 'forum.example', amount: '+12 sats' },
        { title: 'Session', where: 'news.example', amount: '+5 sats' },
        { title: 'Account created', where: 'shop.example', amount: '+200 sats' },
    ],
    tabs: [
        { label: 'Home', icon: <House /> },
        { label: 'Activity', icon: <Activity /> },
        { label: 'Balance', icon: <Wallet /> },
        { label: 'Apps', icon: <AppWindow /> },
        { label: 'Account', icon: <CircleUser /> },
    ],
};

/** The phone's words: the placeholders, with a site's own in their place. */
export function signInDemoPhone(copy: Partial<SignInDemoPhoneCopy> = {}): SignInDemoPhoneCopy {
    return { ...PLACEHOLDER, ...copy };
}

const LABEL = 'oca-label leading-none text-oca-surface-muted';
const LINE = 'border-oca-surface-foreground/10';

/** The account's Home, as a phone draws it. */
function Home({ copy, wake }: { copy: SignInDemoPhoneCopy; wake: false | 'now' | 'after' }) {
    const ref = useRef<HTMLDivElement>(null);
    // Woken, the screen lights from black, the page rising a little behind it.
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || !wake || typeof el.animate !== 'function') return;
        el.animate([{ opacity: 0, transform: 'translateY(8px)' }, { opacity: 1, transform: 'none' }], {
            duration: wake === 'after' ? 650 : 300,
            delay: wake === 'after' ? 550 : 0,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
            fill: 'backwards',
        });
        // Once, as it wakes.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
        <div ref={ref} data-demo-phone-home="" className="absolute inset-0 flex flex-col bg-oca-surface text-[0.8125rem] text-oca-surface-foreground">
            <div className="flex min-h-0 flex-1 flex-col gap-4 px-4 pt-12">
                <div className="flex items-center justify-between gap-2">
                    <span className="text-[1.5rem] font-light leading-none tracking-[-0.03em]">{copy.title}</span>
                    {copy.sample ? <span className={cn(LABEL, LINE, 'border px-1.5 py-1')}>{copy.sample}</span> : null}
                </div>
                <div className={cn('flex flex-col gap-1.5 border-y py-3', LINE)}>
                    <span className={cn(LABEL, 'flex items-center gap-2')}>
                        <span aria-hidden className="size-[7px] shrink-0 bg-oca-accent-display" />
                        {copy.signedInAs}
                    </span>
                    <span className="truncate text-[0.9375rem]">{copy.email}</span>
                </div>
                <dl className={cn('-mt-2 flex flex-col divide-y', LINE)}>
                    {copy.rows.map((r) => (
                        <div key={r.label} className={cn('flex items-center justify-between gap-2 py-2', LINE)}>
                            <dt className="text-oca-surface-muted">{r.label}</dt>
                            <dd className="oca-tabular">{r.value}</dd>
                        </div>
                    ))}
                </dl>
                <span className={cn(LABEL, 'mt-1')}>{copy.recentTitle}</span>
                <ul className={cn('-mt-2 flex flex-col divide-y', LINE)}>
                    {copy.recent.map((r) => (
                        <li key={r.title} className={cn('flex items-center justify-between gap-2 py-1.5', LINE)}>
                            <span className="flex min-w-0 flex-col">
                                <span className="truncate">{r.title}</span>
                                <span className="truncate text-[0.75rem] text-oca-surface-muted">{r.where}</span>
                            </span>
                            <span className="oca-tabular shrink-0 text-oca-accent-ink">{r.amount}</span>
                        </li>
                    ))}
                </ul>
            </div>
            {/* The tab bar laid out as AppShell's TabBar, the first place shown. */}
            <div className={cn('grid shrink-0 border-t px-0.5 pb-6 pt-2', LINE)} style={{ gridTemplateColumns: `repeat(${copy.tabs.length}, minmax(0, 1fr))` }}>
                {copy.tabs.map((t, i) => (
                    <span
                        key={t.label}
                        data-demo-phone-tab=""
                        className={cn('flex min-w-0 flex-col items-center gap-1 text-[0.75rem] leading-none', i === 0 ? 'text-oca-surface-foreground' : 'text-oca-surface-muted')}
                    >
                        <span
                            className={cn(
                                'flex h-7 w-12 max-w-full items-center justify-center [&_svg]:size-[1.125rem] [&_svg]:shrink-0',
                                i === 0 ? 'bg-oca-surface-foreground/[0.06] ring-1 ring-oca-surface-foreground/15 [&_svg]:stroke-2' : '[&_svg]:stroke-[1.75]'
                            )}
                        >
                            {t.icon}
                        </span>
                        <span className="max-w-full truncate">{t.label}</span>
                    </span>
                ))}
            </div>
        </div>
    );
}

/**
 * The phone itself. `awake` shows the account; `wake` says how it came on:
 * 'after' once the window's last screen has had a moment, 'now' at once,
 * false with no motion at all (reduced motion, or drawn awake from the start).
 */
export function DemoPhone({ copy, awake, wake, className }: { copy: SignInDemoPhoneCopy; awake: boolean; wake: false | 'now' | 'after'; className?: string }) {
    return (
        <div aria-hidden data-demo-phone={awake ? 'awake' : 'asleep'} className={cn('relative isolate flex justify-center', className)}>
            {/* Its own light, kept inside its column on a phone so it never widens the page. */}
            <div className="pointer-events-none absolute inset-x-0 -inset-y-[8%] -z-10 bg-[image:var(--oca-glow)] lg:-inset-x-[25%]" />
            <PhoneFrame className="max-w-full">
                {/* The screen at rest: dark glass holding the dithered mark, the light catching its top corner. */}
                <div className="absolute inset-0 flex items-center justify-center bg-[#0b0b0c] pb-[30%]">
                    <DitherMark size="sm" ground="dark" className="opacity-80" />
                </div>
                <div className="absolute inset-0 bg-[linear-gradient(150deg,rgb(255_255_255/0.08),transparent_40%)]" />
                {awake ? <Home copy={copy} wake={wake} /> : null}
            </PhoneFrame>
        </div>
    );
}
