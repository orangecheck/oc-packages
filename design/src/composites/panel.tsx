import type { ReactNode } from 'react';

import { cn } from '../tokens/cn';

export interface PanelProps {
    /** Mono kicker shown above the title (e.g. "attestations"). Rendered uppercase. */
    label?: ReactNode;
    /** Section title. */
    title?: ReactNode;
    /** Optional trailing control (a button, link, count) pinned right of the header. */
    action?: ReactNode;
    /** Drop the top divider (use for the first panel in a stack). */
    flush?: boolean;
    className?: string;
    children?: ReactNode;
}

/**
 * Panel (DataSection) — the titled section that carries a chunk of a
 * data-dense / technical page (telemetry blocks, API sections, dashboard
 * groups). THEME-ADAPTIVE by design: under the cypherpunk skins it is a
 * flat full-width `border-t` divider section (terminal voice); under ember
 * the `.oc-panel` class promotes it to a discrete soft, warm, rounded card
 * (see the data-dense treatments in themes/ember.css). Compose these instead
 * of hand-rolling `border-t py-8` sections so subpages re-skin per theme.
 */
export function Panel({ label, title, action, flush, className, children }: PanelProps) {
    const hasHeader = label || title || action;
    return (
        <section className={cn('oc-panel py-8', !flush && 'border-t', className)}>
            {hasHeader && (
                <div className="mb-4 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        {label && <div className="label-mono text-primary mb-1">{label}</div>}
                        {title && (
                            <h2 className="font-display text-lg font-bold tracking-tight">{title}</h2>
                        )}
                    </div>
                    {action && <div className="shrink-0">{action}</div>}
                </div>
            )}
            {children}
        </section>
    );
}
