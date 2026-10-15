import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

import { cn } from '../lib/cn';

/*
 * The small white pill from the deck ("in testing", "on the path"). Three tones
 * carry meaning: neutral, the orange accent for attention, and red for a real
 * error. Text stays on the token that clears 4.5:1 against its tint.
 */
const GOOD_DOT =
    "border-border bg-card text-foreground before:size-1.5 before:shrink-0 before:rounded-full before:bg-success before:content-['']";

export const badgeVariants = cva(
    'inline-flex h-6 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 text-[0.8125rem] font-medium leading-none',
    {
        variants: {
            tone: {
                neutral: 'border-border bg-card text-foreground',
                muted: 'border-transparent bg-muted text-muted-foreground',
                brand: 'border-transparent bg-[color-mix(in_oklab,var(--oca-orange)_12%,var(--card))] text-oca-accent-ink',
                danger: 'border-transparent bg-[color-mix(in_oklab,var(--destructive)_12%,var(--card))] text-destructive',
                // A good state is a neutral pill with a green dot, not a green pill.
                success: GOOD_DOT,
                // Aliases kept so older call sites keep compiling: attention is
                // the brand accent, information is neutral.
                warning: 'border-transparent bg-[color-mix(in_oklab,var(--oca-orange)_12%,var(--card))] text-oca-accent-ink',
                info: 'border-border bg-card text-foreground',
                ink: 'border-transparent bg-oca-ink text-oca-ink-foreground',
                onInk: 'border-white/15 bg-white/5 text-white/90',
            },
        },
        defaultVariants: { tone: 'neutral' },
    }
);

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof badgeVariants> {}

export function Badge({ className, tone, ...props }: BadgeProps) {
    return <span data-ui="badge" className={cn(badgeVariants({ tone }), className)} {...props} />;
}

/** A pill with a live dot: where something stands right now ("In testing · payouts start after"). */
export function StatusPill({
    className,
    children,
    pulse = true,
    ...props
}: HTMLAttributes<HTMLSpanElement> & { pulse?: boolean }) {
    return (
        <span
            data-ui="status-pill"
            className={cn(
                'inline-flex min-h-8 w-fit items-center gap-2.5 rounded-full border border-border bg-card py-1 pl-3 pr-3.5 text-[0.875rem] leading-snug text-foreground',
                className
            )}
            {...props}
        >
            <span aria-hidden className="relative flex size-2 shrink-0">
                {pulse ? (
                    <span className="absolute inset-0 rounded-full bg-oca-orange opacity-50 motion-safe:animate-ping" />
                ) : null}
                <span className="relative size-2 rounded-full bg-oca-orange" />
            </span>
            {children}
        </span>
    );
}
