import type { ReactNode } from 'react';

export interface SectionHeaderProps {
    /** Plain section name — rendered after a "§ " glyph in label-mono. */
    label: string;
    /** Optional right-side string (count, "most recent first"). */
    meta?: ReactNode;
    tone?: 'primary' | 'muted' | 'warning' | 'success' | 'destructive';
    className?: string;
}

const TONE_CLASS = {
    primary: 'text-primary',
    muted: 'text-muted-foreground',
    warning: 'text-warning',
    success: 'text-success',
    destructive: 'text-destructive',
} as const;

/**
 * SectionHeader — the canonical "§ x" section header used across every
 * /me, /vault, and /fleet dashboard surface. Lifted from oc-me-web's
 * `me/ui/SectionHeader` so the visual contract stays single-source.
 *
 * Pattern is `label-mono text-primary mb-3` with a "§ " glyph followed by
 * the label, plus an optional muted/uppercase right-side meta string.
 */
export function SectionHeader({
    label,
    meta,
    tone = 'primary',
    className = '',
}: SectionHeaderProps) {
    return (
        <div className={`mb-3 flex items-baseline justify-between gap-2 ${className}`}>
            <div className="flex items-center gap-1.5">
                <div className={`label-mono ${TONE_CLASS[tone]}`}>§ {label}</div>
            </div>
            {meta && (
                <span className="text-muted-foreground/70 font-mono text-[10px] tracking-widest uppercase">
                    {meta}
                </span>
            )}
        </div>
    );
}
