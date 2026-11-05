import { useCallback, useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type MouseEvent, type ReactNode } from 'react';

import { Mark } from '../brand/mark';
import { BrowserFrame } from '../components/frames';
import { announce } from '../lib/announce';
import { cn } from '../lib/cn';
import { useOnScreen, usePrefersStill } from './parts';
import { signInDemoSteps } from './sign-in-demo-app';
import { DemoPhone, signInDemoPhone, type SignInDemoPhoneCopy } from './sign-in-demo-phone';

/*
 * Our sign-in, played on a made-up app inside a browser window. It plays by
 * itself only while a third of it is on screen in a tab someone is looking
 * at, and pauses where it was otherwise. It plays through once and rests.
 * The first press, key or focus inside it stops the autoplay for good; then
 * the step buttons under the window drive it, and each step is said once.
 * "Try again", on the last screen, plays it from the start. Under reduced
 * motion it never plays: the first step shows, with the buttons. The window
 * itself is a picture (aria-hidden): the step list and Try again are what a
 * screen reader reaches. A step may hold several screens (the email, then
 * the code, under one label). The steps read the ground's tokens, so on an
 * ink or burnt band they take its colours; the window keeps the product
 * surface's own.
 *
 * With `phone`, a phone stands beside the window (under it, on a phone's
 * screen): the account in your hand. It rests dark while the window signs
 * in and wakes on the account's Home at the last step; under reduced motion
 * it shows the account, still. It is a picture too.
 */

export interface SignInDemoScreenState {
    /** True while autoplay is running this step: a screen may type, a field may show its caret. */
    playing: boolean;
    /** True while the cursor presses the screen's `data-demo-target` control. */
    pressed: boolean;
    /** The success picture, from SignInDemo's `success`. */
    success: ReactNode;
}

export interface SignInDemoScreen {
    /** How long autoplay holds the screen, in ms. */
    duration?: number;
    /** The window's content. The control the cursor presses carries `data-demo-target`. */
    render: (state: SignInDemoScreenState) => ReactNode;
}

export interface SignInDemoStep {
    /** The step's words: under the window, and said when a reader moves to it. */
    label: string;
    /** Its screens, in turn: a step button opens the first. */
    screens: SignInDemoScreen[];
}

export interface SignInDemoProps {
    /** Default: `signInDemoSteps()`: the app's sign-in, the email and code, you're in. */
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
    /** The control on the last screen that plays the demo again. */
    tryAgain?: string;
    /**
     * A phone beside the window that wakes on the account at the last step. `true` draws it with placeholder
     * words; an object passes a site's own, over the placeholders (`signInDemoPhone`).
     */
    phone?: boolean | Partial<SignInDemoPhoneCopy>;
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
    tryAgain = 'Try again',
    phone,
    className,
}: SignInDemoProps) {
    const rootRef = useRef<HTMLDivElement>(null);
    const stageRef = useRef<HTMLDivElement>(null);
    const viewRef = useRef<HTMLDivElement>(null);
    const fillRef = useRef<HTMLSpanElement>(null);
    const firstStepRef = useRef<HTMLButtonElement>(null);
    const againRef = useRef<HTMLButtonElement>(null);
    const still = usePrefersStill();
    const onScreen = useOnScreen(rootRef, 0.35);
    const [mode, setMode] = useState<Mode>('auto');
    // The screen on show, counted across every step's screens.
    const [index, setIndex] = useState(0);
    const [phase, setPhase] = useState<'show' | 'aim' | 'press'>('show');
    const [done, setDone] = useState(false);
    const [cursor, setCursor] = useState<{ x: number; y: number } | null>(null);
    // Time spent on a screen before a pause, so a resumed screen picks up where it stopped.
    const spent = useRef({ index: -1, ms: 0 });

    const scenes = steps.flatMap((s, step) => s.screens.map((screen) => ({ ...screen, step })));
    const effective: Mode = still ? 'still' : mode;
    const active = effective === 'auto' && onScreen && !done;
    const last = index === scenes.length - 1;
    const scene = scenes[Math.min(index, scenes.length - 1)]!;
    const stepIndex = scene.step;
    const duration = scene.duration ?? STEP_MS;
    // A step's bar fills over all its screens.
    const stepMs = steps[stepIndex]!.screens.reduce((t, sc) => t + (sc.duration ?? STEP_MS), 0);
    const firstScene = (step: number) => scenes.findIndex((sc) => sc.step === step);

    // The timeline of one screen: aim, press, next. Paused, it keeps its place.
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
        const a = fill.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration: stepMs, easing: 'linear', fill: 'forwards' });
        if (!active) a.pause();
        return () => a.cancel();
        // Only a new step starts a new fill (a step's later screens keep it); pausing is the effect above.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [stepIndex, effective, done, stepMs]);

    // Each new screen fades up, while it plays by itself.
    useLayoutEffect(() => {
        const view = viewRef.current;
        if (!view || effective !== 'auto' || typeof view.animate !== 'function') return;
        view.animate([{ opacity: 0, transform: 'translateY(6px)' }, { opacity: 1, transform: 'none' }], { duration: 350, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }, [index, effective]);

    // The cursor: at rest low right, over the control it will press, and parked on Try again at the end.
    const aim = useCallback(() => {
        const stage = stageRef.current;
        if (!stage) return;
        const s = stage.getBoundingClientRect();
        const rest = { x: s.width * 0.78, y: s.height * 0.82 };
        const target = last ? againRef.current : viewRef.current?.querySelector<HTMLElement>('[data-demo-target]');
        if ((phase !== 'show' || last) && target) {
            const t = target.getBoundingClientRect();
            setCursor({ x: t.left - s.left + t.width * 0.62, y: t.top - s.top + t.height * 0.55 });
        } else {
            // A new screen leaves the cursor where it pressed, until it sets off again.
            setCursor((c) => c ?? rest);
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
    const show = (sceneIndex: number) => {
        takeOver();
        setDone(false);
        setPhase('show');
        setIndex(sceneIndex);
        const step = scenes[sceneIndex]?.step;
        if (step !== undefined && step !== stepIndex) announce(stepWords(steps[step]!, step, steps.length));
    };
    // A press on the pictured control does what it says: the next screen.
    const onStageClick = (e: MouseEvent) => {
        const target = viewRef.current?.querySelector('[data-demo-target]');
        if (target && target.contains(e.target as Node) && !last) show(index + 1);
    };
    // Try again: from the start, playing by itself again (the reader asked for it), with focus on the first step.
    // That focus runs this render's takeOver, which already saw the press on Try again, so autoplay stays on.
    const replay = () => {
        spent.current = { index: -1, ms: 0 };
        setIndex(0);
        setPhase('show');
        setDone(false);
        setMode('auto');
        firstStepRef.current?.focus({ preventScroll: true });
    };

    // The phone wakes at the last step, after the window's own moment while it plays; under reduced motion it is
    // simply awake.
    const phoneCopy = phone ? signInDemoPhone(phone === true ? undefined : phone) : null;
    const awake = effective === 'still' || stepIndex === steps.length - 1;
    const wake = effective === 'still' ? false : effective === 'auto' ? 'after' : 'now';

    const playing = active;
    const pressed = effective === 'auto' && phase === 'press';
    const screen = scene.render({ playing, pressed, success: (success ?? defaultSuccess)({ playing }) });
    const cursorStyle: CSSProperties | undefined = cursor
        ? { transform: `translate(${cursor.x}px, ${cursor.y}px)`, transition: `transform 950ms ${GLIDE}` }
        : undefined;

    return (
        <div
            ref={rootRef}
            role="group"
            aria-label={label}
            data-demo-mode={effective}
            data-demo-step={stepIndex}
            data-demo-screen={index}
            className={cn(
                // Beside a phone from lg: the window and its steps, the phone lapping the window's edge, lower down.
                phoneCopy ? 'grid w-full grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:grid-rows-[auto_1fr] lg:gap-x-0' : 'flex w-full flex-col gap-6',
                className
            )}
            onPointerDownCapture={takeOver}
            onKeyDownCapture={takeOver}
            onFocusCapture={takeOver}
        >
            <div ref={stageRef} className={cn('relative', phoneCopy && 'lg:col-start-1 lg:row-start-1')} onClick={onStageClick}>
                <BrowserFrame variant="paper" glow url={url}>
                    <div ref={viewRef} aria-hidden className="flex h-[25rem] items-center justify-center bg-oca-surface px-4 pb-10 text-oca-surface-foreground md:h-[27rem]">
                        {screen}
                    </div>
                </BrowserFrame>
                {last ? (
                    <button
                        ref={againRef}
                        type="button"
                        onClick={replay}
                        className="absolute bottom-3 left-1/2 inline-flex min-h-11 -translate-x-1/2 items-center px-3 text-[0.8125rem] text-oca-surface-muted underline underline-offset-4 hover:text-oca-surface-foreground focus-visible:[outline:2px_solid_var(--ring)]"
                    >
                        {tryAgain}
                    </button>
                ) : null}
                {effective === 'auto' && cursor ? (
                    <span aria-hidden data-demo-cursor="" className="pointer-events-none absolute left-0 top-0 z-10 will-change-transform" style={cursorStyle}>
                        <Cursor pressed={pressed} />
                    </span>
                ) : null}
            </div>
            <ol aria-label={stepsLabel} className={cn('grid gap-2.5 md:gap-5', phoneCopy && 'lg:col-start-1 lg:row-start-2 lg:pr-16')} style={{ gridTemplateColumns: `repeat(${steps.length}, minmax(0, 1fr))` }}>
                {steps.map((s, i) => {
                    const state = i < stepIndex || (i === stepIndex && done) ? 'done' : i === stepIndex ? 'current' : 'upcoming';
                    return (
                        <li key={i} className="min-w-0">
                            <button
                                ref={i === 0 ? firstStepRef : undefined}
                                type="button"
                                aria-current={i === stepIndex ? 'step' : undefined}
                                data-state={state}
                                onClick={() => show(firstScene(i))}
                                className={cn(
                                    // The ring is drawn whole: outline-none would leave outline-2 a style of none.
                                    'group flex min-h-11 w-full flex-col items-stretch gap-2.5 pt-1 text-left',
                                    'focus-visible:[outline:2px_solid_var(--ring)] focus-visible:outline-offset-2'
                                )}
                            >
                                <span aria-hidden className="relative block h-0.5 w-full overflow-hidden bg-border">
                                    <span
                                        ref={i === stepIndex && effective === 'auto' && !done ? fillRef : undefined}
                                        className="absolute inset-0 origin-left bg-oca-accent-display"
                                        // Autoplay fills the current bar; a reader's step shows full. A transform, so the fill's animation replaces it.
                                        style={{ transform: state === 'upcoming' || (state === 'current' && effective === 'auto') ? 'scaleX(0)' : 'scaleX(1)' }}
                                    />
                                </span>
                                <span
                                    className={cn(
                                        'text-[0.8125rem] leading-snug md:text-[0.875rem]',
                                        state === 'upcoming' ? 'text-muted-foreground' : 'text-foreground'
                                    )}
                                >
                                    {s.label}
                                </span>
                            </button>
                        </li>
                    );
                })}
            </ol>
            {phoneCopy ? (
                <DemoPhone
                    copy={phoneCopy}
                    awake={awake}
                    wake={wake}
                    className="mt-2 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:-ml-12 lg:mt-10 lg:self-start"
                />
            ) : null}
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

const DEFAULT_STEPS = signInDemoSteps();
