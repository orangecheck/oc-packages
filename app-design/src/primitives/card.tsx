import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type HTMLAttributes } from 'react';

import { cn } from '../lib/cn';
import type { HeadingTag } from '../lib/heading';

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
        // The padding is also a variable, so a flush list can run back out to the edges.
        padding: {
            none: '[--oca-card-pad:0rem]',
            sm: 'p-5 [--oca-card-pad:1.25rem]',
            md: 'p-6 [--oca-card-pad:1.5rem] md:p-8 md:[--oca-card-pad:2rem]',
            lg: 'p-8 [--oca-card-pad:2rem] md:p-10 md:[--oca-card-pad:2.5rem]',
        },
        /*
         * A list inside the card (a ListCard) runs to its edges rather than
         * sitting in it as a card in a card: its hairlines span the card, its
         * rows line up with the card's own text, and as the first or last part
         * it takes the card's padding there.
         */
        flush: {
            true: [
                'overflow-clip',
                '[&>[data-oca-list]]:-mx-[var(--oca-card-pad)] [&>[data-oca-list]]:rounded-none [&>[data-oca-list]]:border-x-0 [&>[data-oca-list]]:bg-transparent',
                '[&>[data-oca-list]:first-child]:-mt-[var(--oca-card-pad)] [&>[data-oca-list]:first-child]:border-t-0',
                '[&>[data-oca-list]:last-child]:-mb-[var(--oca-card-pad)] [&>[data-oca-list]:last-child]:border-b-0',
                '[&>[data-oca-list]>li:not([data-size=lg])>*]:px-[var(--oca-card-pad)]',
            ].join(' '),
            false: '',
        },
        interactive: {
            true: 'transition-colors hover:border-oca-hairline-strong focus-within:border-oca-hairline-strong',
            false: '',
        },
    },
    defaultVariants: { tone: 'default', padding: 'md', interactive: false, flush: false },
});

export interface CardProps extends HTMLAttributes<HTMLDivElement>, VariantProps<typeof cardVariants> {}

export const Card = forwardRef<HTMLDivElement, CardProps>(function Card(
    { className, tone, padding, interactive, flush, ...props },
    ref
) {
    return (
        <div ref={ref} data-ui="card" className={cn(cardVariants({ tone, padding, interactive, flush }), className)} {...props} />
    );
});

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('flex flex-col gap-2', className)} {...props} />;
}

/** The small "01" above a card title. */
export function CardNumeral({ className, ...props }: HTMLAttributes<HTMLSpanElement>) {
    return <span className={cn('oca-numeral block', className)} {...props} />;
}

export function CardTitle({ className, as: Tag = 'h3', ...props }: HTMLAttributes<HTMLHeadingElement> & { as?: HeadingTag }) {
    return <Tag className={cn('oca-title flex flex-wrap items-center gap-2.5', className)} {...props} />;
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
