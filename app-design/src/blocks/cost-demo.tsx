import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type HTMLAttributes, type ReactNode, type RefObject } from 'react';

import { announce } from '../lib/announce';
import { cn } from '../lib/cn';
import { MonoLabel } from '../components/frame';
import { Slider } from '../primitives/slider';
import { usePrefersStill } from './parts';

/*
 * What a bar costs to fake, worked live: two sliders step through the bars an
 * app can set (an amount held, for so many days), one number says what a
 * crowd of new accounts would have to hold to clear it, and a real person's
 * card says whether their one coin clears it. The crowd is one element: a
 * CSS grid of squares a single sweep of light crosses once per change, never
 * a node per account. Under reduced motion the sweep is off. Every word and
 * every number is the site's: the stops, the words for an amount and a span,
 * the sentences, and the cost itself. The default words are neutral
 * placeholders ("Label", "Value"), so a site that leaves one out shows
 * nothing it has not checked; the verdict words are ruling 11's. On ink
 * it re-points the text and hairline tokens, as a band does, so its parts
 * need no tone.
 */

/** The bar the two sliders set. */
export interface CostBar {
    sats: number;
    days: number;
}

export interface CostDemoLabels {
    kicker: string;
    amount: string;
    days: string;
    personKicker: string;
    /** Under the person: differs above and under the bar, and may name it. */
    personBody: (bar: CostBar, passes: boolean) => ReactNode;
    pass: string;
    fail: string;
    farmKicker: (accounts: number) => string;
    /** A line under the cost: what the crowd would need, and why. */
    farmBody: (bar: CostBar) => ReactNode;
    farmVerdict: string;
    foot?: ReactNode;
    /** Said to a screen reader once a change settles. */
    costSaid: (cost: string, bar: CostBar) => string;
    /** Said after the cost when that change moved the real person across the bar. */
    verdictSaid: (passes: boolean, bar: CostBar) => string;
}

export interface CostDemoProps extends Pick<HTMLAttributes<HTMLDivElement>, 'id' | 'role' | 'aria-label' | 'aria-labelledby'> {
    /** The amounts an app can set, in sats: the first slider's stops. */
    amounts?: number[];
    /** Which of `amounts` it starts on. */
    defaultAmountIndex?: number;
    /** The spans an app can set, in days: the second slider's stops. */
    dayStops?: number[];
    defaultDayIndex?: number;
    /** An amount in words: the readout, the slider's value text. */
    amountText?: (sats: number) => string;
    /** A span in words ("30 days", "a year"): the readout and the value text. */
    dayText?: (days: number) => string;
    /** An amount's tick under the slider. Default: 1k, 100k, 1M. */
    amountTick?: (sats: number) => string;
    /** A span's tick under the slider, short enough for a phone. Default: 7d, 30d, 1y. */
    dayTick?: (days: number) => string;
    /** What the crowd must hold to clear the bar. Default: accounts × the amount, in BTC from 0.01 BTC. */
    cost?: (bar: CostBar) => { value: string; unit: string };
    /** How many made-up accounts the crowd stands for. */
    accounts?: number;
    /** The real person's coin: what they hold, and for how long. */
    person?: CostBar;
    labels?: Partial<CostDemoLabels>;
    /** `ink` on a dark band, `paper` on the page. */
    tone?: 'ink' | 'paper';
    onChange?: (bar: CostBar) => void;
    className?: string;
}

// Ink, as the ink band draws it: the text and hairline tokens re-pointed, and the slider's thumb filled with the ground.
const INK =
    'bg-oca-ink text-oca-ink-foreground [--foreground:var(--oca-ink-foreground)] [--muted-foreground:var(--oca-ink-muted)] [--border:var(--oca-ink-line)] [--oca-ground:var(--oca-ink)]';

// A readout at display size, light: 24px and up.
const READOUT = 'oca-tabular text-[clamp(1.75rem,1.4rem+1.6vw,2.75rem)] font-light leading-none tracking-[-0.03em]';

const AMOUNTS = [1_000, 10_000, 100_000, 1_000_000, 10_000_000];
const DAYS = [7, 30, 90, 365];

/** 10k, 250k, 1M: a tick's words. */
function compact(n: number): string {
    if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`;
    return String(n);
}

const satsText = (n: number) => `${n.toLocaleString('en-US')} sats`;
const daysText = (d: number) => (d === 365 ? 'a year' : d === 1 ? '1 day' : `${d} days`);
const dayCompact = (d: number) => (d > 0 && d % 365 === 0 ? `${d / 365}y` : `${d}d`);

/** A total in BTC once it reaches a hundredth of one, in sats below that. */
export function costText(sats: number): { value: string; unit: string } {
    if (sats < 1_000_000) return { value: sats.toLocaleString('en-US'), unit: 'sats' };
    const btc = sats / 1e8;
    return { value: btc.toLocaleString('en-US', { maximumFractionDigits: btc >= 1 ? 1 : 2 }), unit: 'BTC' };
}

const clampIndex = (i: number, n: number) => Math.min(Math.max(i, 0), Math.max(n - 1, 0));

export function CostDemo({
    amounts = AMOUNTS,
    defaultAmountIndex = 2,
    dayStops = DAYS,
    defaultDayIndex = 1,
    amountText = satsText,
    dayText = daysText,
    amountTick = compact,
    dayTick = dayCompact,
    accounts = 1000,
    cost: costOf,
    person = { sats: 250_000, days: 180 },
    labels,
    tone = 'ink',
    onChange,
    className,
    ...aria
}: CostDemoProps) {
    const l: CostDemoLabels = {
        kicker: 'Label',
        amount: 'Label',
        days: 'Label',
        personKicker: 'Label',
        personBody: () => 'Value',
        pass: 'Gets in',
        fail: 'Under this bar',
        farmKicker: () => 'Label',
        farmBody: () => 'Value',
        farmVerdict: 'Value',
        costSaid: (c) => c,
        verdictSaid: (ok) => (ok ? l.pass : l.fail),
        ...labels,
    };
    const ink = tone === 'ink';
    const still = usePrefersStill();
    const [ai, setAi] = useState(clampIndex(defaultAmountIndex, amounts.length));
    const [di, setDi] = useState(clampIndex(defaultDayIndex, dayStops.length));
    const [changes, setChanges] = useState(0);
    const bar: CostBar = { sats: amounts[ai] ?? 0, days: dayStops[di] ?? 0 };
    const cost = (costOf ?? ((b: CostBar) => costText(b.sats * accounts)))(bar);
    // Gets in at or under the bar's amount and span.
    const passes = person.sats >= bar.sats && person.days >= bar.days;
    const ids = { amount: useId(), days: useId() };

    // One sweep across the crowd per change; none under reduced motion.
    const sweepRef = useRef<HTMLDivElement>(null);
    useLayoutEffect(() => {
        const el = sweepRef.current;
        if (!changes || still || !el || typeof el.animate !== 'function') return;
        const a = el.animate([{ transform: 'translateX(-100%)' }, { transform: 'translateX(100%)' }], {
            duration: 1300,
            easing: 'cubic-bezier(0.16, 1, 0.3, 1)',
        });
        return () => a.cancel();
    }, [changes, still]);

    // The total, said once a change settles: never a word per step of a drag. When the person crossed the bar
    // since the last thing said, the verdict follows in the same breath.
    const saidVerdict = useRef(passes);
    useEffect(() => {
        if (!changes) return;
        const t = setTimeout(() => {
            const crossed = passes !== saidVerdict.current;
            saidVerdict.current = passes;
            const total = l.costSaid(`${cost.value} ${cost.unit}`, bar);
            announce(crossed ? `${total}. ${l.verdictSaid(passes, bar)}` : total);
        }, 700);
        return () => clearTimeout(t);
        // Words follow the values; the label functions are the caller's.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [changes]);

    const change = (next: { ai?: number; di?: number }) => {
        const a = next.ai ?? ai;
        const d = next.di ?? di;
        if (a === ai && d === di) return;
        setAi(a);
        setDi(d);
        setChanges((c) => c + 1);
        onChange?.({ sats: amounts[a] ?? bar.sats, days: dayStops[d] ?? bar.days });
    };

    return (
        <div
            {...aria}
            data-cost-demo=""
            className={cn('grid border border-border', ink ? INK : 'bg-card text-foreground [--oca-ground:var(--card)]', className)}
        >
            <div className="grid divide-border lg:grid-cols-[1.15fr_0.8fr_1.05fr] lg:divide-x max-lg:divide-y">
                {/* The bar */}
                <div className="flex flex-col gap-7 p-6 md:p-8">
                    <MonoLabel as="span">{l.kicker}</MonoLabel>
                    <div className="flex flex-col gap-2">
                        <span id={ids.amount} className="text-[0.875rem] text-muted-foreground">
                            {l.amount}
                        </span>
                        <span data-readout="amount" className={READOUT}>
                            {amountText(bar.sats)}
                        </span>
                        <Slider
                            aria-labelledby={ids.amount}
                            min={0}
                            max={amounts.length - 1}
                            step={1}
                            value={ai}
                            onValueChange={(v) => change({ ai: v })}
                            valueText={(i) => amountText(amounts[i] ?? 0)}
                            marks={amounts.map((a, i) => ({ value: i, label: amountTick(a) }))}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <span id={ids.days} className="text-[0.875rem] text-muted-foreground">
                            {l.days}
                        </span>
                        <span data-readout="days" className={READOUT}>
                            {dayText(bar.days)}
                        </span>
                        <Slider
                            aria-labelledby={ids.days}
                            min={0}
                            max={dayStops.length - 1}
                            step={1}
                            value={di}
                            onValueChange={(v) => change({ di: v })}
                            valueText={(i) => dayText(dayStops[i] ?? 0)}
                            marks={dayStops.map((d, i) => ({ value: i, label: dayTick(d) }))}
                        />
                    </div>
                </div>

                {/* The real person */}
                <div className="flex flex-col gap-5 p-6 md:p-8" data-verdict={passes ? 'pass' : 'fail'}>
                    <MonoLabel as="span">{l.personKicker}</MonoLabel>
                    <PersonGlyph lit={passes} />
                    <p className="text-[0.9375rem] leading-snug text-muted-foreground">{l.personBody(bar, passes)}</p>
                    <Verdict pass={passes} className="mt-auto">
                        {passes ? l.pass : l.fail}
                    </Verdict>
                </div>

                {/* The crowd */}
                <div className="flex min-w-0 flex-col gap-5 p-6 md:p-8">
                    <MonoLabel as="span">{l.farmKicker(accounts)}</MonoLabel>
                    <Crowd sweepRef={sweepRef} />
                    <div className="flex flex-col gap-1">
                        <span className="flex items-baseline gap-2 text-oca-accent-display">
                            <span data-cost="" className="oca-tabular text-[2.25rem] font-light leading-none tracking-[-0.03em] md:text-[2.75rem]">
                                {cost.value}
                            </span>
                            <span className="text-[1.5rem] font-light">{cost.unit}</span>
                        </span>
                        <span className="text-[0.9375rem] leading-snug text-muted-foreground">{l.farmBody(bar)}</span>
                    </div>
                    <Verdict pass={false} className="mt-auto">
                        {l.farmVerdict}
                    </Verdict>
                </div>
            </div>
            {l.foot ? <div className="border-t border-border px-6 py-4 font-mono text-[0.75rem] text-muted-foreground md:px-8">{l.foot}</div> : null}
        </div>
    );
}

function Verdict({ pass, className, children }: { pass: boolean; className?: string; children: ReactNode }) {
    return (
        <span
            className={cn(
                'oca-label inline-flex w-fit items-center gap-2 px-2.5 py-1.5 font-medium leading-normal',
                pass ? 'bg-brand text-brand-foreground' : 'border border-muted-foreground text-foreground',
                className
            )}
        >
            {children}
            <span aria-hidden>{pass ? '✓' : '✕'}</span>
        </span>
    );
}

// A person in 1-unit squares on a 13 × 13 grid: head, neck, shoulders. One path.
const PERSON = [
    '.....###.....',
    '....#####....',
    '...#######...',
    '...#######...',
    '...#######...',
    '....#####....',
    '.....###.....',
    '.....###.....',
    '...#######...',
    '.###########.',
    '#############',
    '#############',
    '#############',
];
const PERSON_PATH = PERSON.flatMap((row, y) => [...row].map((c, x) => (c === '#' ? `M${x * 1.4} ${y * 1.4}h1v1h-1z` : ''))).join('');

function PersonGlyph({ lit }: { lit: boolean }) {
    return (
        <svg aria-hidden viewBox="0 0 18 18.2" className="h-20 w-auto self-start">
            <path
                d={PERSON_PATH}
                className={cn('transition-[fill] duration-300', lit ? 'fill-oca-accent-display' : 'fill-border')}
            />
        </svg>
    );
}

/** The crowd: 50 × 20 squares drawn by one mask, and the one band of light that crosses them. */
function Crowd({ sweepRef }: { sweepRef: RefObject<HTMLDivElement | null> }) {
    const cells: CSSProperties = {
        WebkitMaskImage: 'linear-gradient(90deg, #000 70%, transparent 0), linear-gradient(#000 70%, transparent 0)',
        maskImage: 'linear-gradient(90deg, #000 70%, transparent 0), linear-gradient(#000 70%, transparent 0)',
        WebkitMaskSize: '2% 5%',
        maskSize: '2% 5%',
        WebkitMaskComposite: 'source-in',
        maskComposite: 'intersect',
    };
    return (
        <div aria-hidden data-crowd="" className="relative aspect-[5/2] w-full overflow-hidden" style={cells}>
            <div className="absolute inset-0 bg-foreground/20" />
            <div
                ref={sweepRef}
                className="absolute inset-y-0 -left-1/2 w-[200%] -translate-x-full bg-[linear-gradient(110deg,transparent_30%,var(--color-oca-orange)_50%,transparent_70%)]"
            />
        </div>
    );
}
