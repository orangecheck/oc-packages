import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

/*
 * "What's true today." A two-column table: a status and what it covers. The
 * design's note on the slide is the brief for this component: say it plainly; being
 * clear about what isn't done yet is part of the pitch. So the statuses are
 * fixed words, never icons, and a row cannot be written without one.
 */
export type TruthStatus = 'yes' | 'testing' | 'not-yet' | 'no';

const LABEL: Record<TruthStatus, string> = {
    yes: 'Yes',
    testing: 'In testing',
    'not-yet': 'Not yet',
    no: 'No',
};

const TONE: Record<TruthStatus, string> = {
    yes: 'text-oca-accent-ink',
    testing: 'text-foreground',
    'not-yet': 'text-muted-foreground',
    no: 'text-muted-foreground',
};

export interface TruthRow {
    status: TruthStatus;
    what: ReactNode;
}

export function TruthTable({
    rows,
    statusHeading = 'Status',
    whatHeading = 'What',
    className,
}: {
    rows: TruthRow[];
    statusHeading?: string;
    whatHeading?: string;
    className?: string;
}) {
    return (
        <>
            {/* Under 640px a two-column table squeezes the text to a few words a
                line, so each row becomes a status over its sentence. */}
            <ul
                className={cn(
                    'divide-y divide-oca-hairline-strong overflow-hidden rounded-xl border border-oca-hairline-strong bg-card sm:hidden',
                    className
                )}
            >
                {rows.map((r, i) => (
                    <li key={i} className="flex flex-col gap-1.5 px-4 py-3.5">
                        <span className={cn('text-[0.875rem] font-medium', TONE[r.status])}>{LABEL[r.status]}</span>
                        <span className="text-[0.9375rem] leading-relaxed">{r.what}</span>
                    </li>
                ))}
            </ul>
            <div className={cn('overflow-hidden rounded-xl border border-oca-hairline-strong max-sm:hidden', className)}>
                <table className="w-full border-collapse text-left text-[0.9375rem] md:text-[1rem]">
                    <thead className="bg-oca-table-head">
                        <tr>
                            <th scope="col" className="w-[30%] border-b border-oca-hairline-strong px-4 py-3 font-semibold md:w-[22%]">
                                {statusHeading}
                            </th>
                            <th scope="col" className="border-b border-l border-oca-hairline-strong px-4 py-3 font-semibold">
                                {whatHeading}
                            </th>
                        </tr>
                    </thead>
                    <tbody className="bg-card">
                        {rows.map((r, i) => (
                            <tr key={i} className="align-top">
                                <td
                                    className={cn(
                                        'border-t border-oca-hairline-strong px-4 py-3 font-medium',
                                        i === 0 && 'border-t-0',
                                        TONE[r.status]
                                    )}
                                >
                                    {LABEL[r.status]}
                                </td>
                                <td
                                    className={cn(
                                        'border-l border-t border-oca-hairline-strong px-4 py-3 leading-relaxed',
                                        i === 0 && 'border-t-0'
                                    )}
                                >
                                    {r.what}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </>
    );
}
