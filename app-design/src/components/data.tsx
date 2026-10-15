import { Check, Copy } from 'lucide-react';
import { useCallback, useEffect, useRef, useState, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { Mark } from '../brand/mark';

/* ── Page header ─────────────────────────────────────────────────────── */

export function PageHeader({
    eyebrow,
    title,
    description,
    actions,
    className,
}: {
    eyebrow?: ReactNode;
    title: ReactNode;
    description?: ReactNode;
    actions?: ReactNode;
    className?: string;
}) {
    return (
        <header className={cn('flex flex-col gap-5 md:flex-row md:items-end md:justify-between', className)}>
            <div className="flex max-w-[44rem] flex-col gap-3">
                {eyebrow ? <p className="oca-eyebrow">{eyebrow}</p> : null}
                <h1 className="oca-display-3">{title}</h1>
                {description ? <p className="oca-body text-[1.0625rem]">{description}</p> : null}
            </div>
            {actions ? <div className="flex shrink-0 flex-wrap items-center gap-3">{actions}</div> : null}
        </header>
    );
}

/* ── Stats ───────────────────────────────────────────────────────────── */

export function StatCard({
    label,
    value,
    hint,
    className,
}: {
    label: ReactNode;
    value: ReactNode;
    hint?: ReactNode;
    className?: string;
}) {
    return (
        <div className={cn('flex flex-col gap-2 rounded-[1.25rem] border border-border bg-card p-5 md:p-6', className)}>
            <span className="text-[0.875rem] text-muted-foreground">{label}</span>
            <span className="oca-tabular text-[1.75rem] leading-tight tracking-[-0.02em]">{value}</span>
            {hint ? <span className="text-[0.8125rem] leading-snug text-muted-foreground">{hint}</span> : null}
        </div>
    );
}

export function StatGrid({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('grid grid-cols-2 gap-3 md:grid-cols-4 md:gap-4', className)} {...props} />;
}

/* ── Key / value ─────────────────────────────────────────────────────── */

export interface KeyValueItem {
    label: ReactNode;
    value: ReactNode;
    mono?: boolean;
}

export function KeyValueList({ items, className }: { items: KeyValueItem[]; className?: string }) {
    return (
        <dl className={cn('divide-y divide-border rounded-[1.25rem] border border-border bg-card', className)}>
            {items.map((it, i) => (
                <div key={i} className="flex flex-col gap-1 px-5 py-3.5 sm:flex-row sm:items-baseline sm:gap-6">
                    <dt className="shrink-0 text-[0.875rem] text-muted-foreground sm:w-48">{it.label}</dt>
                    <dd className={cn('min-w-0 break-words text-[0.9375rem]', it.mono && 'font-mono text-[0.875rem]')}>
                        {it.value}
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
    /** Hide below md. */
    wide?: boolean;
}

export function DataTable<T>({
    columns,
    rows,
    rowKey,
    empty,
    caption,
    className,
}: {
    columns: Column<T>[];
    rows: T[];
    rowKey: (row: T, i: number) => string;
    empty?: ReactNode;
    caption?: string;
    className?: string;
}) {
    if (rows.length === 0 && empty) return <>{empty}</>;
    return (
        <div className={cn('overflow-x-auto rounded-[1.25rem] border border-border bg-card', className)}>
            <table className="w-full border-collapse text-left text-[0.9375rem]">
                {caption ? <caption className="sr-only">{caption}</caption> : null}
                <thead>
                    <tr className="border-b border-border">
                        {columns.map((c) => (
                            <th
                                key={c.key}
                                scope="col"
                                className={cn(
                                    'whitespace-nowrap px-5 py-3 text-[0.8125rem] font-medium text-muted-foreground',
                                    c.align === 'end' && 'text-right',
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
                                    className={cn(
                                        'px-5 py-3.5 align-middle',
                                        c.align === 'end' && 'text-right',
                                        c.wide && 'hidden md:table-cell'
                                    )}
                                >
                                    {c.cell(r)}
                                </td>
                            ))}
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

/* ── Empty, notice ───────────────────────────────────────────────────── */

export function EmptyState({
    title,
    children,
    action,
    className,
}: {
    title: ReactNode;
    children?: ReactNode;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div
            className={cn(
                'flex flex-col items-center gap-4 rounded-[1.25rem] border border-dashed border-oca-hairline-strong px-6 py-12 text-center',
                className
            )}
        >
            <Mark size={56} />
            <h3 className="oca-title-sm">{title}</h3>
            {children ? <div className="oca-body max-w-md text-[0.9375rem]">{children}</div> : null}
            {action ? <div className="mt-1 flex flex-wrap justify-center gap-3">{action}</div> : null}
        </div>
    );
}

type NoticeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'brand';

const NOTICE: Record<NoticeTone, string> = {
    neutral: 'border-border bg-card',
    info: 'border-[color-mix(in_oklab,var(--info)_30%,var(--border))] bg-[color-mix(in_oklab,var(--info)_6%,var(--card))]',
    success:
        'border-[color-mix(in_oklab,var(--success)_30%,var(--border))] bg-[color-mix(in_oklab,var(--success)_6%,var(--card))]',
    warning:
        'border-[color-mix(in_oklab,var(--warning)_35%,var(--border))] bg-[color-mix(in_oklab,var(--warning)_7%,var(--card))]',
    danger:
        'border-[color-mix(in_oklab,var(--destructive)_32%,var(--border))] bg-[color-mix(in_oklab,var(--destructive)_6%,var(--card))]',
    brand: 'border-[color-mix(in_oklab,var(--oca-orange)_35%,var(--border))] bg-[color-mix(in_oklab,var(--oca-orange)_7%,var(--card))]',
};

const NOTICE_TITLE: Record<NoticeTone, string> = {
    neutral: 'text-foreground',
    info: 'text-info',
    success: 'text-success',
    warning: 'text-warning',
    danger: 'text-destructive',
    brand: 'text-oca-accent-ink',
};

export function Notice({
    tone = 'neutral',
    title,
    children,
    action,
    className,
}: {
    tone?: NoticeTone;
    title?: ReactNode;
    children?: ReactNode;
    action?: ReactNode;
    className?: string;
}) {
    return (
        <div
            role={tone === 'danger' || tone === 'warning' ? 'alert' : 'note'}
            className={cn(
                'flex flex-col gap-3 rounded-2xl border px-5 py-4 sm:flex-row sm:items-start sm:justify-between',
                NOTICE[tone],
                className
            )}
        >
            <div className="flex min-w-0 flex-col gap-1">
                {title ? <p className={cn('text-[0.9375rem] font-medium', NOTICE_TITLE[tone])}>{title}</p> : null}
                {children ? <div className="text-[0.9375rem] leading-relaxed text-foreground/85">{children}</div> : null}
            </div>
            {action ? <div className="shrink-0">{action}</div> : null}
        </div>
    );
}

/* ── Hashes, addresses, ids ──────────────────────────────────────────── */

function middle(v: string, head: number, tail: number) {
    return v.length <= head + tail + 1 ? v : `${v.slice(0, head)}…${v.slice(-tail)}`;
}

export function useCopy(timeoutMs = 1600) {
    const [copied, setCopied] = useState(false);
    const t = useRef<ReturnType<typeof setTimeout> | null>(null);
    useEffect(() => () => {
        if (t.current) clearTimeout(t.current);
    }, []);
    const copy = useCallback(
        async (text: string) => {
            try {
                await navigator.clipboard.writeText(text);
                setCopied(true);
                if (t.current) clearTimeout(t.current);
                t.current = setTimeout(() => setCopied(false), timeoutMs);
            } catch {
                setCopied(false);
            }
        },
        [timeoutMs]
    );
    return { copied, copy };
}

export function CopyButton({ value, label = 'Copy', className }: { value: string; label?: string; className?: string }) {
    const { copied, copy } = useCopy();
    return (
        <button
            type="button"
            onClick={() => void copy(value)}
            aria-label={copied ? 'Copied' : label}
            className={cn(
                'inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground',
                className
            )}
        >
            {copied ? <Check className="size-4 text-success" /> : <Copy className="size-4" />}
            <span aria-live="polite" className="sr-only">
                {copied ? 'Copied' : ''}
            </span>
        </button>
    );
}

/** A long identifier shown as head…tail in mono, with copy. The full value is
 *  the title and the copied text, never lost to the truncation. */
export function HashChip({
    value,
    head = 8,
    tail = 6,
    copy = true,
    href,
    className,
}: {
    value: string;
    head?: number;
    tail?: number;
    copy?: boolean;
    href?: string;
    className?: string;
}) {
    const shown = middle(value, head, tail);
    const text = (
        <span title={value} className="font-mono text-[0.875rem]">
            {shown}
        </span>
    );
    return (
        <span className={cn('inline-flex max-w-full items-center gap-1', className)}>
            {href ? (
                <a href={href} className="underline decoration-border underline-offset-4 hover:decoration-foreground">
                    {text}
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
                        <div className="flex min-w-0 flex-col gap-0.5">
                            <span className="truncate text-[0.9375rem]">{it.title}</span>
                            {it.meta ? <span className="truncate text-[0.8125rem] text-muted-foreground">{it.meta}</span> : null}
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
