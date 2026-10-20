import { ArrowRight, Check, Download, FileText, Lock, Upload } from 'lucide-react';
import Link from 'next/link';
import { useId, useMemo, useRef, useState, type ReactNode } from 'react';

import {
    blocksToDuration,
    explorerUrl,
    formatBlockHeight,
    formatBytes,
    formatUtc,
    type Network,
} from '../format';
import { cn } from '../lib/cn';
import { useDensity } from '../lib/density';
import { Badge } from '../primitives/badge';
import { Button } from '../primitives/button';
import { Textarea } from '../primitives/form';
import { CodeBlock } from './code-block';

/*
 * The parts of a protocol's tools: the artifact itself (ArtifactView), a
 * file to hash (DropZone), a numbered group of fields (FormSection), the
 * lifecycle word (StateBadge), Bitcoin time (AnchorStatus, BlockHeight,
 * BlockCountdown), a share of a total (Meter), filters (FilterChips) and the
 * dashboard's cards (ToolGrid).
 */

/* ── ArtifactView ────────────────────────────────────────────────────── */

function pretty(content: string): string | null {
    try {
        return JSON.stringify(JSON.parse(content), null, 2);
    } catch {
        return null;
    }
}

function download(content: string, filename: string, mime: string) {
    const url = URL.createObjectURL(new Blob([content], { type: mime }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
}

const BAR_BUTTON =
    'inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-[0.75rem] text-oca-ink-subtle transition-colors hover:bg-white/10 hover:text-white max-md:h-11 max-md:min-w-11 max-md:justify-center max-md:px-3';

/**
 * An artifact as it is: an envelope, a ballot, a delegation. JSON shows
 * formatted, with a switch to the raw bytes exactly as they were signed;
 * copy takes what is shown, download always saves the raw bytes.
 */
export function ArtifactView({
    content,
    title,
    filename,
    mime,
    defaultView = 'formatted',
    maxLines = 28,
    className,
}: {
    /** The artifact's bytes, as text. */
    content: string;
    /** What it is: "Stamp envelope". Defaults to the language. */
    title?: ReactNode;
    /** Offer a download under this name. */
    filename?: string;
    /** Default: application/json when it parses, text/plain otherwise. */
    mime?: string;
    defaultView?: 'formatted' | 'raw';
    maxLines?: number;
    className?: string;
}) {
    const formatted = useMemo(() => pretty(content), [content]);
    const [view, setView] = useState<'formatted' | 'raw'>(formatted ? defaultView : 'raw');
    const shown = view === 'formatted' && formatted ? formatted : content;
    const json = formatted !== null;
    return (
        <CodeBlock
            code={shown}
            lang={json ? 'json' : undefined}
            caption={title}
            maxLines={maxLines}
            className={className}
            actions={
                <>
                    {json ? (
                        <span role="group" aria-label="View" className="mr-1 flex items-center rounded-full bg-white/[0.06] p-0.5">
                            {(['formatted', 'raw'] as const).map((v) => (
                                <button
                                    key={v}
                                    type="button"
                                    aria-pressed={view === v}
                                    onClick={() => setView(v)}
                                    className={cn(
                                        // The pill stays 28px; its target reaches the bar's 44.
                                        'relative h-7 rounded-full px-2.5 text-[0.75rem] transition-colors before:absolute before:inset-x-0 before:top-1/2 before:h-11 before:-translate-y-1/2',
                                        view === v ? 'bg-white/[0.12] text-white' : 'text-oca-ink-subtle hover:text-white'
                                    )}
                                >
                                    {v === 'formatted' ? 'Formatted' : 'Raw'}
                                </button>
                            ))}
                        </span>
                    ) : null}
                    {filename ? (
                        <button
                            type="button"
                            onClick={() => download(content, filename, mime ?? (json ? 'application/json' : 'text/plain'))}
                            className={BAR_BUTTON}
                            aria-label={`Download ${filename}`}
                        >
                            <Download aria-hidden className="size-3.5" />
                            <span className="max-sm:hidden">Download</span>
                        </button>
                    ) : null}
                </>
            }
        />
    );
}

/* ── DropZone ────────────────────────────────────────────────────────── */

export interface ChosenFile {
    name: string;
    size: number;
    type?: string;
}

/**
 * Drop a file, choose one, or paste text. The file never leaves the
 * browser, and the zone says so. While it is read and hashed, `progress`
 * (0 to 1) fills a bar; once `file` is set the zone shows it, with a way to
 * choose another.
 */
export function DropZone({
    onFile,
    onText,
    accept,
    title = 'Drop a file here, or choose one',
    hint,
    privacy = 'It stays in your browser. Only its hash leaves this page.',
    file,
    progress,
    progressLabel = 'Hashing',
    onClear,
    error,
    disabled = false,
    className,
}: {
    onFile: (file: File) => void;
    /** Offer "Paste text instead"; called with the text. */
    onText?: (text: string) => void;
    /** The file input's accept list: ".pdf,image/*". */
    accept?: string;
    title?: ReactNode;
    /** A line under the title: what kinds, how large. */
    hint?: ReactNode;
    /** The line about where the file goes. `null` leaves it out. */
    privacy?: ReactNode;
    file?: ChosenFile | null;
    /** 0 to 1 while reading; null or undefined when not. */
    progress?: number | null;
    progressLabel?: ReactNode;
    onClear?: () => void;
    error?: ReactNode;
    disabled?: boolean;
    className?: string;
}) {
    const input = useRef<HTMLInputElement>(null);
    const [over, setOver] = useState(false);
    const depth = useRef(0);
    const [mode, setMode] = useState<'file' | 'text'>('file');
    const [text, setText] = useState('');
    const errorId = useId();
    const titleId = useId();
    const busy = progress !== null && progress !== undefined;
    const pct = busy ? Math.round(Math.max(0, Math.min(1, progress!)) * 100) : 0;

    const take = (f: File | undefined | null) => {
        if (f && !disabled) onFile(f);
    };

    const privacyLine =
        privacy === null ? null : (
            <p className="flex items-start gap-2 text-[0.8125rem] leading-snug text-muted-foreground">
                <Lock aria-hidden className="mt-0.5 size-3.5 shrink-0" />
                <span>{privacy}</span>
            </p>
        );

    if (mode === 'text' && onText) {
        return (
            <div className={cn('flex flex-col gap-3', className)}>
                <Textarea
                    value={text}
                    onChange={(e) => setText(e.target.value)}
                    rows={6}
                    aria-label="Text"
                    aria-describedby={error ? errorId : undefined}
                    aria-invalid={error ? true : undefined}
                    placeholder="Paste the text here"
                    className="font-mono text-base md:text-[0.875rem]"
                />
                <div className="flex flex-wrap items-center gap-2">
                    <Button size="sm" disabled={!text.trim() || disabled} onClick={() => onText(text)}>
                        Use this text
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => setMode('file')}>
                        Choose a file instead
                    </Button>
                </div>
                {error ? (
                    <p id={errorId} role="alert" className="text-[0.8125rem] text-destructive">
                        {error}
                    </p>
                ) : null}
                {privacyLine}
            </div>
        );
    }

    return (
        <div className={cn('flex flex-col gap-3', className)}>
            <div
                role="group"
                aria-labelledby={titleId}
                aria-describedby={error ? errorId : undefined}
                aria-busy={busy || undefined}
                onDragEnter={(e) => {
                    e.preventDefault();
                    depth.current++;
                    if (!disabled) setOver(true);
                }}
                onDragOver={(e) => e.preventDefault()}
                onDragLeave={() => {
                    depth.current = Math.max(0, depth.current - 1);
                    if (depth.current === 0) setOver(false);
                }}
                onDrop={(e) => {
                    e.preventDefault();
                    depth.current = 0;
                    setOver(false);
                    take(e.dataTransfer.files?.[0]);
                }}
                className={cn(
                    'relative flex flex-col gap-3 rounded-[1.25rem] border border-dashed transition-colors',
                    file ? 'px-4 py-4 sm:px-5' : 'items-center px-5 py-8 text-center md:py-10',
                    over ? 'border-foreground bg-accent' : 'border-oca-hairline-strong bg-card',
                    error && 'border-destructive',
                    disabled && 'opacity-55'
                )}
            >
                <input
                    ref={input}
                    type="file"
                    accept={accept}
                    disabled={disabled}
                    tabIndex={-1}
                    aria-hidden
                    className="sr-only"
                    onChange={(e) => {
                        take(e.target.files?.[0]);
                        e.target.value = '';
                    }}
                />
                {file ? (
                    <div className="flex w-full flex-col gap-3">
                        <div className="flex items-center gap-3">
                            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground">
                                {busy ? <FileText aria-hidden className="size-5" /> : <Check aria-hidden className="size-5" />}
                            </span>
                            <div className="flex min-w-0 flex-1 flex-col">
                                <span id={titleId} className="truncate text-[0.9375rem] font-medium" title={file.name}>
                                    {file.name}
                                </span>
                                <span className="text-[0.8125rem] text-muted-foreground">
                                    {[formatBytes(file.size), file.type].filter(Boolean).join(' · ')}
                                </span>
                            </div>
                            {!busy && onClear ? (
                                <Button size="sm" variant="secondary" onClick={onClear} disabled={disabled} className="shrink-0">
                                    Choose another
                                </Button>
                            ) : null}
                        </div>
                        {busy ? (
                            <div className="flex flex-col gap-1.5">
                                <div
                                    role="progressbar"
                                    aria-valuemin={0}
                                    aria-valuemax={100}
                                    aria-valuenow={pct}
                                    aria-label={typeof progressLabel === 'string' ? progressLabel : 'Progress'}
                                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                                >
                                    <div className="h-full rounded-full bg-foreground transition-[width] duration-200" style={{ width: `${pct}%` }} />
                                </div>
                                <span className="text-[0.8125rem] text-muted-foreground oca-tabular">
                                    {progressLabel} {pct}%
                                </span>
                            </div>
                        ) : null}
                    </div>
                ) : (
                    <>
                        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-foreground">
                            <Upload aria-hidden className="size-5" />
                        </span>
                        <div className="flex flex-col gap-1">
                            <p id={titleId} className="text-[1rem] font-medium">
                                {over ? 'Drop it to add it' : title}
                            </p>
                            {hint ? <p className="text-[0.875rem] text-muted-foreground">{hint}</p> : null}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center justify-center gap-2">
                            <Button size="sm" variant="secondary" disabled={disabled} onClick={() => input.current?.click()}>
                                Choose a file
                            </Button>
                            {onText ? (
                                <Button size="sm" variant="ghost" disabled={disabled} onClick={() => setMode('text')}>
                                    Paste text instead
                                </Button>
                            ) : null}
                        </div>
                    </>
                )}
            </div>
            {error ? (
                <p id={errorId} role="alert" className="text-[0.8125rem] text-destructive">
                    {error}
                </p>
            ) : null}
            {privacyLine}
        </div>
    );
}

/* ── FormSection ─────────────────────────────────────────────────────── */

export type SectionStatus = 'done' | 'current' | 'upcoming' | 'blocked';

/**
 * A numbered group of fields: "1 What you are stamping", "2 Who signs".
 * The number turns to a check when the section is done; the current one is
 * marked for screen readers as the step in progress.
 */
export function FormSection({
    n,
    title,
    hint,
    status,
    action,
    as: Heading = 'h2',
    id,
    children,
    className,
}: {
    /** Its place in the form. Leave out for an unnumbered group. */
    n?: number;
    title: ReactNode;
    /** One line under the title. */
    hint?: ReactNode;
    status?: SectionStatus;
    /** Beside the title: Edit, Reset. */
    action?: ReactNode;
    as?: 'h2' | 'h3';
    id?: string;
    children?: ReactNode;
    className?: string;
}) {
    const titleId = useId();
    const tight = useDensity() === 'compact';
    return (
        <section
            id={id}
            aria-labelledby={titleId}
            aria-current={status === 'current' ? 'step' : undefined}
            className={cn('scroll-mt-24 rounded-[1.25rem] border border-border bg-card', className)}
        >
            {/* Below sm the action takes its own row under the hint, so the hint keeps the width. */}
            <header className={cn('flex flex-wrap items-start gap-x-3.5 gap-y-3', tight ? 'px-5 pt-5' : 'px-6 pt-6')}>
                {n !== undefined ? (
                    <span
                        aria-hidden
                        className={cn(
                            'mt-px flex size-7 shrink-0 items-center justify-center rounded-full border text-[0.8125rem] oca-tabular',
                            status === 'done' && 'border-primary bg-primary text-primary-foreground',
                            status === 'current' && 'border-brand text-oca-accent-ink',
                            status === 'blocked' && 'border-destructive text-destructive',
                            (status === 'upcoming' || status === undefined) && 'border-oca-hairline-strong text-muted-foreground'
                        )}
                    >
                        {status === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : n}
                    </span>
                ) : null}
                <div className="flex min-w-0 flex-1 flex-col gap-1">
                    <Heading id={titleId} className="text-[1.0625rem] font-medium leading-snug tracking-[-0.008em]">
                        {n !== undefined ? <span className="sr-only">Step {n}: </span> : null}
                        {title}
                        {status === 'done' ? <span className="sr-only"> (done)</span> : null}
                    </Heading>
                    {hint ? <p className="text-[0.875rem] leading-snug text-muted-foreground">{hint}</p> : null}
                </div>
                {action ? <div className={cn('shrink-0 max-sm:basis-full', n !== undefined && 'max-sm:pl-[2.625rem]')}>{action}</div> : null}
            </header>
            <div className={cn('flex flex-col', tight ? 'gap-4 p-5' : 'gap-5 p-6', n !== undefined && (tight ? 'sm:pl-[3.875rem]' : 'sm:pl-[4.125rem]'))}>
                {children}
            </div>
        </section>
    );
}

/* ── StateBadge ──────────────────────────────────────────────────────── */

/** The looks a lifecycle word can take: fixed here, so every protocol's words look alike. */
export type StateTone = 'good' | 'attention' | 'bad' | 'neutral' | 'quiet';

const STATE_TONE = { good: 'success', attention: 'brand', bad: 'danger', neutral: 'neutral', quiet: 'muted' } as const;

/** One lifecycle word in one of the family's looks. Prefer createStateBadge, which fixes the words. */
export function StateBadge({
    tone = 'neutral',
    children,
    title,
    className,
}: {
    tone?: StateTone;
    children: ReactNode;
    /** A line that explains the state, shown on hover. */
    title?: string;
    className?: string;
}) {
    return (
        <Badge tone={STATE_TONE[tone]} title={title} className={className}>
            {children}
        </Badge>
    );
}

export interface StateDef {
    label: string;
    tone: StateTone;
    /** What the state means, in a line. */
    hint?: string;
}

// Bundlers replace process.env.NODE_ENV; the typeof guard covers one that doesn't.
declare const process: { env: { NODE_ENV?: string } } | undefined;

/**
 * A protocol's lifecycle words, fixed once: `createStateBadge({ active:
 * { label: 'Active', tone: 'good' }, revoked: { label: 'Revoked', tone: 'bad' } })`
 * returns a badge that takes only those states.
 */
export function createStateBadge<S extends string>(states: Record<S, StateDef>) {
    function ProtocolStateBadge({ state, className }: { state: S; className?: string }) {
        const def = states[state];
        if (!def) {
            if (typeof process !== 'undefined' && process.env.NODE_ENV !== 'production') {
                console.warn(`StateBadge: no state "${state}"; known: ${Object.keys(states).join(', ')}`);
            }
            return <StateBadge className={className}>{String(state)}</StateBadge>;
        }
        return (
            <StateBadge tone={def.tone} title={def.hint} className={className}>
                {def.label}
            </StateBadge>
        );
    }
    return ProtocolStateBadge;
}

/* ── Bitcoin time ────────────────────────────────────────────────────── */

/** A block height in tabular figures, linked to the block on mempool.space. */
export function BlockHeight({
    height,
    label = false,
    link = true,
    network = 'mainnet',
    className,
}: {
    height: number;
    /** Say "block 971,632" rather than "971,632" (lowercase: it sits inside a sentence). */
    label?: boolean;
    link?: boolean;
    network?: Network;
    className?: string;
}) {
    const text = `${label ? 'block ' : ''}${formatBlockHeight(height)}`;
    if (!link) return <span className={cn('oca-tabular', className)}>{text}</span>;
    return (
        <a
            href={explorerUrl('block', Math.trunc(height), network)}
            target="_blank"
            rel="noreferrer"
            title={`Block ${formatBlockHeight(height)} on mempool.space`}
            className={cn('oca-tabular underline decoration-foreground/35 underline-offset-4 hover:decoration-foreground', className)}
        >
            {text}
            <span className="sr-only"> (opens mempool.space in a new tab)</span>
        </a>
    );
}

export type AnchorState = 'anchored' | 'pending' | 'unverified' | 'none' | 'fail';

const ANCHOR: Record<AnchorState, { label: string; tone: StateTone }> = {
    anchored: { label: 'Anchored', tone: 'good' },
    pending: { label: 'Anchor pending', tone: 'attention' },
    unverified: { label: 'Not checked', tone: 'quiet' },
    none: { label: 'Not anchored', tone: 'quiet' },
    fail: { label: 'Does not check out', tone: 'bad' },
};

function hostOf(url: string): string {
    try {
        return new URL(url).host;
    } catch {
        return url;
    }
}

/**
 * Whether a hash is in a Bitcoin block yet, and which one. Anchored names
 * the block and its time; pending says when and where it was submitted, so
 * "pending" can be checked; a proof that does not lead to its block says so.
 */
export function AnchorStatus({
    state,
    blockHeight,
    blockTime,
    submittedAt,
    calendar,
    message,
    network = 'mainnet',
    variant = 'detail',
    className,
}: {
    state: AnchorState;
    blockHeight?: number;
    /** The block's time: unix seconds, a Date or an ISO string. */
    blockTime?: number | Date | string;
    /** When the hash went to a calendar. */
    submittedAt?: number | Date | string;
    /** The OpenTimestamps calendar it went to. */
    calendar?: string;
    /** Replace the line under the badge. */
    message?: ReactNode;
    network?: Network;
    /** `badge`: the badge alone, its line as a tooltip. */
    variant?: 'detail' | 'badge';
    className?: string;
}) {
    const def = ANCHOR[state];
    const block = blockHeight !== undefined ? <BlockHeight height={blockHeight} label network={network} /> : null;
    const line: ReactNode =
        message ??
        (state === 'anchored' ? (
            block ? (
                <>
                    In {block}
                    {blockTime !== undefined ? ` · ${formatUtc(blockTime)}` : null}
                </>
            ) : (
                'Its hash is in a Bitcoin block.'
            )
        ) : state === 'pending' ? (
            <>
                Submitted{submittedAt !== undefined ? ` ${formatUtc(submittedAt)}` : ''} to{' '}
                {calendar ? hostOf(calendar) : 'an OpenTimestamps calendar'}. Waiting for a Bitcoin block.
            </>
        ) : state === 'unverified' ? (
            <>The proof names {block ?? 'a block'}, but its header could not be fetched to check it.</>
        ) : state === 'fail' ? (
            <>The proof does not lead to {block ?? 'the block it names'}.</>
        ) : (
            'No timestamp yet. The signature still checks offline.'
        ));
    if (variant === 'badge') {
        const plain = typeof line === 'string' ? line : undefined;
        return <StateBadge tone={def.tone} title={plain} className={className}>{def.label}</StateBadge>;
    }
    return (
        <div className={cn('flex flex-col items-start gap-1.5', className)}>
            <StateBadge tone={def.tone}>{def.label}</StateBadge>
            <p className="text-[0.875rem] leading-snug text-muted-foreground">{line}</p>
        </div>
    );
}

/**
 * How far a block height is: "In 368 blocks, about 2 days 13 hours", or
 * "Reached at block 972,000". With `from`, a bar shows how much of the wait
 * has passed. Blocks come when they come, so the time is always "about".
 */
export function BlockCountdown({
    target,
    tip,
    from,
    reached = 'Reached',
    minutesPerBlock = 10,
    network = 'mainnet',
    className,
}: {
    target: number;
    /** The chain tip now. Unknown: only the target shows. */
    tip?: number | null;
    /** Where the wait began, for the bar. */
    from?: number;
    /** The word once the target is reached: "Revealed", "Closed". */
    reached?: string;
    minutesPerBlock?: number;
    network?: Network;
    className?: string;
}) {
    const known = typeof tip === 'number';
    const left = known ? target - tip : null;
    const done = left !== null && left <= 0;
    const share = known && from !== undefined && target > from ? Math.min(1, Math.max(0, (tip - from) / (target - from))) : null;
    return (
        <div className={cn('flex flex-col gap-2', className)}>
            <p className="text-[0.9375rem] leading-snug">
                {!known ? (
                    <>
                        At <BlockHeight height={target} label network={network} />
                    </>
                ) : done ? (
                    <>
                        {reached} at <BlockHeight height={target} label network={network} />
                    </>
                ) : (
                    <>
                        In <span className="oca-tabular font-medium">{formatBlockHeight(left!)}</span> block{left === 1 ? '' : 's'}
                        <span className="text-muted-foreground">, {blocksToDuration(left!, minutesPerBlock)}</span>
                    </>
                )}
            </p>
            {share !== null ? (
                <div
                    role="progressbar"
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={Math.round(share * 100)}
                    aria-label="Blocks passed"
                    className="h-1.5 overflow-hidden rounded-full bg-muted"
                >
                    <div className="h-full rounded-full bg-foreground" style={{ width: `${share * 100}%` }} />
                </div>
            ) : null}
            {known && !done ? (
                <p className="text-[0.8125rem] text-muted-foreground">
                    Target <BlockHeight height={target} network={network} /> · tip <span className="oca-tabular">{formatBlockHeight(tip)}</span>
                </p>
            ) : null}
        </div>
    );
}

/* ── Meter ───────────────────────────────────────────────────────────── */

/**
 * One amount against a total: a tally, a goal, a strength. `ghost` adds a
 * hatched part after the value (pledged, not yet settled). For shares of a
 * whole, use SplitBar.
 */
const METER_FILL = {
    ink: 'bg-foreground',
    brand: 'bg-oca-orange-deep',
    good: 'bg-success',
    caution: 'bg-warning',
    bad: 'bg-destructive',
} as const;

export function Meter({
    value,
    max,
    ghost,
    label,
    figure,
    tone = 'ink',
    size = 'md',
    className,
}: {
    value: number;
    max: number;
    /** A further amount, drawn hatched after the value. */
    ghost?: number;
    label: ReactNode;
    /** The figure on the right: "62%", "1.2M of 2M sats". Default: the percentage. */
    figure?: ReactNode;
    /** `good`, `caution` and `bad` for a reading with a verdict: a password's strength. */
    tone?: 'ink' | 'brand' | 'good' | 'caution' | 'bad';
    size?: 'md' | 'sm';
    className?: string;
}) {
    const id = useId();
    const total = max > 0 ? max : 1;
    const v = Math.max(0, Math.min(1, value / total));
    const g = ghost ? Math.max(0, Math.min(1 - v, ghost / total)) : 0;
    const pct = `${Math.round(v * 100)}%`;
    return (
        <div className={cn('flex flex-col gap-2', className)}>
            <div className="flex items-baseline justify-between gap-4 text-[0.875rem]">
                <span id={id} className="min-w-0 truncate">
                    {label}
                </span>
                <span className="shrink-0 oca-tabular text-muted-foreground">{figure ?? pct}</span>
            </div>
            <div
                role="meter"
                aria-labelledby={id}
                aria-valuemin={0}
                aria-valuemax={max}
                aria-valuenow={value}
                aria-valuetext={typeof figure === 'string' ? figure : pct}
                className={cn('flex overflow-hidden rounded-full bg-muted', size === 'sm' ? 'h-1.5' : 'h-2.5')}
            >
                <div
                    className={cn('h-full shrink-0 rounded-full', METER_FILL[tone])}
                    style={{ width: `${v * 100}%` }}
                />
                {g > 0 ? (
                    <div
                        aria-hidden
                        className="-ml-1.5 h-full shrink-0 rounded-r-full pl-1.5 text-foreground/45"
                        style={{
                            width: `calc(${g * 100}% + 0.375rem)`,
                            backgroundImage: 'repeating-linear-gradient(-45deg, currentColor 0 2px, transparent 2px 6px)',
                        }}
                    />
                ) : null}
            </div>
        </div>
    );
}

/* ── FilterChips ─────────────────────────────────────────────────────── */

export interface FilterOption<T extends string | number> {
    value: T;
    label: ReactNode;
    count?: number;
}

/**
 * Filters above a list, as chips: one at a time, or several with
 * `multiple`. Each chip is a toggle button a screen reader hears as pressed
 * or not. They wrap on a phone, every filter in view.
 */
export function FilterChips<T extends string | number>({
    options,
    value,
    onChange,
    label,
    className,
}: {
    options: FilterOption<T>[];
    label: string;
    className?: string;
    // The options name the values; `value` must not narrow them.
} & (
    | { multiple?: false; value: NoInfer<T>; onChange: (v: NoInfer<T>) => void }
    | { multiple: true; value: NoInfer<T>[]; onChange: (v: NoInfer<T>[]) => void }
)) {
    const tight = useDensity() === 'compact';
    const multi = Array.isArray(value);
    const isOn = (v: T) => (multi ? (value as T[]).includes(v) : value === v);
    const press = (v: T) => {
        if (multi) {
            const cur = value as T[];
            (onChange as (v: T[]) => void)(cur.includes(v) ? cur.filter((x) => x !== v) : [...cur, v]);
        } else (onChange as (v: T) => void)(v);
    };
    return (
        // Wraps rather than scrolls: every filter stays in view on a phone.
        <div role="group" aria-label={label} className={cn('flex flex-wrap items-center gap-2 py-0.5', className)}>
            {options.map((o) => {
                const on = isOn(o.value);
                return (
                    <button
                        key={o.value}
                        type="button"
                        aria-pressed={on}
                        onClick={() => press(o.value)}
                        className={cn(
                            'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 text-[0.875rem] transition-colors',
                            // A thumb's 44px on a phone.
                            tight ? 'h-11 md:h-8' : 'h-11 md:h-9',
                            on
                                ? 'border-foreground bg-foreground text-background'
                                : 'border-border bg-card text-muted-foreground hover:border-oca-hairline-strong hover:text-foreground'
                        )}
                    >
                        {o.label}
                        {o.count !== undefined ? <span className="oca-tabular">{o.count.toLocaleString('en-US')}</span> : null}
                    </button>
                );
            })}
        </div>
    );
}

/* ── ToolGrid ────────────────────────────────────────────────────────── */

export interface ToolItem {
    href: string;
    label: string;
    icon?: ReactNode;
    /** One line: what the tool does. */
    description?: ReactNode;
    active?: boolean;
}

/** A protocol's tools as cards, for its dashboard: icon, name, one line. Each card is one link. */
export function ToolGrid({
    tools,
    as: Heading = 'h2',
    className,
}: {
    tools: readonly ToolItem[];
    /** Each tool's name is a heading: h2 under the page's title, h3 under a section's. */
    as?: 'h2' | 'h3';
    className?: string;
}) {
    const tight = useDensity() === 'compact';
    const n = tools.length;
    return (
        <ul
            className={cn(
                'grid grid-cols-1 gap-3 sm:grid-cols-2 md:gap-4',
                // Three or four sit in one row on a wide screen.
                n === 3 || n === 6 ? 'lg:grid-cols-3' : n === 4 ? 'xl:grid-cols-4' : null,
                className
            )}
        >
            {tools.map((t) => (
                <li key={t.href}>
                    <div
                        className={cn(
                            'group relative flex h-full flex-col rounded-[1.25rem] border border-border bg-card transition-colors',
                            tight ? 'gap-3 p-5' : 'gap-4 p-6',
                            'hover:border-oca-hairline-strong has-[a:focus-visible]:ring-2 has-[a:focus-visible]:ring-ring has-[a:focus-visible]:ring-offset-2 has-[a:focus-visible]:ring-offset-background'
                        )}
                    >
                        <div className="flex items-center justify-between gap-3">
                            {t.icon ? (
                                <span className="flex size-10 items-center justify-center rounded-xl bg-muted text-foreground [&_svg]:size-5">
                                    {t.icon}
                                </span>
                            ) : (
                                <span />
                            )}
                            <ArrowRight
                                aria-hidden
                                className="size-4 text-muted-foreground transition-transform duration-200 group-hover:translate-x-0.5 group-hover:text-foreground"
                            />
                        </div>
                        <div className="flex flex-col gap-1.5">
                            <Heading className="oca-title-sm">
                                <Link
                                    href={t.href}
                                    className="outline-none after:absolute after:inset-0 after:rounded-[1.25rem] after:content-['']"
                                >
                                    {t.label}
                                </Link>
                            </Heading>
                            {t.description ? <p className="text-[0.9375rem] leading-relaxed text-muted-foreground">{t.description}</p> : null}
                        </div>
                    </div>
                </li>
            ))}
        </ul>
    );
}
