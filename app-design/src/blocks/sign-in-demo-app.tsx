import { useLayoutEffect, useRef } from 'react';

import { Mark } from '../brand/mark';
import type { SignInDemoStep } from './sign-in-demo';

/*
 * The made-up app the sign-in demo draws inside its window: a product, so it
 * keeps its own rounded corners (check-render names this file, and only
 * this file, round by meaning). The demo's own parts, the step list, Try
 * again and the cursor, live in sign-in-demo.tsx and stay square.
 */

export interface SignInDemoCopy {
    /** The made-up app being signed in to. */
    appName: string;
    appTitle: string;
    appBody: string;
    /** The app's orangecheck button, the one the cursor presses. */
    continueLabel: string;
    or: string;
    /** The app's other ways in, drawn beside ours. */
    alternatives: string[];
    email: string;
    /** The one-time code typed in; its length is the number of boxes. */
    code: string;
    brand: string;
    labels: [string, string, string];
    emailTitle: string;
    emailBody: string;
    emailField: string;
    sendCode: string;
    codeTitle: string;
    codeBody: string;
    verify: string;
    doneTitle: string;
    doneBody: string;
    tookTitle: string;
    /** What it took, as figures: "0" "new passwords". */
    took: { value: string; label: string }[];
}

const PLACEHOLDER: SignInDemoCopy = {
    appName: 'Lumen Notes',
    appTitle: 'Sign in to Lumen Notes',
    appBody: 'One account for every app that uses orangecheck.',
    continueLabel: 'Continue with orangecheck',
    or: 'or',
    alternatives: ['Google', 'GitHub'],
    email: 'you@example.com',
    code: '482913',
    brand: 'orangecheck',
    labels: ['Tap the button', 'Confirm your email', "You're in"],
    emailTitle: 'Sign in',
    emailBody: 'We email you a one-time code.',
    emailField: 'Email',
    sendCode: 'Send code',
    codeTitle: 'Check your email',
    codeBody: 'Type the code we sent to you@example.com.',
    verify: 'Verify',
    doneTitle: "You're in.",
    doneBody: 'Signed in to Lumen Notes as you@example.com.',
    tookTitle: 'What it took',
    took: [
        { value: '0', label: 'new passwords' },
        { value: '0', label: 'ID checks' },
    ],
};

// The app drawn in the window is a product, so it keeps its rounded corners (a depiction, not the page).
const CARD = 'flex w-full max-w-[20rem] flex-col gap-3 rounded-[0.875rem] border border-oca-surface-foreground/10 bg-oca-surface p-6 shadow-[0_18px_40px_-24px_rgb(42_18_6/0.45)]';
// The app's own colours, so a band's re-pointed tokens never reach into the window: the surface's muted token
// (check-contrast holds it on the surface); a field's edge, its ink at half strength, is 3.5:1 and 4.6:1.
const QUIET = 'text-oca-surface-muted';
const FIELD = 'border border-oca-surface-foreground/50';
const TARGET =
    'mt-1 flex h-10 items-center justify-center rounded-[0.625rem] bg-brand text-[0.875rem] font-medium text-brand-foreground transition-transform duration-150 data-[pressed=true]:scale-[0.97]';

/** The text types itself while the screen plays; otherwise it is simply there. */
function Typed({ text, playing, delay = 400, perChar = 55 }: { text: string; playing: boolean; delay?: number; perChar?: number }) {
    const ref = useRef<HTMLSpanElement>(null);
    useLayoutEffect(() => {
        const el = ref.current;
        if (!el || !playing || typeof el.animate !== 'function') return;
        el.animate([{ clipPath: 'inset(0 100% 0 0)' }, { clipPath: 'inset(0 0 0 0)' }], {
            duration: text.length * perChar,
            delay,
            easing: `steps(${text.length}, end)`,
            fill: 'backwards',
        });
        // Typed once per screen, from the start of its play.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);
    return (
        <span ref={ref} className="inline-block whitespace-nowrap">
            {text}
        </span>
    );
}

function BrandLine({ name }: { name: string }) {
    return (
        <span className="flex items-center gap-2 text-[0.875rem] font-medium">
            <Mark size={20} />
            {name}
        </span>
    );
}

/** The demo's default steps, with the words a site passes in place of the placeholders. */
export function signInDemoSteps(copy: Partial<SignInDemoCopy> = {}): SignInDemoStep[] {
    const c = { ...PLACEHOLDER, ...copy };
    return [
        {
            label: c.labels[0],
            screens: [
                {
                    duration: 2800,
                    render: ({ pressed }) => (
                        <div className={CARD}>
                            <span className="text-[1.125rem] font-medium leading-snug">{c.appTitle}</span>
                            <span className={`text-[0.8125rem] leading-snug ${QUIET}`}>{c.appBody}</span>
                            <span data-demo-target="" data-pressed={pressed} className={`${TARGET} relative pl-12 pr-3`}>
                                <span className="absolute inset-y-1 left-1 flex w-9 items-center justify-center rounded-[0.4375rem] bg-white">
                                    <Mark size={20} />
                                </span>
                                {c.continueLabel}
                            </span>
                            <span className={`flex items-center gap-3 text-[0.75rem] ${QUIET}`}>
                                <span className="h-px flex-1 bg-oca-surface-foreground/10" />
                                {c.or}
                                <span className="h-px flex-1 bg-oca-surface-foreground/10" />
                            </span>
                            <span className="grid grid-cols-2 gap-2">
                                {c.alternatives.map((a) => (
                                    <span key={a} className="flex h-10 items-center justify-center rounded-[0.625rem] border border-oca-surface-foreground/15 text-[0.8125rem]">
                                        {a}
                                    </span>
                                ))}
                            </span>
                        </div>
                    ),
                },
            ],
        },
        {
            label: c.labels[1],
            screens: [
                {
                    duration: 3000,
                    render: ({ playing, pressed }) => (
                        <div className={CARD}>
                            <BrandLine name={c.brand} />
                            <span className="text-[1.125rem] font-medium leading-snug">{c.emailTitle}</span>
                            <span className={`text-[0.8125rem] leading-snug ${QUIET}`}>{c.emailBody}</span>
                            <span className="mt-1 text-[0.75rem] font-medium">{c.emailField}</span>
                            <span className={`flex h-10 items-center rounded-[0.625rem] px-3 font-mono text-[0.8125rem] ${FIELD}`}>
                                <Typed text={c.email} playing={playing} />
                            </span>
                            <span data-demo-target="" data-pressed={pressed} className={TARGET}>
                                {c.sendCode}
                            </span>
                        </div>
                    ),
                },
                {
                    duration: 2800,
                    render: ({ playing, pressed }) => (
                        <div className={CARD}>
                            <BrandLine name={c.brand} />
                            <span className="text-[1.125rem] font-medium leading-snug">{c.codeTitle}</span>
                            <span className={`text-[0.8125rem] leading-snug ${QUIET}`}>{c.codeBody}</span>
                            <span className="mt-1 flex gap-1.5">
                                {[...c.code].map((d, i) => (
                                    <span key={i} className={`flex h-11 min-w-0 flex-1 items-center justify-center rounded-[0.5rem] font-mono text-[1rem] ${FIELD}`}>
                                        <Typed text={d} playing={playing} delay={400 + i * 140} perChar={1} />
                                    </span>
                                ))}
                            </span>
                            <span data-demo-target="" data-pressed={pressed} className={TARGET}>
                                {c.verify}
                            </span>
                        </div>
                    ),
                },
            ],
        },
        {
            label: c.labels[2],
            screens: [
                {
                    duration: 3000,
                    render: ({ success }) => (
                        <div className="flex w-full max-w-[18rem] flex-col items-center gap-2.5 text-center">
                            <span className="flex h-20 items-center justify-center">{success}</span>
                            <span className="text-[1.25rem] font-medium">{c.doneTitle}</span>
                            <span className={`text-[0.8125rem] ${QUIET}`}>{c.doneBody}</span>
                            <span className="mt-1 flex w-full flex-col gap-2 rounded-[0.875rem] border border-oca-surface-foreground/10 p-3 text-left">
                                <span className={`text-[0.75rem] ${QUIET}`}>{c.tookTitle}</span>
                                <span className="grid grid-cols-2 gap-3">
                                    {c.took.map((t) => (
                                        <span key={t.label} className="flex flex-col gap-0.5">
                                            <span className="text-[1.5rem] leading-none">{t.value}</span>
                                            <span className={`text-[0.75rem] ${QUIET}`}>{t.label}</span>
                                        </span>
                                    ))}
                                </span>
                            </span>
                        </div>
                    ),
                },
            ],
        },
    ];
}
