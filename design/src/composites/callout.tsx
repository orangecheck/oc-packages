import type { ReactNode } from 'react';

import { cn } from '../tokens/cn';

export type CalloutTone = 'info' | 'warning' | 'destructive' | 'success' | 'muted';

export interface CalloutProps {
    tone?: CalloutTone;
    /** Optional "§ "-prefixed mono header. */
    label?: string;
    /** Optional leading icon, sized by the caller (e.g. lucide `size-4`). */
    icon?: ReactNode;
    /** Body content. */
    children: ReactNode;
    /** Optional trailing action (button / link) pinned to the bottom. */
    action?: ReactNode;
    className?: string;
}

const FRAME: Record<CalloutTone, string> = {
    info: 'border-primary/30 bg-primary/5',
    warning: 'border-warning/40 bg-warning/5',
    destructive: 'border-destructive/40 bg-destructive/5',
    success: 'border-success/40 bg-success/5',
    muted: 'border-border bg-muted/20',
};

const LABEL: Record<CalloutTone, string> = {
    info: 'text-primary',
    warning: 'text-warning',
    destructive: 'text-destructive',
    success: 'text-success',
    muted: 'text-muted-foreground',
};

/**
 * Callout — the canonical toned panel (`border-{tone}/40 bg-{tone}/5` + an
 * optional `label-mono` header) reimplemented across stamp, pledge, vote,
 * analytics, and me (HealthBanner / SimulationBanner / FrozenBanner /
 * DangerZone, etc.). One component, five tones. For empty-states with CTAs use
 * EmptyState; for inline term help use HelpHint; this is the general
 * notice/banner frame.
 */
export function Callout({ tone = 'info', label, icon, children, action, className }: CalloutProps) {
    return (
        <div className={cn('border p-4 md:p-5', FRAME[tone], className)}>
            {label && (
                <div className={cn('label-mono mb-2 flex items-center gap-1.5', LABEL[tone])}>
                    {icon}
                    <span>§ {label}</span>
                </div>
            )}
            <div className="text-foreground/85 text-sm leading-relaxed">
                {!label && icon ? (
                    <span className={cn('mr-2 inline-flex align-middle', LABEL[tone])}>{icon}</span>
                ) : null}
                {children}
            </div>
            {action && <div className="mt-3 flex flex-wrap gap-3">{action}</div>}
        </div>
    );
}
