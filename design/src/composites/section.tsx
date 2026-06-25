import type { ReactNode } from 'react';

import { cn } from '../tokens/cn';

export interface SectionProps {
    /** Background band: neutral page, recessed gray, brand fill, or a forced-dark band on a light page. */
    tone?: 'default' | 'muted' | 'brand' | 'dark';
    /** Inner width: centered container, wide max-w-screen-2xl, or full-bleed. */
    width?: 'default' | 'wide' | 'full';
    /** Diagonal texture overlay; defaults on only for tone='brand'. */
    diagonal?: boolean;
    id?: string;
    className?: string;
    innerClassName?: string;
    children: ReactNode;
}

const TONE: Record<NonNullable<SectionProps['tone']>, string> = {
    default: 'bg-background text-foreground',
    muted: 'bg-muted text-foreground',
    brand: 'bg-brand text-brand-foreground',
    // `dark` activates the .dark variant locally so descendant package
    // components render their dark arm even on an otherwise light page.
    dark: 'dark bg-background text-foreground',
};

const WIDTH: Record<NonNullable<SectionProps['width']>, string> = {
    default: 'container',
    wide: 'mx-auto w-full max-w-screen-2xl px-4 sm:px-6 lg:px-8',
    full: '',
};

/**
 * Section — the full-bleed marketing band: a tone-routed background stripe with
 * vertical rhythm and a width-capped inner. Stack these to build a landing page;
 * use tone='dark' to force a dark band on a light page. BrandBand is the
 * brand-tone shorthand.
 */
export function Section({
    tone = 'default',
    width = 'default',
    diagonal,
    id,
    className,
    innerClassName,
    children,
}: SectionProps) {
    const showDiagonal = diagonal ?? tone === 'brand';
    return (
        <div
            id={id}
            className={cn('w-full', TONE[tone], showDiagonal && 'bg-diagonal', className)}
        >
            <div className={cn('py-16 sm:py-20 md:py-24', WIDTH[width], innerClassName)}>
                {children}
            </div>
        </div>
    );
}

/** BrandBand — Section pinned to the brand tone. */
export function BrandBand(props: SectionProps) {
    return <Section tone="brand" {...props} />;
}
