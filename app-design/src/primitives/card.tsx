import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '../lib/cn';

/*
 * White on the canvas with one hairline and a generous radius; no shadow. The
 * `ink` card is the deck's #1E1E1E panel, dark in both modes.
 */
export const cardVariants = cva('relative rounded-[1.25rem] border', {
    variants: {
        tone: {
            default: 'border-border bg-card text-card-foreground',
            sunken: 'border-transparent bg-muted text-foreground',
            ink: 'border-oca-ink-line bg-oca-ink-card text-oca-ink-foreground',
            outline: 'border-border bg-transparent text-foreground',
        },
        padding: {
            none: '',
            sm: 'p-5',
            md: 'p-6 md:p-8',
            lg: 'p-8 md:p-10',
        },
        interactive: {
            true: 'transition-colors hover:border-oca-hairline-strong focus-within:border-oca-hairline-strong',
            false: '',
        },
    },
    defaultVariants: { tone: 'default', padding: 'md', interactive: false },
});

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
    { className, tone, padding, interactive, ...props },
    ref
) {
    return (
        <div ref={ref} data-ui="card" className={cn(cardVariants({ tone, padding, interactive }), className)} {...props} />
    );
});

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('flex flex-col gap-2', className)} {...props} />;
}

/** The small "01" above a card title. */
export function CardNumeral({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
    return <span className={cn('oca-numeral block', className)} {...props} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
    return <h3 className={cn('oca-title flex flex-wrap items-center gap-2.5', className)} {...props} />;
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
    return <p className={cn('oca-body', className)} {...props} />;
}

export function CardContent({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('mt-5', className)} {...props} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('mt-6 flex flex-wrap items-center gap-3', className)} {...props} />;
}
