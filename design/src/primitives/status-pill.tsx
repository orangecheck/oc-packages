import type { ReactNode } from 'react';

import { cn } from '../tokens/cn';

export type StatusTone = 'success' | 'warning' | 'destructive' | 'muted' | 'primary' | 'info';

export interface StatusPillProps {
    /** Short lowercase status label (e.g. "active", "broken", "pending"). */
    label: string;
    tone?: StatusTone;
    /** Optional leading icon (e.g. a lucide icon sized size-3). */
    icon?: ReactNode;
    className?: string;
}

const TONE: Record<StatusTone, string> = {
    success: 'text-success',
    warning: 'text-warning',
    destructive: 'text-destructive',
    muted: 'text-muted-foreground',
    primary: 'text-primary',
    info: 'text-info',
};

/**
 * Generic state pill — the canonical form of the per-domain status pills that
 * fleet (agent/pledge/event), me (compliance/severity), and others reimplement.
 * Apps map their domain status → { tone, label, icon }; this renders it
 * consistently (mono, lowercase, tone-coloured).
 */
export function StatusPill({ label, tone = 'muted', icon, className }: StatusPillProps) {
    return (
        <span
            className={cn(
                'inline-flex items-center gap-1.5 font-mono text-[11px] tracking-wider lowercase',
                TONE[tone],
                className
            )}
        >
            {icon}
            {label}
        </span>
    );
}
