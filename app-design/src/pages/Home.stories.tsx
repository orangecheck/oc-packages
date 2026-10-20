import type { Meta, StoryObj } from '@storybook/react';
import { BadgeCheck, Bitcoin, Check, Code2, Eye, Lock, Mail, ShieldCheck, Sparkles } from 'lucide-react';
import type { CSSProperties, ReactNode } from 'react';

import portrait from '../assets/portrait-halftone-600.webp';
import { Crowd, HalftoneSphere, IsoCheck } from '../brand';
import {
    Accent,
    BrowserFrame,
    Display,
    Eyebrow,
    FloatChip,
    Lead,
    PhoneFrame,
    Reveal,
    ScrollStory,
    Section,
    SplitBar,
    Ticker,
    TruthTable,
} from '../components';
import { Badge, Button, StatusPill, cn } from '../primitives';

/*
 * ochk.app's home, composed from the system: the live halftone hero, the crowd
 * that thins as you scroll, the product as objects, the fee split, the honest
 * table. The app's page is this composition with live data.
 */
const meta: Meta = { title: 'Pages/Home', parameters: { fullBleed: true, layout: 'fullscreen' } };
export default meta;

/* ── Hero ─────────────────────────────────────────────────────────────── */

function HomeHero({ status, primary, secondary }: { status: ReactNode; primary: ReactNode; secondary: ReactNode }) {
    return (
        <section className="relative overflow-x-clip">
            {/* A halftone field fading out behind the hero: the deck's screen as texture. */}
            <div
                aria-hidden
                className="pointer-events-none absolute inset-0 opacity-[0.55] dark:opacity-30"
                style={{
                    backgroundImage: 'radial-gradient(circle, rgb(10 10 10 / 0.09) 1.1px, transparent 1.4px)',
                    backgroundSize: '14px 14px',
                    maskImage: 'radial-gradient(70% 60% at 72% 40%, black, transparent 75%)',
                }}
            />
            <div className="oca-container relative grid min-h-[min(54rem,calc(100svh-4rem))] grid-cols-1 items-center gap-14 py-14 md:grid-cols-12 md:gap-8 md:py-20">
                <div className="flex flex-col items-start gap-7 md:col-span-7">
                    {status}
                    <h1 className="oca-display-1 max-w-[12ch] text-[clamp(2.75rem,1.4rem+4.1vw,4.9rem)] leading-[0.98] md:max-w-none">
                        Make fake accounts cost something <Accent>real</Accent>.
                    </h1>
                    <Lead className="max-w-[30rem]">
                        One sign-in for every app that uses it. Apps get fewer bots, and you earn a share of what you
                        do there, in sats.
                    </Lead>
                    <div className="flex flex-wrap gap-3">
                        {primary}
                        {secondary}
                    </div>
                    <MethodRow />
                </div>
                <div className="relative md:col-span-5">
                    <HalftoneSphere
                        live
                        stadium
                        src={portrait}
                        alt="A person smiling, printed as a halftone"
                        className="mx-auto max-w-[36rem]"
                    />
                    <FloatChip
                        className="absolute left-[2%] top-[14%] hidden sm:flex"
                        icon={<Bitcoin />}
                        title="Signed with a Bitcoin wallet"
                        detail="No password, no form"
                        delay={0}
                    />
                    <FloatChip
                        className="absolute right-[-2%] top-[52%] hidden sm:flex"
                        icon={<ShieldCheck />}
                        title="Passes the bar"
                        detail="Bitcoin held for 214 days"
                        delay={2.2}
                    />
                    <FloatChip
                        className="absolute bottom-[4%] left-[10%] hidden sm:flex"
                        icon={<BadgeCheck />}
                        title="Receipt signed"
                        detail="Anyone can check it, offline"
                        delay={4.1}
                    />
                </div>
            </div>
        </section>
    );
}

function MethodRow() {
    const methods: [ReactNode, string][] = [
        [<Mail key="m" />, 'Email'],
        [<span key="g" className="text-[0.8125rem] font-semibold">G</span>, 'Google'],
        [<Code2 key="h" />, 'GitHub'],
        [<Bitcoin key="b" />, 'Any Bitcoin wallet'],
    ];
    return (
        <ul className="flex flex-wrap items-center gap-x-5 gap-y-2 text-[0.9375rem] text-muted-foreground">
            {methods.map(([icon, label]) => (
                <li key={label} className="flex items-center gap-2 [&_svg]:size-4">
                    <span className="flex size-4 items-center justify-center">{icon}</span>
                    {label}
                </li>
            ))}
        </ul>
    );
}

/* ── Proof strip ──────────────────────────────────────────────────────── */

function ProofStrip() {
    const items: [ReactNode, string][] = [
        [<Code2 key="c" />, 'Open source, MIT'],
        [<Sparkles key="t" />, 'No token'],
        [<Eye key="k" />, 'No KYC'],
        [<Lock key="o" />, 'Every receipt checks offline'],
    ];
    return (
        <div className="border-y border-border">
            <ul className="oca-container grid grid-cols-2 gap-x-6 gap-y-4 py-6 md:grid-cols-4">
                {items.map(([icon, label]) => (
                    <li key={label} className="flex items-center gap-3 text-[0.9375rem] [&_svg]:size-[1.1rem] [&_svg]:text-oca-accent-ink">
                        {icon}
                        {label}
                    </li>
                ))}
            </ul>
        </div>
    );
}

/* ── The problem, as a scroll ─────────────────────────────────────────── */

// The problem leaves upward before the fix arrives from below; never both at once.
const fadeOut = {
    opacity: 'clamp(0, calc(1 - (var(--p, 0) - 0.38) * 12), 1)',
    transform: 'translateY(calc(clamp(0, (var(--p, 0) - 0.38) * 12, 1) * -28px))',
} as CSSProperties;
const fadeIn = {
    opacity: 'clamp(0, calc((var(--p, 0) - 0.48) * 12), 1)',
    transform: 'translateY(calc((1 - clamp(0, (var(--p, 0) - 0.48) * 12, 1)) * 28px))',
} as CSSProperties;

function ProblemStory() {
    return (
        <section className="relative bg-oca-ink text-oca-ink-foreground">
            <ScrollStory length={2.3} innerClassName="py-20">
                <div className="oca-container grid grid-cols-1 items-center gap-12 md:grid-cols-12 md:gap-10">
                    <div className="grid md:col-span-5">
                        <div className="col-start-1 row-start-1 flex flex-col gap-5" style={fadeOut}>
                            <Eyebrow onInk>The problem</Eyebrow>
                            <Display level={2}>A bot farm can pretend to be a crowd for almost nothing.</Display>
                            <p className="oca-lead text-oca-ink-muted">
                                The usual fixes ask real people for more: a phone number, a puzzle, an ID.
                            </p>
                        </div>
                        <div className="col-start-1 row-start-1 flex flex-col gap-5" style={fadeIn} aria-hidden>
                            <Eyebrow onInk>The fix</Eyebrow>
                            <Display level={2}>
                                Ask each account for something <Accent>real</Accent>.
                            </Display>
                            <p className="oca-lead text-oca-ink-muted">
                                Bitcoin held for a while is cheap for a person and ruinous at a thousand times. What
                                is left is the crowd that was there.
                            </p>
                        </div>
                    </div>
                    <div className="md:col-span-7">
                        <div className="mb-6 grid text-[clamp(2rem,1.4rem+2vw,3rem)] leading-none tracking-[-0.03em]">
                            <span className="col-start-1 row-start-1" style={fadeOut}>
                                242 accounts
                            </span>
                            <span className="col-start-1 row-start-1 text-oca-orange" style={fadeIn} aria-hidden>
                                8 people
                            </span>
                        </div>
                        <Crowd story cols={22} rows={11} real={8} />
                        <div className="mt-6 flex flex-wrap gap-x-6 gap-y-2 text-[0.875rem] text-oca-ink-muted">
                            <span className="flex items-center gap-2">
                                <span className="size-2.5 rounded-full bg-white/40" /> A copy
                            </span>
                            <span className="flex items-center gap-2">
                                <span className="size-2.5 rounded-full bg-oca-orange" /> A person with bitcoin behind them
                            </span>
                        </div>
                    </div>
                </div>
            </ScrollStory>
        </section>
    );
}

/* ── How it works: the product, at size ───────────────────────────────── */

function SignInScreen() {
    return (
        <div className="grid grid-cols-1 sm:grid-cols-[1.1fr_1fr]">
            <div className="flex flex-col gap-4 p-7">
                <div className="flex items-center gap-2 text-[0.8125rem] font-medium">
                    <span className="size-4 rounded-[5px] bg-oca-ink" /> orangecheck
                </div>
                <div className="text-[1.6rem] leading-none tracking-[-0.03em]">Sign in</div>
                <div className="flex flex-col gap-2">
                    {['Continue with Google', 'Continue with GitHub'].map((l) => (
                        <div key={l} className="flex h-9 items-center justify-center rounded-full border border-border text-[0.8125rem]">
                            {l}
                        </div>
                    ))}
                </div>
                <div className="flex items-center gap-3 text-[0.75rem] text-muted-foreground">
                    <span className="h-px flex-1 bg-border" />
                    or
                    <span className="h-px flex-1 bg-border" />
                </div>
                <div className="flex gap-4 border-b border-border text-[0.8125rem]">
                    <span className="border-b-2 border-foreground pb-2">Email</span>
                    <span className="pb-2 text-muted-foreground">Bitcoin wallet</span>
                </div>
                <div className="h-9 rounded-full border border-oca-hairline-strong px-3 text-[0.8125rem] leading-9 text-muted-foreground">
                    you@example.com
                </div>
                <div className="flex h-9 items-center justify-center rounded-full bg-foreground text-[0.8125rem] text-background">
                    Send a code
                </div>
            </div>
            <div className="relative hidden overflow-hidden bg-oca-ink sm:block">
                <HalftoneSphere src={portrait} alt="" className="absolute -right-[18%] top-1/2 w-[105%] -translate-y-1/2" />
            </div>
        </div>
    );
}

function GateCard() {
    const Bar = ({ label, value, fill }: { label: string; value: string; fill: number }) => (
        <div className="flex flex-col gap-2">
            <div className="flex items-baseline justify-between text-[0.875rem]">
                <span className="text-muted-foreground">{label}</span>
                <span className="oca-tabular font-medium">{value}</span>
            </div>
            <div className="relative h-2 rounded-full bg-muted">
                <div className="absolute inset-y-0 left-0 rounded-full bg-oca-orange" style={{ width: `${fill}%` }} />
                <div
                    className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full border border-oca-hairline-strong bg-card shadow"
                    style={{ left: `${fill}%` }}
                />
            </div>
        </div>
    );
    return (
        <div className="flex flex-col gap-5 rounded-2xl border border-border bg-card p-5 shadow-[0_24px_60px_-34px_rgb(10_10_10/0.35)]">
            <div className="flex items-center justify-between">
                <span className="text-[0.9375rem] font-medium">Who can post</span>
                <Badge>Your rule</Badge>
            </div>
            <Bar label="Bitcoin held" value="100,000 sats" fill={46} />
            <Bar label="Unspent for" value="30 days" fill={62} />
            <div className="flex items-center gap-2.5 rounded-xl bg-muted px-3 py-2.5 text-[0.875rem]">
                <Check className="size-4 text-oca-accent-ink" />
                Real accounts pass. A thousand fresh ones don&apos;t.
            </div>
        </div>
    );
}

function QrGlyph({ seed = 7 }: { seed?: number }) {
    // An illustration of a receipt's code, not a scannable one.
    const n = 21;
    let s = seed;
    const cells: [number, number][] = [];
    const finder = (x: number, y: number) => x < 7 && y < 7;
    for (let y = 0; y < n; y++)
        for (let x = 0; x < n; x++) {
            if (finder(x, y) || finder(n - 1 - x, y) || finder(x, n - 1 - y)) continue;
            s = (Math.imul(s, 1103515245) + 12345) >>> 0;
            if ((s >>> 16) % 3 === 0) cells.push([x, y]);
        }
    const Finder = ({ x, y }: { x: number; y: number }) => (
        <g transform={`translate(${x} ${y})`}>
            <rect width="7" height="7" rx="1.6" fill="currentColor" />
            <rect x="1" y="1" width="5" height="5" rx="1.1" fill="var(--card)" />
            <rect x="2" y="2" width="3" height="3" rx="0.8" fill="currentColor" />
        </g>
    );
    return (
        <svg viewBox={`0 0 ${n} ${n}`} className="size-24 text-foreground" aria-hidden>
            {cells.map(([x, y]) => (
                <rect key={`${x}-${y}`} x={x + 0.1} y={y + 0.1} width="0.8" height="0.8" rx="0.25" fill="currentColor" />
            ))}
            <Finder x={0} y={0} />
            <Finder x={n - 7} y={0} />
            <Finder x={0} y={n - 7} />
        </svg>
    );
}

function ReceiptCard() {
    const rows: [string, string, boolean][] = [
        ['Event', 'Comment posted', false],
        ['Signed', 'by orangecheck', true],
        ['Timestamped', 'on Bitcoin', true],
    ];
    return (
        <div className="relative rounded-2xl border border-border bg-card p-5 shadow-[0_24px_60px_-34px_rgb(10_10_10/0.35)]">
            <div className="flex items-start justify-between gap-4">
                <div className="flex flex-col gap-1">
                    <span className="text-[0.9375rem] font-medium">Receipt</span>
                    <span className="font-mono text-[0.75rem] text-muted-foreground">3f9a…c21e</span>
                </div>
                <QrGlyph />
            </div>
            <dl className="mt-3 flex flex-col divide-y divide-border text-[0.875rem]">
                {rows.map(([k, v, ok]) => (
                    <div key={k} className="flex items-center justify-between py-2.5">
                        <dt className="text-muted-foreground">{k}</dt>
                        <dd className="flex items-center gap-1.5">
                            {v}
                            {ok ? <Check className="size-4 text-oca-accent-ink" /> : null}
                        </dd>
                    </div>
                ))}
            </dl>
        </div>
    );
}

function HowItWorks() {
    return (
        <Section id="how">
            <Reveal className="flex max-w-3xl flex-col gap-4">
                <Eyebrow>How it works</Eyebrow>
                <Display level={2}>Ask for something a bot can&apos;t fake cheaply.</Display>
            </Reveal>
            <div className="mt-14 grid grid-cols-1 gap-5 lg:grid-cols-3">
                <Reveal className="flex flex-col gap-6 rounded-[1.75rem] bg-muted p-6 md:p-8 lg:col-span-2">
                    <BrowserFrame url="ochk.app/signin">
                        <SignInScreen />
                    </BrowserFrame>
                    <TileText n="01" title="Sign in once">
                        Email, Google, GitHub or a Bitcoin wallet. The same account works in every app that uses
                        orangecheck.
                    </TileText>
                </Reveal>
                <Reveal delay={120} className="flex flex-col justify-between gap-6 rounded-[1.75rem] bg-muted p-6 md:p-8">
                    <GateCard />
                    <TileText n="02" title="Apps set the bar">
                        An app can ask that an account be backed by bitcoin held for a while. Bots can fake a face.
                        They cannot fake that cheaply.
                    </TileText>
                </Reveal>
                <Reveal delay={60} className="flex flex-col justify-between gap-6 rounded-[1.75rem] bg-muted p-6 md:p-8 lg:col-span-3 lg:flex-row lg:items-center lg:gap-12">
                    <TileText n="03" title="Every event has a receipt" className="lg:max-w-md">
                        What an app pays for is signed and anchored to Bitcoin. Anyone can check it, offline, without
                        asking us.
                    </TileText>
                    <div className="w-full max-w-md lg:ml-auto">
                        <ReceiptCard />
                    </div>
                </Reveal>
            </div>
        </Section>
    );
}

function TileText({ n, title, className, children }: { n: string; title: string; className?: string; children: ReactNode }) {
    return (
        <div className={cn('flex flex-col gap-2', className)}>
            <span className="oca-numeral">{n}</span>
            <h3 className="oca-display-3">{title}</h3>
            <p className="oca-body max-w-xl">{children}</p>
        </div>
    );
}

/* ── For you: the path, and the app in hand ───────────────────────────── */

function PhoneHome() {
    return (
        <div className="flex h-full flex-col gap-4 px-4 pb-5 pt-12 text-[0.8125rem]">
            <div className="flex items-center justify-between">
                <span className="text-[1.15rem] tracking-[-0.02em]">Home</span>
                <span className="flex size-7 items-center justify-center rounded-full bg-oca-ink text-[0.75rem] text-white">Y</span>
            </div>
            <div className="rounded-2xl bg-oca-ink p-4 text-white">
                <div className="text-white/70">Your account</div>
                <div className="mt-1 font-mono text-[0.75rem]">ed30f1d9…f97fc8</div>
                <div className="mt-4 flex items-center gap-2">
                    <span className="size-1.5 rounded-full bg-oca-orange" />
                    Ready to be paid
                </div>
            </div>
            <div className="flex flex-col divide-y divide-border rounded-2xl border border-border bg-card">
                {[
                    ['Session opened', 'example.app'],
                    ['Payment authorised', 'example.app'],
                    ['Comment posted', 'forum.example'],
                ].map(([what, where]) => (
                    <div key={what} className="flex items-center justify-between px-3 py-2.5">
                        <div className="flex flex-col">
                            <span>{what}</span>
                            <span className="text-[0.75rem] text-muted-foreground">{where}</span>
                        </div>
                        <span className="rounded-full border border-border px-2 py-0.5 text-[0.6875rem] text-muted-foreground">
                            In testing
                        </span>
                    </div>
                ))}
            </div>
        </div>
    );
}

function ForYou({ steps }: { steps: { title: string; body: string; state: 'live' | 'testing' | 'ahead' }[] }) {
    const label = { live: 'Live', testing: 'In testing', ahead: 'On the path' } as const;
    return (
        <Section tone="card" className="border-y border-border">
            <div className="grid grid-cols-1 items-center gap-14 lg:grid-cols-12">
                <div className="flex flex-col gap-10 lg:col-span-7">
                    <Reveal className="flex flex-col gap-4">
                        <Eyebrow>For you</Eyebrow>
                        <Display level={2}>Sign in. Earn. Own.</Display>
                    </Reveal>
                    <ol className="relative flex flex-col">
                        <span aria-hidden className="absolute bottom-6 left-[0.6875rem] top-6 w-px bg-border" />
                        {steps.map((s, i) => (
                            <Reveal as="li" key={s.title} delay={i * 110} className="relative grid grid-cols-[1.5rem_1fr] gap-x-5 py-5">
                                <span
                                    className={cn(
                                        'relative z-10 mt-1.5 flex size-[1.375rem] items-center justify-center rounded-full border-2 bg-card',
                                        s.state === 'ahead' ? 'border-oca-hairline-strong' : 'border-oca-orange'
                                    )}
                                >
                                    {s.state === 'live' ? <span className="size-2.5 rounded-full bg-oca-orange" /> : null}
                                    {s.state === 'testing' ? <span className="h-2.5 w-[0.3125rem] -translate-x-[0.15rem] rounded-l-full bg-oca-orange" /> : null}
                                </span>
                                <div className="flex flex-col gap-1.5">
                                    <div className="flex flex-wrap items-center gap-3">
                                        <h3 className="oca-display-3">{s.title}</h3>
                                        <Badge tone={s.state === 'live' ? 'brand' : 'neutral'}>{label[s.state]}</Badge>
                                    </div>
                                    <p className="oca-body max-w-lg">{s.body}</p>
                                </div>
                            </Reveal>
                        ))}
                    </ol>
                </div>
                <Reveal delay={150} className="relative flex justify-center lg:col-span-5">
                    <div
                        aria-hidden
                        className="absolute left-1/2 top-1/2 aspect-square w-[85%] -translate-x-1/2 -translate-y-1/2 rounded-full"
                        style={{ background: 'radial-gradient(closest-side, rgb(255 140 70 / 0.28), transparent)' }}
                    />
                    <PhoneFrame className="relative rotate-[-3deg]">
                        <PhoneHome />
                    </PhoneFrame>
                </Reveal>
            </div>
        </Section>
    );
}

/* ── What it costs ─────────────────────────────────────────────────────── */

function Costs({ feePct, maxUserSharePct, action }: { feePct: number; maxUserSharePct: number; action: ReactNode }) {
    return (
        <Section tone="brand">
            <div className="grid grid-cols-1 items-end gap-12 md:grid-cols-12 md:gap-10">
                <Reveal className="flex flex-col gap-5 md:col-span-6">
                    <p className="text-[0.9375rem]">What it costs</p>
                    <Display level={2}>Free for people. Apps keep their own prices.</Display>
                    <p className="max-w-[32rem] text-[1.0625rem] leading-relaxed">
                        An app sets what each event is worth and pays it in sats. The app decides how much goes to you.
                    </p>
                    <div className="mt-2">{action}</div>
                </Reveal>
                <Reveal delay={120} className="flex flex-col gap-8 md:col-span-6">
                    <div className="flex items-end gap-4">
                        <span className="text-[clamp(5rem,3rem+7vw,9.5rem)] leading-[0.8] tracking-[-0.06em]">
                            <Ticker value={maxUserSharePct} />%
                        </span>
                        <span className="mb-3 max-w-[11rem] text-[1rem] leading-snug">the most an app can pass to you</span>
                    </div>
                    <SplitBar
                        segments={[
                            { pct: maxUserSharePct, label: 'Up to this much goes to you, as the app sets it', tone: 'card' },
                            { pct: feePct, label: 'orangecheck keeps this', tone: 'ink' },
                        ]}
                    />
                </Reveal>
            </div>
        </Section>
    );
}

/* ── Closing ───────────────────────────────────────────────────────────── */

function Closing({ primary, secondary }: { primary: ReactNode; secondary: ReactNode }) {
    return (
        <Section className="overflow-hidden">
            <div className="grid grid-cols-1 items-center gap-12 md:grid-cols-12">
                <Reveal className="flex flex-col items-start gap-8 md:col-span-7">
                    <h2 className="oca-display-1 text-[clamp(2.5rem,1.5rem+4vw,5rem)] leading-[1]">
                        Start with one <Accent>sign-in</Accent>.
                    </h2>
                    <div className="flex flex-wrap gap-3">
                        {primary}
                        {secondary}
                    </div>
                </Reveal>
                <div className="flex justify-center md:col-span-5">
                    <IsoCheck size={340} settle tilt className="max-w-full" />
                </div>
            </div>
        </Section>
    );
}

/* ── The page ──────────────────────────────────────────────────────────── */

export const Home: StoryObj = {
    render: () => {
        const primary = <Button size="lg">Get started</Button>;
        const apps = (
            <Button size="lg" variant="secondary">
                For apps
            </Button>
        );
        return (
            <div className="bg-background text-foreground">
                <HomeHero status={<StatusPill>In testing · sats accrue, payouts come later</StatusPill>} primary={primary} secondary={apps} />
                <ProofStrip />
                <ProblemStory />
                <HowItWorks />
                <ForYou
                    steps={[
                        { title: 'Sign in', state: 'live', body: 'The way you always do. Email or a wallet. Nothing new to learn.' },
                        { title: 'Earn', state: 'testing', body: 'Apps price the moments they value and pass you up to 80% of each, in sats. Not points.' },
                        { title: 'Own', state: 'ahead', body: 'Over time, it moves into a wallet you hold yourself.' },
                    ]}
                />
                <Costs feePct={20} maxUserSharePct={80} action={<Button>See pricing</Button>} />
                <Section>
                    <div className="grid grid-cols-1 gap-10 md:grid-cols-12">
                        <Reveal className="flex flex-col gap-4 md:col-span-4">
                            <Eyebrow>The honest version</Eyebrow>
                            <Display level={2}>What&apos;s true today.</Display>
                        </Reveal>
                        <Reveal delay={100} className="md:col-span-8">
                            <TruthTable
                                rows={[
                                    { status: 'yes', what: 'Open source. Every receipt checks against Bitcoin, offline.' },
                                    { status: 'yes', what: 'No token. No ads. No KYC.' },
                                    { status: 'testing', what: 'Earning in sats. Payouts are in testing, so no sats move yet.' },
                                    { status: 'not-yet', what: 'Moving sats to a wallet you hold.' },
                                ]}
                            />
                        </Reveal>
                    </div>
                </Section>
                <Closing primary={primary} secondary={<Button size="lg" variant="secondary">hello@ochk.io</Button>} />
            </div>
        );
    },
};
