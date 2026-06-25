import type { VariantProps } from 'class-variance-authority';

import { Slot } from '@radix-ui/react-slot';
import { cva } from 'class-variance-authority';
import * as React from 'react';

import { cn } from '../tokens/cn';

const badgeVariants = cva(
    'focus-visible:border-ring focus-visible:ring-ring/50 inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-md border px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:ring-[3px] [&>svg]:pointer-events-none [&>svg]:size-3',
    {
        variants: {
            variant: {
                default:
                    'bg-primary text-primary-foreground [a&]:hover:bg-primary/90 border-transparent',
                secondary:
                    'bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90 border-transparent',
                destructive:
                    'bg-destructive text-destructive-foreground [a&]:hover:bg-destructive/90 border-transparent',
                warning:
                    'bg-warning text-warning-foreground [a&]:hover:bg-warning/90 border-transparent',
                success:
                    'bg-success text-success-foreground [a&]:hover:bg-success/90 border-transparent',
                info: 'bg-info text-info-foreground [a&]:hover:bg-info/90 border-transparent',
                brand: 'bg-brand-soft text-accent-foreground border-transparent',
                neutral:
                    'bg-foreground text-background [a&]:hover:bg-foreground/90 border-transparent',
                outline: 'text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground',
            },
        },
        defaultVariants: { variant: 'default' },
    }
);

function Badge({
    className,
    variant,
    asChild = false,
    ...props
}: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
    const Comp = asChild ? Slot : 'span';
    return (
        <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />
    );
}

export { Badge, badgeVariants };
