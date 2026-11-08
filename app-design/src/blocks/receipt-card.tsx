import type { HTMLAttributes, ReactNode } from 'react';

import { MonoLabel } from '../components/frame';
import { cn } from '../lib/cn';

/*
 * A receipt: a few facts (when, paid to, pricing), mono rows with their
 * amounts lined up on the decimal point, the split of the total as one bar,
 * and a place for the action that checks it. The rows are the caller's; the
 * example rows in the story add up (240 = 192 + 48, 80/20). It is drawn on
 * the product surface in the surface's own colours, a depiction, so it reads
 * the same on paper and on every band.
 */

export interface ReceiptRow {
    label: ReactNode;
    /**
     * A number, the caller's own text ("+12", "0.5"), or any node (a struck
     * original beside the new amount). Numbers and text line up on their
     * point; a node lines up with the whole part.
     */
    amount: ReactNode;
    note?: ReactNode;
}

export interface ReceiptSplit {
    pct: number;
    label: ReactNode;
    /** What the share reads instead of its percentage, e.g. "192 sats". The bar is still drawn from `pct`. */
    value?: ReactNode;
}

export interface ReceiptFact {
    label: ReactNode;
    value: ReactNode;
}

export interface ReceiptCardProps extends Pick<HTMLAttributes<HTMLDivElement>, 'id' | 'role' | 'aria-label' | 'aria-labelledby'> {
    label?: ReactNode;
    title?: ReactNode;
    /** Above the rows, label and value: when, paid to, pricing. */
    facts?: ReceiptFact[];
    rows: ReceiptRow[];
    /** After every amount: "sats". */
    unit?: string;
    /** The rows' table name, for a screen reader. */
    caption?: string;
    /** The total's split, as one bar: the first share in orange. */
    split?: [ReceiptSplit, ReceiptSplit];
    footer?: ReactNode;
    /** What checks the receipt: a link or a button. */
    action?: ReactNode;
    className?: string;
}

// The surface's own secondary text: a band never re-points it (check-contrast holds it on the surface and the card).
const QUIET = 'text-oca-surface-muted';

/** A number or text split at its point, so the points stack; any other node stands whole. */
function parts(a: ReactNode): [ReactNode, string] {
    if (typeof a !== 'number' && typeof a !== 'string') return [a, ''];
    const t = typeof a === 'number' ? a.toLocaleString('en-US', { maximumFractionDigits: 8 }) : a;
    const dot = t.indexOf('.');
    return dot < 0 ? [t, ''] : [t.slice(0, dot), t.slice(dot)];
}

export function ReceiptCard({ label, title, facts, rows, unit, caption, split, footer, action, className, ...aria }: ReceiptCardProps) {
    const amounts = rows.map((r) => parts(r.amount));
    // Every fraction gets the widest one's room, so the points stack.
    const frac = Math.max(0, ...amounts.map(([, f]) => f.length));
    return (
        <div {...aria} data-oca-depict="" className={cn('flex flex-col gap-6 border border-oca-surface-foreground/10 bg-oca-surface p-6 text-oca-surface-foreground md:p-8', className)}>
            {label || title ? (
                <div className="flex flex-col gap-3">
                    {label ? <MonoLabel as="span" className={QUIET}>{label}</MonoLabel> : null}
                    {title ? <span className="text-[1.375rem] leading-[1.2] tracking-[-0.015em] md:text-[1.625rem]">{title}</span> : null}
                </div>
            ) : null}
            {facts && facts.length > 0 ? (
                <dl data-facts="" className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-6 gap-y-1.5 font-mono text-[0.75rem]">
                    {facts.map((f, i) => (
                        <div key={i} className="contents">
                            <dt className={QUIET}>{f.label}</dt>
                            <dd className="min-w-0 break-words">{f.value}</dd>
                        </div>
                    ))}
                </dl>
            ) : null}
            <table className="w-full border-collapse font-mono text-[0.875rem]">
                {caption ? <caption className="sr-only">{caption}</caption> : null}
                <tbody>
                    {rows.map((r, i) => (
                        <tr key={i} className="border-t border-oca-surface-foreground/10 first:border-t-0">
                            <th scope="row" className={cn('py-2.5 pr-4 text-left align-baseline font-normal', QUIET)}>
                                {r.label}
                                {r.note ? <span className="block pt-0.5 font-sans text-[0.8125rem]">{r.note}</span> : null}
                            </th>
                            <td className="whitespace-nowrap py-2.5 text-right align-baseline oca-tabular">
                                <span>{amounts[i]![0]}</span>
                                {frac ? (
                                    <span className="inline-block text-left" style={{ minWidth: `${frac}ch` }}>
                                        {amounts[i]![1]}
                                    </span>
                                ) : null}
                                {unit ? <span className={QUIET}> {unit}</span> : null}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
            {split ? (
                <figure className="flex flex-col gap-2.5">
                    <div aria-hidden className="flex h-2 w-full gap-0.5">
                        <span className="bg-oca-orange-deep" style={{ flexBasis: `${split[0].pct}%` }} />
                        <span className="bg-oca-surface-foreground" style={{ flexBasis: `${split[1].pct}%` }} />
                    </div>
                    <dl className={cn('flex flex-wrap justify-between gap-x-6 gap-y-1 font-mono text-[0.75rem]', QUIET)}>
                        {split.map((s, i) => (
                            <div key={i} className="flex items-center gap-2">
                                <span aria-hidden className={cn('size-[7px]', i === 0 ? 'bg-oca-orange-deep' : 'bg-oca-surface-foreground')} />
                                <dt className="oca-tabular text-oca-surface-foreground">{s.value ?? `${s.pct}%`}</dt>
                                <dd>{s.label}</dd>
                            </div>
                        ))}
                    </dl>
                </figure>
            ) : null}
            {footer || action ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-oca-surface-foreground/10 pt-4">
                    {footer ? <span className={cn('font-mono text-[0.75rem] text-pretty', QUIET)}>{footer}</span> : <span />}
                    {action}
                </div>
            ) : null}
        </div>
    );
}
