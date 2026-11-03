import { useEffect, useId, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode, type RefObject } from 'react';

import { announce } from '../lib/announce';
import { cn } from '../lib/cn';
import { Slider } from '../primitives/slider';
import { Kicker, usePrefersStill } from './parts';

/*
 * What a bar costs to fake, worked live: two sliders set the bar (an amount
 * held, for so many days), one number says what a crowd of new accounts
 * would have to hold to clear it, and a real person's card says whether
 * their one coin clears it. The crowd is one element: a CSS grid of squares
 * a single sweep of light crosses once per change, never a node per account.
 * Under reduced motion the sweep is off. The words are props; the defaults
 * are placeholders a site replaces with its gated copy.
 */

export interface CostDemoLabels {
    kicker: string;
    amount: string;
    amountUnit: string;
    days: string;
    daysUnit: (days: number) => string;
    personKicker: string;
    personBody: ReactNode;
    pass: string;
    fail: string;
    farmKicker: (accounts: number) => string;
    farmCaption: (days: number) => string;
    farmVerdict: string;
    foot?: ReactNode;
    /** Said to a screen reader once a change settles. */
    costSaid: (cost: string, days: number, accounts: number) => string;
}

const PLACEHOLDER: CostDemoLabels = {
    kicker: 'Set the bar',
    amount: 'Held at least',
    amountUnit: 'sats',
    days: 'For at least',
    daysUnit: (d) => (d === 1 ? 'day' : 'days'),
    personKicker: 'A real person',
    personBody: 'One coin they already hold.',
    pass: 'Gets in',
    fail: 'Below the bar',
    farmKicker: (n) => `${n.toLocaleString('en-US')} new accounts`,
    farmCaption: (d) => `held for ${d} ${d === 1 ? 'day' : 'days'}`,
    farmVerdict: 'Too costly',
    costSaid: (cost, d, n) => `${n.toLocaleString('en-US')} accounts would need ${cost} held for ${d} ${d === 1 ? 'day' : 'days'}`,
};

export interface CostDemoProps {
    /** The amounts the first slider steps through, in sats. */
    amounts?: number[];
    /** Which of `amounts` it starts on. */
    defaultAmountIndex?: number;
    days?: { min: number; max: number; default: number };
    /** How many made-up accounts the crowd stands for. */
    accounts?: number;
    /** The real person's coin: what they hold, and for how long. */
    person?: { sats: number; days: number };
    labels?: Partial<CostDemoLabels>;
    /** `ink` on a dark band, `paper` on the page. */
    tone?: 'ink' | 'paper';
    onChange?: (bar: { sats: number; days: number }) => void;
    className?: string;
}

const AMOUNTS = [10_000, 25_000, 50_000, 100_000, 250_000, 500_000, 1_000_000];

/** 10k, 250k, 1M: a tick's words. */
function compact(n: number): string {
    if (n >= 1_000_000) return `${+(n / 1_000_000).toFixed(1)}M`;
    if (n >= 1_000) return `${+(n / 1_000).toFixed(1)}k`;
    return String(n);
}

/** A total in BTC once it reaches a hundredth of one, in sats below that. */
export function costText(sats: number): { value: string; unit: string } {
    if (sats < 1_000_000) return { value: sats.toLocaleString('en-US'), unit: 'sats' };
    const btc = sats / 1e8;
    return { value: btc.toLocaleString('en-US', { maximumFractionDigits: btc >= 1 ? 1 : 2 }), unit: 'BTC' };
}

export function CostDemo({
    amounts = AMOUNTS,
    defaultAmountIndex = 3,
    days: range = { min: 1, max: 90, default: 30 },
    accounts = 1000,
    person = { sats: 500_000, days: 90 },
    labels,
    tone = 'ink',
    onChange,
    className,
}: CostDemoProps) {
    const l = { ...PLACEHOLDER, ...labels };
    const ink = tone === 'ink';
    const still = usePrefersStill();
    const [ai, setAi] = useState(Math.min(Math.max(defaultAmountIndex, 0), amounts.length - 1));
    const [days, setDays] = useState(range.default);
    const [changes, setChanges] = useState(0);
    const amount = amounts[ai] ?? amounts[0] ?? 0;
    const cost = costText(amount * accounts);
    const passes = person.sats >= amount && person.days >= days;
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

    // The total, said once a change settles: never a word per step of a drag.
    useEffect(() => {
        if (!changes) return;
        const t = setTimeout(() => announce(l.costSaid(`${cost.value} ${cost.unit}`, days, accounts)), 700);
        return () => clearTimeout(t);
        // Words follow the values; the label functions are the caller's.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [changes]);

    const change = (next: { ai?: number; days?: number }) => {
        const a = next.ai ?? ai;
        const d = next.days ?? days;
        if (a === ai && d === days) return;
        setAi(a);
        setDays(d);
        setChanges((c) => c + 1);
        onChange?.({ sats: amounts[a] ?? amount, days: d });
    };

    const muted = ink ? 'text-oca-ink-muted' : 'text-muted-foreground';
    const rule = ink ? 'border-oca-ink-line' : 'border-border';
    const marks = amounts.length > 2 ? [0, Math.floor((amounts.length - 1) / 2), amounts.length - 1] : [0, amounts.length - 1];
    // The middle tick on a round number: 45 for 1 to 90.
    const mid = Math.round((range.min + range.max) / 10) * 5;

    return (
        <div
            data-cost-demo=""
            className={cn('grid border', ink ? 'bg-oca-ink text-oca-ink-foreground' : 'bg-card text-foreground', rule, className)}
        >
            <div className={cn('grid lg:grid-cols-[1.15fr_0.8fr_1.05fr] lg:divide-x max-lg:divide-y', ink ? 'divide-oca-ink-line' : 'divide-border')}>
                {/* The bar */}
                <div className="flex flex-col gap-7 p-6 md:p-8">
                    <Kicker onInk={ink}>{l.kicker}</Kicker>
                    <div className="flex flex-col gap-2">
                        <span id={ids.amount} className={cn('text-[0.875rem]', muted)}>
                            {l.amount}
                        </span>
                        <span className="flex items-baseline gap-2">
                            <span className="oca-tabular text-[2.25rem] font-light leading-none tracking-[-0.03em] md:text-[2.75rem]">
                                {amount.toLocaleString('en-US')}
                            </span>
                            <span className={cn('text-[1rem]', muted)}>{l.amountUnit}</span>
                        </span>
                        <Slider
                            tone={ink ? 'ink' : 'default'}
                            aria-labelledby={ids.amount}
                            min={0}
                            max={amounts.length - 1}
                            step={1}
                            value={ai}
                            onValueChange={(v) => change({ ai: v })}
                            valueText={(i) => `${(amounts[i] ?? 0).toLocaleString('en-US')} ${l.amountUnit}`}
                            marks={marks.map((i) => ({ value: i, label: compact(amounts[i] ?? 0) }))}
                        />
                    </div>
                    <div className="flex flex-col gap-2">
                        <span id={ids.days} className={cn('text-[0.875rem]', muted)}>
                            {l.days}
                        </span>
                        <span className="flex items-baseline gap-2">
                            <span className="oca-tabular text-[2.25rem] font-light leading-none tracking-[-0.03em] md:text-[2.75rem]">{days}</span>
                            <span className={cn('text-[1rem]', muted)}>{l.daysUnit(days)}</span>
                        </span>
                        <Slider
                            tone={ink ? 'ink' : 'default'}
                            aria-labelledby={ids.days}
                            min={range.min}
                            max={range.max}
                            step={1}
                            value={days}
                            onValueChange={(v) => change({ days: v })}
                            valueText={(d) => `${d} ${l.daysUnit(d)}`}
                            marks={[
                                { value: range.min, label: `${range.min} ${l.daysUnit(range.min)}` },
                                { value: mid, label: String(mid) },
                                { value: range.max, label: String(range.max) },
                            ]}
                        />
                    </div>
                </div>

                {/* The real person */}
                <div className="flex flex-col gap-5 p-6 md:p-8" data-verdict={passes ? 'pass' : 'fail'}>
                    <Kicker onInk={ink}>{l.personKicker}</Kicker>
                    <PersonGlyph lit={passes} ink={ink} />
                    <p className={cn('text-[0.9375rem] leading-snug', muted)}>{l.personBody}</p>
                    <Verdict pass={passes} ink={ink} className="mt-auto">
                        {passes ? l.pass : l.fail}
                    </Verdict>
                </div>

                {/* The crowd */}
                <div className="flex min-w-0 flex-col gap-5 p-6 md:p-8">
                    <Kicker onInk={ink}>{l.farmKicker(accounts)}</Kicker>
                    <Crowd ink={ink} sweepRef={sweepRef} />
                    <div className="flex flex-col gap-1">
                        <span className="flex items-baseline gap-2 text-oca-accent-display">
                            <span data-cost="" className="oca-tabular text-[2.25rem] font-light leading-none tracking-[-0.03em] md:text-[2.75rem]">
                                {cost.value}
                            </span>
                            <span className="text-[1.5rem] font-light">{cost.unit}</span>
                        </span>
                        <span className={cn('text-[0.9375rem]', muted)}>{l.farmCaption(days)}</span>
                    </div>
                    <Verdict pass={false} ink={ink} className="mt-auto">
                        {l.farmVerdict}
                    </Verdict>
                </div>
            </div>
            {l.foot ? <div className={cn('border-t px-6 py-4 font-mono text-[0.75rem] md:px-8', rule, muted)}>{l.foot}</div> : null}
        </div>
    );
}

function Verdict({ pass, ink, className, children }: { pass: boolean; ink: boolean; className?: string; children: ReactNode }) {
    return (
        <span
            className={cn(
                'inline-flex w-fit items-center gap-2 px-2.5 py-1.5 font-mono text-[0.75rem] font-medium uppercase tracking-[0.08em]',
                pass ? 'bg-brand text-brand-foreground' : cn('border', ink ? 'border-oca-ink-line text-oca-ink-foreground' : 'border-oca-hairline-strong text-foreground'),
                className
            )}
        >
            {children}
            <span aria-hidden>{pass ? '✓' : '✕'}</span>
        </span>
    );
}

// A person in 1-unit squares on a 13 × 13 grid: head, shoulders. One path.
const PERSON = [
    '.....###.....',
    '....#####....',
    '...#######...',
    '...#######...',
    '...#######...',
    '....#####....',
    '.....###.....',
    '.............',
    '...#######...',
    '.###########.',
    '#############',
    '#############',
    '#############',
];
const PERSON_PATH = PERSON.flatMap((row, y) => [...row].map((c, x) => (c === '#' ? `M${x * 1.4} ${y * 1.4}h1v1h-1z` : ''))).join('');

function PersonGlyph({ lit, ink }: { lit: boolean; ink: boolean }) {
    return (
        <svg aria-hidden viewBox="0 0 18 18.2" className="h-20 w-auto self-start">
            <path
                d={PERSON_PATH}
                className={cn('transition-[fill] duration-300', lit ? 'fill-oca-accent-display' : ink ? 'fill-oca-ink-line' : 'fill-oca-hairline-strong')}
            />
        </svg>
    );
}

/** The crowd: 50 × 20 squares drawn by one mask, and the one band of light that crosses them. */
function Crowd({ ink, sweepRef }: { ink: boolean; sweepRef: RefObject<HTMLDivElement | null> }) {
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
            <div className={cn('absolute inset-0', ink ? 'bg-oca-ink-foreground/25' : 'bg-foreground/20')} />
            <div
                ref={sweepRef}
                className="absolute inset-y-0 -left-1/2 w-[200%] -translate-x-full bg-[linear-gradient(110deg,transparent_30%,var(--color-oca-orange)_50%,transparent_70%)]"
            />
        </div>
    );
}
