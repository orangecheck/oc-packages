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
 */
export function makeStatusPill<S extends string>(
    map: Record<S, StatusPillSpec>
): (props: { status: S; className?: string }) => ReactNode {
    function DomainStatusPill({ status, className }: { status: S; className?: string }) {
        const spec = map[status];
        return (
            <StatusPill
                tone={spec?.tone ?? 'muted'}
                label={spec?.label ?? status}
                icon={spec?.icon}
                className={className}
            />
        );
    }
    return DomainStatusPill;
}
