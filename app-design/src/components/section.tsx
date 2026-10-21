import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

import { cn } from '../lib/cn';
import { Reveal } from './motion';

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
            // The band line is transparent in light; in dark it keeps the ink
            // band from melting into the canvas.
            ink: 'border-y border-[var(--oca-band-line)] bg-oca-ink text-oca-ink-foreground',
            // Focus is drawn in the band's own ink: orange on orange was 1.2:1.
            brand: 'bg-brand text-brand-foreground [--ring:var(--brand-foreground)]',
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

/**
 * Eyebrow + headline + lead, the opening of every deck slide. It rises into
 * place the first time it scrolls into view (`reveal={false}` to keep it still).
 */
export function SectionIntro({
    className,
    align = 'start',
    reveal = true,
    children,
    style,
}: Pick<HTMLAttributes<HTMLDivElement>, 'className' | 'style' | 'children'> & {
    align?: 'start' | 'center';
    reveal?: boolean;
}) {
    const cls = cn('flex flex-col gap-4 md:gap-5', align === 'center' && 'mx-auto items-center text-center', className);
    return reveal ? (
        <Reveal className={cls} style={style}>
            {children}
        </Reveal>
    ) : (
        <div className={cls} style={style}>
            {children}
        </div>
    );
}
