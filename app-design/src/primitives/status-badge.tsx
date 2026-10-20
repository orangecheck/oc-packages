import type { HTMLAttributes } from 'react';

import type { SiteStatus } from '../family';
import { cn } from '../lib/cn';
import { Badge } from './badge';

/*
 * Where something stands, in the family's fixed words. A site or feature is
 * live, in testing, not yet, or paused; a check on an artifact is good,
 * caution or refused. There is no free text: the words are the component, so
 * no page can invent "LIVE · MAINNET", "BETA" or "PRO" again.
 */
export type Statement = 'good' | 'caution' | 'refused';
export type Status = SiteStatus | Statement;

const WORD: Record<Status, string> = {
    live: 'Live',
    testing: 'In testing',
    'not-yet': 'Not yet',
    paused: 'Paused',
    good: 'Good',
    caution: 'Caution',
    refused: 'Refused',
};

const TONE = {
    live: 'success',
    testing: 'brand',
    'not-yet': 'muted',
    paused: 'muted',
    good: 'success',
    caution: 'brand',
    refused: 'danger',
} as const;

/** The word for a status, for places that need it as text. */
export function statusWord(status: Status): string {
    return WORD[status];
}

export interface StatusBadgeProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'> {
    status: Status;
}

export function StatusBadge({ status, className, ...props }: StatusBadgeProps) {
    return (
        <Badge tone={TONE[status]} data-status={status} className={cn(className)} {...props}>
            {WORD[status]}
        </Badge>
    );
}
