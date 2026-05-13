import Link from 'next/link';
import type { ReactNode } from 'react';

export interface EmptyStateCta {
    label: string;
    href: string;
    /** External links open in a new tab and get a ↗ glyph. */
    external?: boolean;
}

export interface EmptyStateProps {
    /** Short heading — one mono-uppercased label like "no entries yet". */
    label: string;
    /** Body — short prose explaining what would appear here and how. */
    children: ReactNode;
    cta?: EmptyStateCta;
    secondary?: EmptyStateCta;
    tone?: 'info' | 'warning' | 'muted';
    className?: string;
}

const TONE_CLASS = {
    info: 'border-primary/30 bg-primary/5',
    warning: 'border-warning/40 bg-warning/5',
    muted: 'border-border bg-muted/20',
} as const;

const LABEL_TONE_CLASS = {
    info: 'text-primary',
    warning: 'text-warning',
    muted: 'text-muted-foreground',
} as const;

/**
 * EmptyState — the canonical empty-state card used across every /me,
 * /vault, and /fleet dashboard. Empty states should *teach*: explain what
 * would appear, and how to make it appear. Lifted from oc-me-web's
 * `me/ui/EmptyState`.
 */
export function EmptyState({
    label,
    children,
    cta,
    secondary,
    tone = 'info',
    className = '',
}: EmptyStateProps) {
    return (
        <div className={`border p-5 md:p-6 ${TONE_CLASS[tone]} ${className}`}>
            <div className={`label-mono mb-2 ${LABEL_TONE_CLASS[tone]}`}>§ {label}</div>
            <div className="text-foreground/85 max-w-2xl text-sm leading-relaxed">{children}</div>
            {(cta || secondary) && (
                <div className="mt-4 flex flex-wrap gap-3">
                    {cta && <CtaLink {...cta} variant="primary" />}
                    {secondary && <CtaLink {...secondary} variant="secondary" />}
                </div>
            )}
        </div>
    );
}

function CtaLink({
    label,
    href,
    external,
    variant,
}: EmptyStateCta & { variant: 'primary' | 'secondary' }) {
    const cls =
        variant === 'primary'
            ? 'bg-primary text-primary-foreground hover:bg-primary/90 inline-flex h-9 items-center justify-center rounded-md px-4 font-mono text-[11px] font-semibold tracking-widest uppercase'
            : 'text-muted-foreground hover:text-foreground border-input hover:bg-accent inline-flex h-9 items-center justify-center rounded-md border px-4 font-mono text-[11px] tracking-widest uppercase';
    const text = external ? `${label} ↗` : label;
    if (external) {
        return (
            <a href={href} target="_blank" rel="noreferrer" className={cls}>
                {text}
            </a>
        );
    }
    return (
        <Link href={href} className={cls}>
            {text}
        </Link>
    );
}
