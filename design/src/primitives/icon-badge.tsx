import type { VariantProps } from 'class-variance-authority';

import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../tokens/cn';

const iconBadgeVariants = cva(
    'inline-flex shrink-0 items-center justify-center rounded-md font-semibold [&_svg]:pointer-events-none',
    {
        variants: {
            tone: {
                /* The signature peach tile — soft accent fill, terracotta glyph.
                   Auto-swaps to warm-dark + light-peach in dark mode via tokens. */
                peach: 'bg-accent text-accent-foreground',
                /* Inverted near-black tile, light glyph ("never do" promises). */
                dark: 'bg-foreground text-background',
                /* Solid brand tile. */
                brand: 'bg-primary text-primary-foreground',
                /* White tile on a brand band, terracotta glyph (numbered steps). */
                onBrand: 'bg-brand-foreground text-primary',
                /* Quiet neutral tile. */
                muted: 'bg-muted text-foreground',
            },
            size: {
                sm: 'size-9 text-xs [&_svg]:size-4',
                md: 'size-11 text-sm [&_svg]:size-5',
                lg: 'size-12 text-base [&_svg]:size-6',
                xl: 'size-14 text-lg [&_svg]:size-7',
            },
        },
        defaultVariants: { tone: 'peach', size: 'md' },
    }
);

export interface IconBadgeProps
    extends Omit<React.ComponentProps<'span'>, 'color'>,
        VariantProps<typeof iconBadgeVariants> {}

/**
 * IconBadge — a rounded-square tile holding a lucide icon OR a number/short
 * label. The theme's most-reused decorative atom (feature-card icons, numbered
 * steps, the verified chip). Distinct from the text `Badge` pill: this is a
 * fixed-size square tile. Tones map to skin tokens so the same markup recolours
 * across skins and light/dark (peach ↔ warm-dark).
 *
 *   <IconBadge tone="peach"><Lock /></IconBadge>
 *   <IconBadge tone="onBrand" size="sm">1</IconBadge>
 */
export function IconBadge({ className, tone, size, children, ...props }: IconBadgeProps) {
    return (
        <span
            data-slot="icon-badge"
            className={cn(iconBadgeVariants({ tone, size }), className)}
            {...props}
        >
            {children}
        </span>
    );
}

export { iconBadgeVariants };
