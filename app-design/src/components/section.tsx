import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

import { cn } from '../lib/cn';

/*
 * The deck alternates three grounds: the light canvas, the ink band and the
 * orange band. A section owns its ground edge to edge and its content sits in
 * the container. On the orange band text is ink, never white (2.9:1).
 */
// overflow-x: clip, not hidden: decoration may not widen the page, and a sticky
// child still sticks.
export const sectionVariants = cva('relative w-full overflow-x-clip', {
    variants: {
        tone: {
            canvas: 'bg-background text-foreground',
            card: 'bg-card text-card-foreground',
            ink: 'bg-oca-ink text-oca-ink-foreground',
            brand: 'bg-brand text-brand-foreground',
        },
        space: {
            none: '',
            sm: 'py-12 md:py-16',
            md: 'oca-section',
            lg: 'py-24 md:py-40',
        },
    },
    defaultVariants: { tone: 'canvas', space: 'md' },
});

export interface SectionProps extends HTMLAttributes<HTMLElement>, VariantProps<typeof sectionVariants> {
    /** Put children in the standard container. Default true. */
    contained?: boolean;
}

export function Section({ tone, space, contained = true, className, children, ...props }: SectionProps) {
    return (
        <section className={cn(sectionVariants({ tone, space }), className)} {...props}>
            {contained ? <div className="oca-container">{children}</div> : children}
        </section>
    );
}

export function Container({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('oca-container', className)} {...props} />;
}

/** Eyebrow + headline + lead, the opening of every deck slide. */
export function SectionIntro({
    className,
    align = 'start',
    ...props
}: HTMLAttributes<HTMLDivElement> & { align?: 'start' | 'center' }) {
    return (
        <div
            className={cn(
                'flex flex-col gap-4 md:gap-5',
                align === 'center' && 'mx-auto items-center text-center',
                className
            )}
            {...props}
        />
    );
}
