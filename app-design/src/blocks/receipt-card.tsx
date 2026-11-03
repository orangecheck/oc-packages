import type { ReactNode } from 'react';

import { MonoLabel } from '../components/frame';
import { cn } from '../lib/cn';

/*
 * A receipt: mono rows with their amounts lined up on the decimal point, the
 * split of the total as one bar, and a place for the action that checks it.
 * The rows are the caller's; the example rows in the story add up (240 =
 * 192 + 48, 80/20). It is drawn on the product surface in the surface's own
 * colours, so it reads the same on paper and inside an ink or burnt band.
 */

export interface ReceiptRow {
    label: ReactNode;
    /** A number, or the caller's own text ("+12", "0.5"). */
    amount: number | string;
    note?: ReactNode;
}

export interface ReceiptSplit {
    pct: number;
    label: ReactNode;
}

export interface ReceiptCardProps {
    label?: ReactNode;
    title?: ReactNode;
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

// The surface's quiet text: its ink at 70%, 6.8:1 on white and 7.7:1 on the dark surface.
const QUIET = 'text-oca-surface-foreground/70';

const text = (a: number | string) => (typeof a === 'number' ? a.toLocaleString('en-US', { maximumFractionDigits: 8 }) : a);

export function ReceiptCard({ label, title, rows, unit, caption, split, footer, action, className }: ReceiptCardProps) {
    const parts = rows.map((r) => {
        const t = text(r.amount);
        const dot = t.indexOf('.');
        return dot < 0 ? [t, ''] : [t.slice(0, dot), t.slice(dot)];
    });
    // Every fraction gets the widest one's room, so the points stack.
    const frac = Math.max(0, ...parts.map(([, f]) => f!.length));
    return (
        <div className={cn('flex flex-col gap-6 border border-oca-surface-foreground/10 bg-oca-surface p-6 text-oca-surface-foreground md:p-8', className)}>
            {label || title ? (
                <div className="flex flex-col gap-3">
                    {label ? <MonoLabel as="span" className={QUIET}>{label}</MonoLabel> : null}
                    {title ? <span className="text-[1.375rem] leading-[1.2] tracking-[-0.015em] md:text-[1.625rem]">{title}</span> : null}
                </div>
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
                                <span>{parts[i]![0]}</span>
                                {frac ? (
                                    <span className="inline-block text-left" style={{ minWidth: `${frac}ch` }}>
                                        {parts[i]![1]}
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
                                <dt className="oca-tabular text-oca-surface-foreground">{s.pct}%</dt>
                                <dd>{s.label}</dd>
                            </div>
                        ))}
                    </dl>
                </figure>
            ) : null}
            {footer || action ? (
                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-oca-surface-foreground/10 pt-4">
                    {footer ? <span className={cn('font-mono text-[0.75rem]', QUIET)}>{footer}</span> : <span />}
                    {action}
                </div>
            ) : null}
        </div>
    );
}
