import type { ReactNode } from 'react';

import { cn } from '../tokens/cn';

export type StatusTone = 'success' | 'warning' | 'destructive' | 'muted' | 'primary' | 'info';

/**
 * - `plain` (default): borderless, lowercase, tone-coloured text + optional icon.
 * - `bordered`: a bordered, uppercase badge (`border-{tone}/40 text-{tone}`) —
 *   the variant fleet's PledgeStatusPill, www's StateBadge, and me's
 *   compliance/severity pills all hand-roll.
 */
export type StatusPillVariant = 'plain' | 'bordered';

export interface StatusPillProps {
    /** Status label (rendered lowercase in `plain`, uppercase in `bordered`). */
    label: string;
    tone?: StatusTone;
    variant?: StatusPillVariant;
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

const BORDER_TONE: Record<StatusTone, string> = {
    success: 'border-success/40 text-success',
    warning: 'border-warning/40 text-warning',
    destructive: 'border-destructive/40 text-destructive',
    muted: 'border-muted-foreground/40 text-muted-foreground',
    primary: 'border-primary/40 text-primary',
    info: 'border-info/40 text-info',
};

/**
 * Generic state pill — the canonical form of the per-domain status pills that
 * fleet (agent/pledge/event), me (compliance/severity), and others reimplement.
 * Apps map their domain status → { tone, label, icon }; this renders it
 * consistently. Two variants: `plain` (borderless lowercase) and `bordered`
 * (uppercase badge with a tone-tinted border).
 */
export function StatusPill({
    label,
    tone = 'muted',
    variant = 'plain',
    icon,
    className,
}: StatusPillProps) {
    if (variant === 'bordered') {
        return (
            <span
                className={cn(
                    'inline-flex items-center gap-1.5 border px-1.5 py-0.5 font-mono text-[9px] tracking-widest uppercase',
                    BORDER_TONE[tone],
                    className
                )}
            >
                {icon}
                {label}
            </span>
        );
    }
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

/** One status → presentation entry. `label` defaults to the status key. */
export interface StatusPillSpec {
    tone: StatusTone;
    label?: string;
    icon?: ReactNode;
}

/**
 * makeStatusPill — build a domain-specific status pill from a status→spec map.
 * This is the ergonomic that fleet (AgentStatus, PledgeStatus), www
 * (StateBadge severity), and me (compliance/severity) each hand-roll. Instead
 * of re-deriving tone-class logic per site, declare the map once:
 *
 *   const AgentStatusPill = makeStatusPill({
 *       online:  { tone: 'success' },
 *       offline: { tone: 'destructive', label: 'down' },
 *       pending: { tone: 'warning' },
 *   });
 *   <AgentStatusPill status={agent.status} />
 *
 * Pass `{ variant: 'bordered' }` for the uppercase-badge form (fleet pledge
 * states, www state badges, me compliance/severity).
 */
export function makeStatusPill<S extends string>(
    map: Record<S, StatusPillSpec>,
    options?: { variant?: StatusPillVariant; fallbackTone?: StatusTone }
): (props: { status: S; className?: string }) => ReactNode {
    const variant = options?.variant ?? 'plain';
    const fallbackTone = options?.fallbackTone ?? 'muted';
    function DomainStatusPill({ status, className }: { status: S; className?: string }) {
        const spec = map[status];
        return (
            <StatusPill
                tone={spec?.tone ?? fallbackTone}
                label={spec?.label ?? status}
                icon={spec?.icon}
                variant={variant}
                className={className}
            />
        );
    }
    return DomainStatusPill;
}
