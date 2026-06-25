import type { VariantProps } from 'class-variance-authority';

import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../tokens/cn';

const surfaceVariants = cva('rounded-xl transition-colors', {
    variants: {
        tone: {
            /* Crisp panel floating on the page — the default soft card. */
            default: 'bg-card text-card-foreground',
            /* Warm-gray recessed panel. */
            muted: 'bg-muted text-foreground',
            /* Solid brand fill — small terracotta panel; inverts child text. */
            brand: 'bg-brand text-brand-foreground',
            /* High-contrast neutral panel (near-black in light, near-white in dark). */
            contrast: 'bg-foreground text-background',
            /* Translucent lightened tile for cards sitting ON a brand band. */
            onBrand:
                'text-brand-foreground [background:color-mix(in_oklch,white_16%,var(--brand))] [border-color:color-mix(in_oklch,white_24%,transparent)]',
            /* Frame only, transparent fill. */
            outline: 'bg-transparent text-foreground',
        },
        elevation: {
            none: 'shadow-none',
            sm: 'shadow-sm',
            md: 'shadow-md',
            lg: 'shadow-lg',
            xl: 'shadow-xl',
        },
        bordered: {
            true: 'border',
            false: '',
        },
        pad: {
            none: 'p-0',
            sm: 'p-4',
            md: 'p-5 sm:p-6',
            lg: 'p-6 sm:p-8',
        },
    },
    defaultVariants: {
        tone: 'default',
        elevation: 'sm',
        bordered: true,
        pad: 'md',
    },
});

export interface SurfaceProps
    extends Omit<React.ComponentProps<'div'>, 'color'>,
        VariantProps<typeof surfaceVariants> {}

/**
 * Surface — the soft, large-radius, elevated panel that the warm theme sits on.
 *
 * The package `Card` is a TERMINAL-window frame (mono title strip, terminal
 * dots) for dashboards; Surface is its plain marketing/consumer counterpart —
 * a bg-card panel with token-routed radius + soft elevation and no chrome.
 * Re-skins per skin via the radius + shadow tokens. Use this for feature cards,
 * sign-in cards, trust chips — anything that is NOT a terminal panel.
 */
export function Surface({
    className,
    tone,
    elevation,
    bordered,
    pad,
    ...props
}: SurfaceProps) {
    return (
        <div
            data-slot="surface"
            className={cn(surfaceVariants({ tone, elevation, bordered, pad }), className)}
            {...props}
        />
    );
}

export { surfaceVariants };
