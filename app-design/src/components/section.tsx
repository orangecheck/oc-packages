import { cva, type VariantProps } from 'class-variance-authority';
import type { HTMLAttributes } from 'react';

import { cn } from '../lib/cn';
import { Frame } from './frame';
import { Reveal } from './motion';

/*
 * The page alternates grounds: paper, the ink band, the burnt band and the
 * orange band. A section owns its ground edge to edge and its content sits in
 * the container. A band also re-points the text, hairline and accent tokens,
 * so a MonoLabel, a StatRow or a lead inside it reads in the band's own colours.
 * On the orange band text is ink, never white (2.80:1).
 */
// overflow-x: clip, not hidden: decoration may not widen the page, and a sticky
// child still sticks.
// The bands are theme.css utilities (oca-band-*), so any element can be one.
// A section's vertical space. A framed section puts it inside its Frame, so the Frame's hairlines
// run the section's full height and meet the next section's.
const SPACE = { none: '', sm: 'py-12 md:py-16', md: 'oca-section', lg: 'py-24 md:py-40' } as const;

export const sectionVariants = cva('relative w-full overflow-x-clip', {
    variants: {
        tone: {
            canvas: 'bg-background text-foreground',
            card: 'bg-card text-card-foreground',
            // The band line is transparent in light; in dark it keeps the ink
            // band from melting into the canvas.
            ink: 'oca-band-ink border-y border-[var(--oca-band-line)]',
            // The dark brown stage: paper text, orange and ember.
            burnt: 'oca-band-burnt',
            // Focus is drawn in the band's own ink: orange on orange was 1.2:1.
            brand: 'oca-band-brand',
        },
        /** A full-width hairline under the section, as 2.0 rules one section from the next. */
        // The closing hairline runs between the frame's rules, not the viewport's edges.
        rule: {
            true: 'after:pointer-events-none after:absolute after:bottom-0 after:h-px after:bg-border after:inset-x-[calc(max(0px,(100%-var(--oca-frame-max))/2)+var(--oca-frame-rule))]',
            false: '',
        },
        space: SPACE,
    },
    defaultVariants: { tone: 'canvas', space: 'md', rule: false },
});

export interface SectionProps extends HTMLAttributes<HTMLElement>, VariantProps<typeof sectionVariants> {
    /** Put children in the standard container. Default true. */
    contained?: boolean;
    /**
     * Put children in 2.0's Frame instead: the 82.5rem column with the page's gutter and a hairline
     * at each edge from 900px, so the section lines up with the header and the footer.
     */
    framed?: boolean;
    /** With `framed`: classes for the Frame, which also holds the section's `space`. */
    frameClassName?: string;
}

export function Section({ tone, space, rule, contained = true, framed = false, frameClassName, className, children, ...props }: SectionProps) {
    if (framed) {
        return (
            // A closed box between its hairlines: nothing inside paints across them, a depiction's shadow
            // included. overflow: clip on both axes, so a sticky child still sticks.
            <section className={cn(sectionVariants({ tone, space: 'none', rule }), 'overflow-clip [overflow-clip-margin:var(--oca-focus-reach)]', className)} {...props}>
                <Frame className={cn(SPACE[space ?? 'md'], frameClassName)}>{children}</Frame>
            </section>
        );
    }
    return (
        <section className={cn(sectionVariants({ tone, space, rule }), className)} {...props}>
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
