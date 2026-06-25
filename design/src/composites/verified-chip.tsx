import type { ReactNode } from 'react';

import { Check } from 'lucide-react';

import { IconBadge, Surface } from '../primitives';
import { cn } from '../tokens/cn';

export interface VerifiedChipProps {
    /** Leading glyph; defaults to a lucide Check. */
    icon?: ReactNode;
    /** Tone of the icon tile. */
    iconTone?: 'peach' | 'dark' | 'brand' | 'onBrand' | 'muted';
    /** Short trust phrase, e.g. "verified on bitcoin". */
    label: ReactNode;
    className?: string;
}

/**
 * VerifiedChip — a small floating trust chip (icon tile + short label) on a soft
 * elevated pill. drop it over a hero or card edge to mark something as verified.
 */
export function VerifiedChip({ icon, iconTone = 'peach', label, className }: VerifiedChipProps) {
    return (
        <Surface
            elevation="lg"
            pad="none"
            className={cn('inline-flex items-center gap-3 rounded-full px-3 py-2', className)}
        >
            <IconBadge tone={iconTone} size="sm">
                {icon ?? <Check />}
            </IconBadge>
            <span className="pr-2 text-sm font-semibold text-foreground">{label}</span>
        </Surface>
    );
}
