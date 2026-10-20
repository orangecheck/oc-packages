import { Check, Copy } from 'lucide-react';
import {
    Children,
    cloneElement,
    createContext,
    isValidElement,
    useCallback,
    useContext,
    useEffect,
    useRef,
    useState,
    type HTMLAttributes,
    type ReactElement,
    type ReactNode,
} from 'react';

import { explorerUrl, shortenMiddle, type ExplorerKind, type Network } from '../format';
import { cn } from '../lib/cn';
import { useDensity } from '../lib/density';
import { useShellPlace } from '../lib/shell-context';
import { Button } from '../primitives/button';
import { Skeleton, useTimedOut } from '../primitives/feedback';
import { ScrollFade } from '../primitives/scroll-fade';

/* ── Page header ─────────────────────────────────────────────────────── */

/**
 * The top of a signed-in page: section, page title, one sentence, actions.
 * Inside AppShell the eyebrow defaults to the current section, so every page
 * in a section opens at the same height. Pass `eyebrow={null}` to omit it.
 * Public pages use PageHero.
 */
export function PageHeader({
    eyebrow,
    title,
    description,
    actions,
    className,
}: {
    eyebrow?: ReactNode;
    title: ReactNode;
    /** One sentence. Longer explanation belongs in the docs, not the header. */
    description?: ReactNode;
    actions?: ReactNode;
    className?: string;
}) {
    const place = useShellPlace();
    const eb = eyebrow === undefined ? place.section : eyebrow;
    return (
        <header className={cn('flex flex-col gap-5 md:flex-row md:items-end md:justify-between', className)}>
            <div className="flex min-w-0 max-w-[44rem] flex-col gap-2.5">
                {eb ? <p className="oca-eyebrow">{eb}</p> : null}
                <h1 className="oca-display-3">{title}</h1>
                {description ? <p className="oca-body max-w-[40rem] text-[1.0625rem]">{description}</p> : null}
            </div>
            {actions ? <div className="flex flex-wrap items-center gap-2.5 md:shrink-0 md:justify-end">{actions}</div> : null}
        </header>
    );
}

/* ── Stats ───────────────────────────────────────────────────────────── */

const InStatGrid = createContext(false);

export interface StatCardProps {
    label: ReactNode;
    value: ReactNode;
    hint?: ReactNode;
    /**
     * The number behind `value`, when there is one. StatGrid reads it: a grid
     * whose every `raw` is 0 or null shows one empty line instead of zeros.
     */
    raw?: number | null;
    /** `sm` for a tool page: tighter, a smaller figure. Defaults to the density around it. */
    size?: 'md' | 'sm';
    /**
     * The change beside the figure: `{ value: -2.4, suffix: '%' }`. Green when
     * it moves the good way (`good`, default up), red the other, quiet at 0.
     */
    delta?: { value: number; suffix?: string; good?: 'up' | 'down'; label?: string };
    className?: string;
}

function Delta({ value, suffix = '', good = 'up', label }: NonNullable<StatCardProps['delta']>) {
    const dir = value > 0 ? 'up' : value < 0 ? 'down' : 'flat';
    const tone = dir === 'flat' ? 'text-muted-foreground' : dir === good ? 'text-success' : 'text-destructive';
    const sign = value > 0 ? '+' : value < 0 ? '−' : '';
    return (
        <span className={cn('inline-flex items-baseline gap-1 text-[0.8125rem] font-normal tracking-normal oca-tabular', tone)}>
            <span aria-hidden>{dir === 'up' ? '↑' : dir === 'down' ? '↓' : '·'}</span>
            {sign}
            {Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 2 })}
            {suffix}
            {label ? <span className="text-muted-foreground"> {label}</span> : null}
        </span>
    );
}

export function StatCard({ label, value, hint, size, delta, className }: StatCardProps) {
    const inGrid = useContext(InStatGrid);
    const density = useDensity();
    const sm = (size ?? (density === 'compact' ? 'sm' : 'md')) === 'sm';
    return (
        <div
            data-ui="stat"
            className={cn(
                'border border-border bg-card',
                sm ? 'rounded-2xl p-4' : 'rounded-[1.25rem] p-5 md:p-6',
                // In a grid, label, value and hint each share a row with their
                // neighbours, so values line up whatever wraps above them.
                inGrid ? 'row-span-3 grid grid-rows-subgrid gap-1.5' : 'flex flex-col gap-2',
                className
            )}
        >
            <span className={cn('leading-snug text-muted-foreground', sm ? 'text-[0.8125rem]' : 'text-[0.875rem]')}>{label}</span>
            {/* Bottom-aligned within a grid row; a lone card keeps it under its label. */}
            <span
                className={cn(
                    'break-words oca-tabular leading-tight tracking-[-0.02em]',
                    sm ? 'text-[1.25rem]' : 'text-[1.5rem] md:text-[1.75rem]',
                    inGrid && 'self-end',
                    delta && 'flex flex-wrap items-baseline gap-x-2'
                )}
            >
                {value}
                {delta ? <Delta {...delta} /> : null}
            </span>
            {hint ? (
                <span className="text-[0.8125rem] leading-snug text-muted-foreground">{hint}</span>
            ) : inGrid ? (
                <span aria-hidden />
            ) : null}
        </div>
    );
}

const MD_COLS: Record<number, string> = {
    1: 'md:grid-cols-1',
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
};
const LG_COLS: Record<number, string> = {
    1: 'lg:grid-cols-1',
    2: 'lg:grid-cols-2',
    3: 'lg:grid-cols-3',
    4: 'lg:grid-cols-4',
    5: 'lg:grid-cols-5',
};
const MD_SPAN: Record<number, string> = {
    1: 'md:col-span-1',
    2: 'md:col-span-2',
    3: 'md:col-span-3',
    4: 'md:col-span-4',
};
const LG_SPAN: Record<number, string> = {
    1: 'lg:col-span-1',
    2: 'lg:col-span-2',
    3: 'lg:col-span-3',
    4: 'lg:col-span-4',
};

/** Columns for n tiles: as few ragged rows as possible, never more than five. */
function statColumns(n: number): number {
    if (n <= 5) return Math.max(1, n);
    if (n % 4 === 0) return 4;
    if (n % 3 === 0) return 3;
    return 4;
}

/** How wide the last tile must be to fill its row of `cols`. */
function lastSpan(n: number, cols: number): number {
    const rest = n % cols;
    return rest === 0 ? 1 : cols - rest + 1;
}

/** One quiet line where a group of numbers would all be zero. */
export function EmptyLine({ children, className }: { children: ReactNode; className?: string }) {
    return (
        <p
            className={cn(
                'rounded-[1.25rem] border border-dashed border-oca-hairline-strong px-5 py-4 text-[0.9375rem] text-muted-foreground',
                className
            )}
        >
            {children}
        </p>
    );
}

export interface StatGridProps extends HTMLAttributes<HTMLDivElement> {
    /** Columns from md up. Default: the count up to 4, then 3 or 4. */
    columns?: 1 | 2 | 3 | 4 | 5;
    /** Shown instead of the tiles when the group is empty. */
    empty?: ReactNode;
    /** Force the empty line. Default: every child's `raw` is 0 or null. */
    isEmpty?: boolean;
}

/**
 * Stat tiles, two to a row on a phone. The last tile stretches to fill its row,
 * so a grid never ends in a hole, and a group of zeros becomes one line.
 */
export function StatGrid({ columns, empty, isEmpty, className, children, ...props }: StatGridProps) {
    const items = Children.toArray(children).filter(isValidElement) as ReactElement<StatCardProps>[];
    const n = items.length;
    const allZero =
        n > 0 && items.every((el) => 'raw' in el.props && (el.props.raw === 0 || el.props.raw === null));
    const compact = useDensity() === 'compact';
    if (isEmpty ?? allZero) return <EmptyLine className={className}>{empty ?? 'Nothing here yet.'}</EmptyLine>;
    const lg = columns ?? statColumns(n);
    // Five across is a desk-width row; a tablet gets three.
    const md = lg > 4 ? 3 : lg;
    const mdSpan = lastSpan(n, md);
    const lgSpan = lastSpan(n, lg);
    return (
        <InStatGrid.Provider value>
            <div
                className={cn(
                    'grid',
                    compact ? 'gap-2.5 md:gap-3' : 'gap-3 md:gap-4',
                    n === 1 ? 'grid-cols-1' : 'grid-cols-2',
                    MD_COLS[md],
                    LG_COLS[lg],
                    className
                )}
                {...props}
            >
                {items.map((el, i) => {
                    if (i !== n - 1) return el;
                    const span = cn(
                        n % 2 === 1 && n > 1 && 'max-md:col-span-2',
                        (mdSpan > 1 || lgSpan > 1) && MD_SPAN[mdSpan],
                        (mdSpan > 1 || lgSpan > 1) && LG_SPAN[lgSpan]
                    );
                    return span ? cloneElement(el, { className: cn(el.props.className, span) }) : el;
                })}
            </div>
        </InStatGrid.Provider>
    );
}

/* ── Key / value ─────────────────────────────────────────────────────── */

export interface KeyValueItem {
    label: ReactNode;
    value: ReactNode;
    mono?: boolean;
    /** After the value: what it means ("Undervalued", "Above the 200-week mean"). */
    note?: ReactNode;
    /** Colours the note, or the value when there is none. */
    tone?: ValueTone;
}

/** A reading's verdict, in words and colour: good, caution, bad, the accent, or quiet. */
export type ValueTone = 'good' | 'caution' | 'bad' | 'brand' | 'muted';

const TONE_TEXT: Record<ValueTone, string> = {
    good: 'text-success',
    caution: 'text-warning',
    bad: 'text-destructive',
    brand: 'text-oca-accent-ink',
    muted: 'text-muted-foreground',
};

export function KeyValueList({
    items,
    dense,
    className,
}: {
    items: KeyValueItem[];
    /** Tighter rows and smaller text, for a tool page. Defaults to the density around it. */
    dense?: boolean;
    className?: string;
}) {
    const density = useDensity();
    const tight = dense ?? density === 'compact';
    return (
        // The rows go side by side when the list itself is wide enough, wherever it sits: a narrow card stacks them.
        <dl className={cn('@container divide-y divide-border border border-border bg-card', tight ? 'rounded-2xl' : 'rounded-[1.25rem]', className)}>
            {items.map((it, i) => (
                <div
                    key={i}
                    className={cn(
                        'flex flex-col gap-1 @md:flex-row @md:items-baseline',
                        tight ? 'px-4 py-2.5 @md:gap-5' : 'px-5 py-3.5 @md:gap-6'
                    )}
                >
                    <dt className={cn('shrink-0 text-muted-foreground', tight ? 'text-[0.8125rem] @md:w-36' : 'text-[0.875rem] @md:w-48')}>
                        {it.label}
                    </dt>
                    <dd
                        className={cn(
                            'min-w-0 break-words',
                            tight ? 'text-[0.875rem]' : 'text-[0.9375rem]',
                            it.mono && (tight ? 'font-mono text-[0.8125rem]' : 'font-mono text-[0.875rem]'),
                            it.tone && !it.note && TONE_TEXT[it.tone]
                        )}
                    >
                        {it.value}
                        {it.note ? (
                            <span className={cn('ml-2 font-sans text-[0.8125rem]', TONE_TEXT[it.tone ?? 'muted'])}>{it.note}</span>
                        ) : null}
                    </dd>
                </div>
            ))}
        </dl>
    );
}

/* ── Table ───────────────────────────────────────────────────────────── */

export interface Column<T> {
    key: string;
    header: ReactNode;
    cell: (row: T) => ReactNode;
    align?: 'start' | 'end';
    /** A number: right-aligned, tabular, never wrapped. */
    numeric?: boolean;
    /** Hide below md in the table (the phone card list still shows it). */
    wide?: boolean;
    /** A CSS width for the column, e.g. '12rem' or '30%'. */
    width?: string;
    /** The narrowest it may get before the table scrolls instead. */
    minWidth?: string;
    /** Cut long content to one line (put the full value in a title or HashChip). */
    truncate?: boolean;
    /** The phone card's title. Defaults to the first column. */
    primary?: boolean;
    /** Leave out of the phone card list. */
    hideOnPhone?: boolean;
}

/**
 * Rows of data. Wider than its box, the table scrolls with an edge that says
 * so; under 640px it becomes a list of cards that keep every column's label.
 */
export function DataTable<T>({
    columns,
    rows,
    rowKey,
    empty,
    caption,
    phone = 'cards',
    dense,
    className,
}: {
    columns: Column<T>[];
    rows: T[];
    rowKey: (row: T, i: number) => string;
    empty?: ReactNode;
    caption?: string;
    /** Under 640px: a card per row (default), or the same table scrolling. */
    phone?: 'cards' | 'scroll';
    /** Tighter rows and 14px text, for a tool page. Defaults to the density around it. */
    dense?: boolean;
    className?: string;
}) {
    const density = useDensity();
    const tight = dense ?? density === 'compact';
    if (rows.length === 0 && empty) return <>{empty}</>;
    const primary = columns.find((c) => c.primary) ?? columns[0];
    const right = (c: Column<T>) => c.numeric || c.align === 'end';
    const table = (
        <div
            className={cn(
                'overflow-hidden border border-border bg-card',
                tight ? 'rounded-2xl' : 'rounded-[1.25rem]',
                phone === 'cards' && 'max-sm:hidden',
                className
            )}
        >
            <ScrollFade fade="var(--card)">
                <table className={cn('w-full border-collapse text-left', tight ? 'text-[0.875rem]' : 'text-[0.9375rem]')}>
                    {caption ? <caption className="sr-only">{caption}</caption> : null}
                    <thead>
                        <tr className="border-b border-border">
                            {columns.map((c) => (
                                <th
                                    key={c.key}
                                    scope="col"
                                    style={{ width: c.width, minWidth: c.minWidth }}
                                    className={cn(
                                        'whitespace-nowrap text-[0.8125rem] font-medium text-muted-foreground',
                                        tight ? 'px-4 py-2.5' : 'px-5 py-3',
                                        right(c) && 'text-right',
                                        c.wide && 'hidden md:table-cell'
                                    )}
                                >
                                    {c.header}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border">
                        {rows.map((r, i) => (
                            <tr key={rowKey(r, i)} className="transition-colors hover:bg-accent/60">
                                {columns.map((c) => (
                                    <td
                                        key={c.key}
                                        style={{ minWidth: c.minWidth }}
                                        className={cn(
                                            'align-middle',
                                            tight ? 'px-4 py-2' : 'px-5 py-3.5',
                                            right(c) && 'text-right',
                                            c.numeric && 'whitespace-nowrap oca-tabular',
                                            c.wide && 'hidden md:table-cell'
                                        )}
                                    >
                                        {c.truncate ? (
                                            <div className="truncate" style={{ maxWidth: c.width ?? '16rem' }}>
                                                {c.cell(r)}
                                            </div>
                                        ) : (
                                            c.cell(r)
                                        )}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </ScrollFade>
        </div>
    );
    if (phone !== 'cards') return table;
    const rest = columns.filter((c) => c !== primary && !c.hideOnPhone);
    return (
        <>
            {table}
            <ul
                aria-label={caption}
                className={cn(
                    'divide-y divide-border border border-border bg-card sm:hidden',
                    tight ? 'rounded-2xl' : 'rounded-[1.25rem]',
                    className
                )}
            >
                {rows.map((r, i) => (
                    <li key={rowKey(r, i)} className={cn('flex flex-col gap-2.5 px-4', tight ? 'py-3' : 'py-4')}>
                        <div className="min-w-0 break-words text-[0.9375rem] font-medium">{primary?.cell(r)}</div>
                        {rest.length > 0 ? (
                            <dl className="grid grid-cols-[minmax(5.5rem,auto)_minmax(0,1fr)] gap-x-4 gap-y-1.5 text-[0.875rem]">
                                {rest.map((c) => (
                                    <div key={c.key} className="contents">
                                        <dt className="text-muted-foreground">{c.header}</dt>
                                        <dd className={cn('min-w-0 break-words', c.numeric && 'oca-tabular')}>{c.cell(r)}</dd>
                                    </div>
                                ))}
                            </dl>
                        ) : null}
                    </li>
                ))}
            </ul>
        </>
    );
}

/* ── Empty, notice ───────────────────────────────────────────────────── */

export function EmptyState({
    title,
    children,
    action,
    icon,
    className,
}: {
    title: ReactNode;
    children?: ReactNode;
    action?: ReactNode;
    /** An icon that says what is missing. None by default: the words carry it. */
    icon?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex flex-col items-center gap-3 rounded-[1.25rem] border border-dashed border-oca-hairline-strong px-6 py-10 text-center',
                className
            )}
        >
            {icon ? (
                <span className="mb-1 flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground [&_svg]:size-5">
                    {icon}
                </span>
            ) : null}
            <h3 className="oca-title-sm">{title}</h3>
            {children ? <div className="oca-body max-w-md text-[0.9375rem]">{children}</div> : null}
            {action ? <div className="mt-2 flex flex-wrap justify-center gap-3">{action}</div> : null}
        </div>
    );
}

/*
 * Three kinds of notice: neutral, the orange accent for something that needs
 * attention, and red for a real error. The old tone names still compile and
 * land on one of the three, so no page can add a fourth colour.
 */
type NoticeTone = 'neutral' | 'brand' | 'danger' | 'info' | 'success' | 'warning';

const NOTICE_KIND: Record<NoticeTone, 'neutral' | 'brand' | 'danger'> = {
    neutral: 'neutral',
    info: 'neutral',
    success: 'neutral',
    brand: 'brand',
    warning: 'brand',
    danger: 'danger',
};

export function Notice({
    tone = 'neutral',
    title,
    children,
    action,
    icon,
    role,
    className,
}: {
    tone?: NoticeTone;
    title?: ReactNode;
    /** A lucide icon in place of the dot, in the notice's colour: a lock, a shield. */
    icon?: ReactNode;
    children?: ReactNode;
    action?: ReactNode;
    /** Default: `alert` for danger and warning, which a screen reader announces. Text that is
     *  simply part of the page (a docs callout) is a `note`. */
    role?: 'alert' | 'status' | 'note';
    className?: string;
}) {
    const kind = NOTICE_KIND[tone];
    return (
        <div
            role={role ?? (tone === 'danger' || tone === 'warning' ? 'alert' : 'note')}
            data-tone={kind}
            className={cn(
                'flex flex-col gap-3 rounded-2xl border border-border bg-card px-5 py-4 sm:flex-row sm:items-start sm:justify-between',
                kind === 'danger' && 'border-[color-mix(in_oklab,var(--destructive)_40%,var(--border))]',
                className
            )}
        >
            <div className="flex min-w-0 gap-3">
                {icon ? (
                    <span
                        aria-hidden
                        className={cn(
                            'mt-0.5 shrink-0 [&_svg]:size-[1.125rem]',
                            kind === 'brand' ? 'text-oca-accent-ink' : kind === 'danger' ? 'text-destructive' : 'text-muted-foreground'
                        )}
                    >
                        {icon}
                    </span>
                ) : kind !== 'neutral' ? (
                    <span
                        aria-hidden
                        className={cn(
                            'mt-[0.45rem] size-2 shrink-0 rounded-full',
                            kind === 'brand' ? 'bg-oca-orange' : 'bg-destructive'
                        )}
                    />
                ) : null}
                <div className="flex min-w-0 flex-col gap-1">
                    {title ? (
                        <p className={cn('text-[0.9375rem] font-medium', kind === 'danger' && 'text-destructive')}>
                            {title}
                        </p>
                    ) : null}
                    {children ? <div className="text-[0.9375rem] leading-relaxed text-muted-foreground">{children}</div> : null}
                </div>
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
        </div>
    );
}

/**
 * Placeholder rows while something loads, and a way out if it never does:
 * after `timeoutMs` the skeleton turns into a message with a retry.
 */
export function LoadingBlock({
    rows = 3,
    timeoutMs = 12_000,
    onRetry,
    label = 'Loading',
    className,
}: {
    rows?: number;
    timeoutMs?: number;
    onRetry?: () => void;
    label?: string;
    className?: string;
}) {
    const timedOut = useTimedOut(true, timeoutMs);
    if (timedOut) {
        return (
            <Notice
                className={className}
                title="This is taking longer than it should."
                action={
                    <Button size="sm" variant="secondary" onClick={onRetry ?? (() => window.location.reload())}>
                        Try again
                    </Button>
                }
            >
                Check your connection, then try again.
            </Notice>
        );
    }
    return (
        <div role="status" aria-label={label} className={cn('flex flex-col gap-3', className)}>
            {Array.from({ length: rows }, (_, i) => (
                <Skeleton key={i} className="h-16 rounded-2xl" />
            ))}
        </div>
    );
}

/* ── Hashes, addresses, ids ──────────────────────────────────────────── */

/** Wipe the clipboard if it still holds `expected`, and only then. */
async function wipeIfUnchanged(expected: string): Promise<void> {
    try {
        if ((await navigator.clipboard.readText()) !== expected) return;
    } catch {
        // Reading needs a permission most browsers withhold; wiping does not.
    }
    try {
        await navigator.clipboard.writeText('');
    } catch {
        /* the clipboard is unavailable here */
    }
}

export function useCopy(timeoutMs = 1600) {
    const [copied, setCopied] = useState(false);
    const t = useRef<ReturnType<typeof setTimeout> | null>(null);
    const wipe = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(
        () => () => {
            if (t.current) clearTimeout(t.current);
        },
        []
    );
    const copy = useCallback(
        async (text: string, opts: { clearAfter?: number } = {}): Promise<boolean> => {
            try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                if (t.current) clearTimeout(t.current);
                t.current = setTimeout(() => setCopied(false), timeoutMs);
                if (opts.clearAfter && opts.clearAfter > 0) {
                    // Outlives the component on purpose: the secret should go even if the page moves on.
                    if (wipe.current) clearTimeout(wipe.current);
                    wipe.current = setTimeout(() => void wipeIfUnchanged(text), opts.clearAfter);
                }
                return true;
            } catch {
                setCopied(false);
                return false;
            }
        },
        [timeoutMs]
    );
    return { copied, copy };
}

export interface CopyButtonProps {
    /** The text, or a function that reads it at the moment of copying. */
    value: string | (() => string);
    label?: string;
    /**
     * Milliseconds after which the clipboard is wiped, if it still holds what
     * was copied (a secret, a recovery code). Unset: never.
     */
    clearAfter?: number;
    /** Called once the text is on the clipboard. */
    onCopied?: () => void;
    className?: string;
}

export function CopyButton({ value, label = 'Copy', clearAfter, onCopied, className }: CopyButtonProps) {
    const { copied, copy } = useCopy();
    const done = copied ? (clearAfter ? `Copied. Cleared in ${Math.round(clearAfter / 1000)} seconds` : 'Copied') : '';
    return (
        <button
            type="button"
            onClick={async () => {
                if (await copy(typeof value === 'function' ? value() : value, { clearAfter })) onCopied?.();
            }}
            aria-label={copied ? 'Copied' : label}
            title={label}
            className={cn(
                'inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                className
            )}
        >
            {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
            <span aria-live="polite" className="sr-only">
                {done}
            </span>
        </button>
    );
}

/**
 * A long identifier shown as head…tail in mono, with copy. The full value is
 * the title and the copied text, never lost to the truncation. `explorer`
 * links an address, transaction or block to mempool.space.
 */
export function HashChip({
    value,
    head = 8,
    tail = 6,
    copy = true,
    href,
    explorer,
    network = 'mainnet',
    className,
}: {
    value: string;
    head?: number;
    tail?: number;
    copy?: boolean;
    href?: string;
    /** What the value is, to link it on mempool.space. `href` wins when both are set. */
    explorer?: ExplorerKind;
    network?: Network;
    className?: string;
}) {
    const shown = shortenMiddle(value, head, tail);
    const link = href ?? (explorer ? explorerUrl(explorer, value, network) : undefined);
    const offsite = !!link && /^https?:\/\//.test(link);
    const text = (
        <span title={value} className="font-mono text-[0.875rem]">
            {shown}
        </span>
    );
    return (
        <span className={cn('inline-flex max-w-full items-center gap-1', className)}>
            {link ? (
                <a
                    href={link}
                    {...(offsite ? { target: '_blank', rel: 'noreferrer' } : {})}
                    className="underline decoration-foreground/35 underline-offset-4 hover:decoration-foreground"
                >
                    {text}
                    {offsite ? <span className="sr-only"> (opens in a new tab)</span> : null}
                </a>
            ) : (
                text
            )}
            {copy ? <CopyButton value={value} label="Copy full value" /> : null}
        </span>
    );
}

/* ── Progress ────────────────────────────────────────────────────────── */

export type StepState = 'done' | 'current' | 'upcoming' | 'blocked';

export interface ProgressStep {
    label: ReactNode;
    hint?: ReactNode;
    state: StepState;
}

export function ProgressSteps({ steps, className }: { steps: ProgressStep[]; className?: string }) {
    return (
        <ol className={cn('flex flex-col gap-0', className)}>
            {steps.map((s, i) => {
                const last = i === steps.length - 1;
                return (
                    <li key={i} className="relative flex gap-4 pb-6 last:pb-0" aria-current={s.state === 'current' ? 'step' : undefined}>
                        {!last ? (
                            <span
                                aria-hidden
                                className={cn(
                                    'absolute left-[11px] top-7 h-[calc(100%-1.5rem)] w-px',
                                    s.state === 'done' ? 'bg-foreground/30' : 'bg-border'
                                )}
                            />
                        ) : null}
                        <span
                            className={cn(
                                'relative z-10 mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full border text-[0.75rem] oca-tabular',
                                s.state === 'done' && 'border-primary bg-primary text-primary-foreground',
                                s.state === 'current' && 'border-brand bg-card text-oca-accent-ink',
                                s.state === 'upcoming' && 'border-border bg-card text-muted-foreground',
                                s.state === 'blocked' && 'border-destructive bg-card text-destructive'
                            )}
                        >
                            {s.state === 'done' ? <Check className="size-3.5" strokeWidth={3} /> : String(i + 1).padStart(2, '0')}
                        </span>
                        <div className="flex min-w-0 flex-col gap-1">
                            <span className={cn('text-[0.9375rem]', s.state === 'upcoming' ? 'text-muted-foreground' : 'font-medium')}>
                                {s.label}
                            </span>
                            {s.hint ? <span className="text-[0.875rem] leading-snug text-muted-foreground">{s.hint}</span> : null}
                        </div>
                    </li>
                );
            })}
        </ol>
    );
}

/* ── Activity ────────────────────────────────────────────────────────── */

export interface ActivityItem {
    id: string;
    title: ReactNode;
    meta?: ReactNode;
    /** A small mark before the text, such as a Monogram. */
    leading?: ReactNode;
    trailing?: ReactNode;
    href?: string;
}

export function ActivityList({ items, empty, className }: { items: ActivityItem[]; empty?: ReactNode; className?: string }) {
    if (items.length === 0 && empty) return <>{empty}</>;
    return (
        <ul className={cn('divide-y divide-border rounded-[1.25rem] border border-border bg-card', className)}>
            {items.map((it) => {
                const body = (
                    <div className="flex items-center justify-between gap-4 px-5 py-4">
                        <div className="flex min-w-0 items-center gap-3">
                            {it.leading ? <div className="shrink-0">{it.leading}</div> : null}
                            <div className="flex min-w-0 flex-col gap-0.5">
                                <span className="truncate text-[0.9375rem]">{it.title}</span>
                                {it.meta ? <span className="truncate text-[0.8125rem] text-muted-foreground">{it.meta}</span> : null}
                            </div>
                        </div>
                        {it.trailing ? <div className="shrink-0 text-right">{it.trailing}</div> : null}
                    </div>
                );
                return (
                    <li key={it.id}>
                        {it.href ? (
                            <a href={it.href} className="block transition-colors hover:bg-accent/60">
                                {body}
                            </a>
                        ) : (
                            body
                        )}
                    </li>
                );
            })}
        </ul>
    );
}
