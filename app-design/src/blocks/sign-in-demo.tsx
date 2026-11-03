import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';

import { Mark } from '../brand/mark';
import { BrowserFrame } from '../components/frames';
import { announce } from '../lib/announce';
import { cn } from '../lib/cn';
import { useOnScreen, usePrefersStill } from './parts';

/*
 * Our sign-in, played on a made-up app inside a browser window. It plays by
 * itself only while a third of it is on screen in a tab someone is looking
 * at, and pauses where it was otherwise. It plays through once and rests.
 * The first press, key or focus inside it stops the autoplay for good; then
 * the step buttons under the window drive it, and each step is said once.
 * Under reduced motion it never plays: the first step shows, with the
 * buttons. The window itself is a picture (aria-hidden): the step list is
 * what a screen reader reads.
 */

export interface SignInDemoScreenState {
    /** True while autoplay is running this step: a screen may type, a field may show its caret. */
    playing: boolean;
    /** True while the cursor presses the screen's `data-demo-target` control. */
    pressed: boolean;
    /** The success picture, from SignInDemo's `success`. */
    success: ReactNode;
}

export interface SignInDemoStep {
    /** The step's words: under the window, and said when a reader moves to it. */
    label: string;
    /** How long autoplay holds the step, in ms. */
    duration?: number;
    /** The window's content. The control the cursor presses carries `data-demo-target`. */
    screen: (state: SignInDemoScreenState) => ReactNode;
}

export interface SignInDemoProps {
    /** Default: `signInDemoSteps()`, email → code → in. */
    steps?: SignInDemoStep[];
    /** What the last screen shows for success, e.g. a MiniCheck. Default: the mark. */
    success?: (state: { playing: boolean }) => ReactNode;
    /** The demo's name, for a screen reader. */
    label?: string;
    /** What a reader hears on moving to a step. */
    stepWords?: (step: SignInDemoStep, index: number, count: number) => string;
    /** The step list's name. */
    stepsLabel?: string;
    /** The address in the window's bar; null shows none. */
    url?: string | null;
    /** `ink` on a dark or burnt ground, `paper` on the page. */
    tone?: 'ink' | 'paper';
    className?: string;
}

const STEP_MS = 3200;
// Within a step: when the cursor sets off for the control, and when it presses it.
const AIM = 0.42;
const PRESS = 0.8;
const GLIDE = 'cubic-bezier(0.65, 0, 0.35, 1)';

type Mode = 'auto' | 'manual' | 'still';

export function SignInDemo({
    steps = DEFAULT_STEPS,
    success,
    label = 'Sign-in demo',
    stepWords = (s, i, n) => `${s.label}, step ${i + 1} of ${n}`,
    stepsLabel = 'Steps',
    url = null,
    tone = 'ink',
    className,
}: SignInDemoProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<HTMLDivElement>(null);
    const fillRef = useRef<HTMLSpanElement>(null);
    const still = usePrefersStill();
    const onScreen = useOnScreen(rootRef, 0.35);
    const [mode, setMode] = useState<Mode>('auto');
    const [index, setIndex] = useState(0);
    const [phase, setPhase] = useState<'show' | 'aim' | 'press'>('show');
    const [done, setDone] = useState(false);
    const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
    // Time spent in a step before a pause, so a resumed step picks up where it stopped.
    const spent = useRef({ index: -1, ms: 0 });

    const effective: Mode = still ? 'still' : mode;
    const active = effective === 'auto' && onScreen && !done;
    const last = index === steps.length - 1;
    const step = steps[Math.min(index, steps.length - 1)]!;
    const duration = step.duration ?? STEP_MS;

    // The timeline of one step: aim, press, next. Paused, it keeps its place.
    useEffect(() => {
        if (!active) return;
        const before = spent.current.index === index ? spent.current.ms : 0;
        const start = performance.now() - before;
        const at = (ms: number, fn: () => void) => (ms > before ? setTimeout(fn, ms - before) : undefined);
        const timers = [
            last ? undefined : at(duration * AIM, () => setPhase('aim')),
            last ? undefined : at(duration * PRESS, () => setPhase('press')),
            at(duration, () => {
                if (last) setDone(true);
                else {
                    setIndex((i) => i + 1);
                    setPhase('show');
                }
            }),
        ];
        return () => {
            spent.current = { index, ms: performance.now() - start };
            timers.forEach((t) => t !== undefined && clearTimeout(t));
        };
    }, [active, index, duration, last]);

    // Every animation inside (the bar's fill, the typing, the cursor's glide) holds while autoplay holds.
    useEffect(() => {
        const root = rootRef.current;
        if (!root || effective !== 'auto') return;
        for (const a of root.getAnimations({ subtree: true })) {
            if (active) {
                if (a.playState === 'paused') a.play();
            } else if (a.playState === 'running') a.pause();
        }
    }, [active, effective, index, phase]);

    // The current step's bar fills over the step: progress, as the time runs.
    useLayoutEffect(() => {
        const fill = fillRef.current;
        if (!fill || effective !== 'auto' || done || typeof fill.animate !== 'function') return;
        const a = fill.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration, easing: 'linear', fill: 'forwards' });
        if (!active) a.pause();
        return () => a.cancel();
        // Only a new step starts a new fill; pausing is the effect above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [index, effective, done, duration]);

    // Each new screen fades up, while it plays by itself.
    useLayoutEffect(() => {
        const view = viewRef.current;
        if (!view || effective !== 'auto' || typeof view.animate !== 'function') return;
        view.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 350, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }, [index, effective]);

    // The cursor: at rest low right, over the control it will press, and out of the way at the end.
    const aim = useCallback(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const s = stage.getBoundingClientRect();
        const rest = { x: s.width * 0.78, y: s.height * 0.82 };
        const target = viewRef.current?.querySelector<HTMLElement>('[data-demo-target]');
        if (phase !== 'show' && target) {
            const t = target.getBoundingClientRect();
            setCursor({ x: t.left - s.left + t.width * 0.62, y: t.top - s.top + t.height * 0.55 });
        } else {
            // A new screen leaves the cursor where it pressed, until it sets off again.
            setCursor((c) => (c && !last ? c : rest));
        }
    }, [phase, last]);
    useLayoutEffect(() => {
        if (effective === 'auto') aim();
    }, [aim, effective, index]);
    useEffect(() => {
        const stage = stageRef.current;
        if (!stage || effective !== 'auto' || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => aim());
        ro.observe(stage);
        return () => ro.disconnect();
    }, [aim, effective]);

    // Any input takes over for good. A step a reader moves to is said once.
    const takeOver = () => {
        if (mode === 'auto') setMode('manual');
    };
    const go = (i: number) => {
        takeOver();
        setDone(false);
        setPhase('show');
        setIndex(i);
        const s = steps[i];
        if (s) announce(stepWords(s, i, steps.length));
    };
    // A press on the pictured control does what it says: the next step.
    const onStageClick = (e: MouseEvent) => {
        const target = viewRef.current?.querySelector('[data-demo-target]');
        if (target && target.contains(e.target as Node) && !last) go(index + 1);
    };

    const ink = tone === 'ink';
    const playing = active;
    const pressed = effective === 'auto' && phase === 'press';
    const screen = step.screen({ playing, pressed, success: (success ?? defaultSuccess)({ playing }) });
    const cursorStyle: CSSProperties | undefined = cursor
        ? { transform: `translate(${cursor.x}px, ${cursor.y}px)`, transition: `transform 950ms ${GLIDE}` }
        : undefined;

    return (
        <div
            ref={rootRef}
            role="group"
            aria-label={label}
            data-demo-mode={effective}
            data-demo-step={index}
            className={cn('flex w-full flex-col gap-6', className)}
            onPointerDownCapture={takeOver}
            onKeyDownCapture={takeOver}
            onFocusCapture={takeOver}
        >
            <div ref={stageRef} className="relative" onClick={onStageClick}>
                <BrowserFrame variant="paper" glow url={url}>
                    <div ref={viewRef} aria-hidden className="flex h-[22rem] items-center justify-center bg-white px-4 text-foreground md:h-[25rem] dark:bg-oca-ink-card">
                        {screen}
                    </div>
                </BrowserFrame>
                {effective === 'auto' && cursor ? (
                    <span aria-hidden data-demo-cursor="" className="pointer-events-none absolute left-0 top-0 z-10 will-change-transform" style={cursorStyle}>
                        <Cursor pressed={pressed} />
                    </span>
                ) : null}
            </div>
            <ol aria-label={stepsLabel} className="grid gap-2.5 md:gap-5" style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
                {steps.map((s, i) => {
                    const state = i < index || (i === index && done) ? 'done' : i === index ? 'current' : 'upcoming';
                    return (
                        <li key={i} className="min-w-0">
                            <button
                                type="button"
                                aria-current={i === index ? 'step' : undefined}
                                data-state={state}
                                onClick={() => go(i)}
                                className={cn(
                                    'group flex min-h-11 w-full flex-col items-stretch gap-2.5 pt-1 text-left outline-none',
                                    'focus-visible:ring-2 focus-visible:ring-offset-2',
                                    ink ? 'focus-visible:ring-oca-orange focus-visible:ring-offset-oca-ink' : 'focus-visible:ring-ring focus-visible:ring-offset-background'
                                )}
                            >
                                <span aria-hidden className={cn('relative block h-0.5 w-full overflow-hidden', ink ? 'bg-oca-ink-line' : 'bg-oca-hairline-strong')}>
                                    <span
                                        ref={i === index && effective === 'auto' && !done ? fillRef : undefined}
                                        className={cn('absolute inset-0 origin-left', ink ? 'bg-oca-orange' : 'bg-oca-orange-deep')}
                                        // Autoplay fills the current bar; a reader's step shows full. A transform, so the fill's animation replaces it.
                                        style={{ transform: state === 'upcoming' || (state === 'current' && effective === 'auto') ? 'scaleX(0)' : 'scaleX(1)' }}
                                    />
                                </span>
                                <span
                                    className={cn(
                                        'text-[0.8125rem] leading-snug md:text-[0.875rem]',
                                        state === 'upcoming'
                                            ? ink
                                                ? 'text-oca-ink-muted'
                                                : 'text-muted-foreground'
                                            : ink
                                              ? 'text-oca-ink-foreground'
                                              : 'text-foreground'
                                    )}
                                >
                                    {s.label}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ol>
        </div>
    );
}

/** The pointer the demo moves: an arrow, a press, a ring that spreads from it. */
function Cursor({ pressed }: { pressed: boolean }) {
    return (
        <span className="relative block">
            {pressed ? <Ripple /> : null}
            <svg
                width="22"
                height="26"
                viewBox="0 0 22 26"
                className="block origin-top-left transition-transform duration-150"
                style={{ transform: pressed ? 'scale(0.85)' : undefined }}
            >
                <path d="M1.5 1.5v20.2l5.4-5.1 3.6 8.1 3.7-1.6-3.6-8h7.5z" className="fill-oca-ink stroke-white" strokeWidth="1.4" strokeLinejoin="round" />
            </svg>
        </span>
    );
}

/** One ring per press, spreading and fading. */
function Ripple() {
    const ref = useRef<HTMLSpanElement>(null);
    useLayoutEffect(() => {
        ref.current?.animate?.([{ transform: 'scale(0.3)', opacity: 1 }, { transform: 'scale(1.4)', opacity: 0 }], { duration: 500, easing: 'ease-out', fill: 'forwards' });
    }, []);
    return <span ref={ref} className="absolute -left-3.5 -top-3.5 block size-7 rounded-full border-2 border-oca-orange" />;
}

function defaultSuccess() {
    return <Mark size={72} />;
}

/* ── The default steps: email → code → in ─────────────────────────────── */

export interface SignInDemoCopy {
    /** The made-up app being signed in to. */
    appName: string;
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
}

const PLACEHOLDER: SignInDemoCopy = {
    appName: 'Lumen Notes',
    email: 'you@example.com',
    code: '482913',
    brand: 'orangecheck',
    labels: ['Enter your email', 'Type the code', "You're in"],
    emailTitle: 'Sign in to Lumen Notes',
    emailBody: 'We email you a one-time code.',
    emailField: 'Email',
    sendCode: 'Send code',
    codeTitle: 'Check your email',
    codeBody: 'Type the code we sent to you@example.com.',
    verify: 'Verify',
    doneTitle: "You're in.",
    doneBody: 'Signed in to Lumen Notes.',
};

// The app drawn in the window is a product, so it keeps its rounded corners (a depiction, not the page).
const CARD = 'flex w-full max-w-[20rem] flex-col gap-3 rounded-[0.875rem] border border-border bg-white p-6 shadow-[0_18px_40px_-24px_rgb(42_18_6/0.45)] dark:bg-oca-ink-card';
const TARGET =
    'mt-1 flex h-10 items-center justify-center rounded-[0.625rem] bg-brand text-[0.875rem] font-medium text-brand-foreground transition-transform duration-150 data-[pressed=true]:scale-[0.97]';

/** The text types itself while the step plays; otherwise it is simply there. */
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
        // Typed once per step, from the start of its play.
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
            screen: ({ playing, pressed }) => (
                <div className={CARD}>
                    <BrandLine name={c.brand} />
                    <span className="text-[1.125rem] font-medium leading-snug">{c.emailTitle}</span>
                    <span className="text-[0.8125rem] leading-snug text-muted-foreground">{c.emailBody}</span>
                    <span className="mt-1 text-[0.75rem] font-medium">{c.emailField}</span>
                    <span className="flex h-10 items-center rounded-[0.625rem] border border-input px-3 font-mono text-[0.8125rem]">
                        <Typed text={c.email} playing={playing} />
                    </span>
                    <span data-demo-target="" data-pressed={pressed} className={TARGET}>
                        {c.sendCode}
                    </span>
                </div>
            ),
        },
        {
            label: c.labels[1],
            screen: ({ playing, pressed }) => (
                <div className={CARD}>
                    <BrandLine name={c.brand} />
                    <span className="text-[1.125rem] font-medium leading-snug">{c.codeTitle}</span>
                    <span className="text-[0.8125rem] leading-snug text-muted-foreground">{c.codeBody}</span>
                    <span className="mt-1 flex gap-1.5">
                        {[...c.code].map((d, i) => (
                            <span key={i} className="flex h-11 min-w-0 flex-1 items-center justify-center rounded-[0.5rem] border border-input font-mono text-[1rem]">
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
        {
            label: c.labels[2],
            duration: 2400,
            screen: ({ success }) => (
                <div className="flex flex-col items-center gap-3 text-center text-foreground">
                    <span className="flex h-24 items-center justify-center">{success}</span>
                    <span className="text-[1.25rem] font-medium">{c.doneTitle}</span>
                    <span className="text-[0.875rem] text-muted-foreground">{c.doneBody}</span>
                </div>
            ),
        },
    ];
}

const DEFAULT_STEPS = signInDemoSteps();
