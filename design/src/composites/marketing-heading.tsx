import type { ElementType, ReactNode } from 'react';

import { cn } from '../tokens/cn';

/**
 * marketing-heading — the two-tone display heading used across consumer
 * landing sections. TwoToneHeading renders a solid lead clause followed by a
 * recoloured muted clause at the same size/weight; MarketingHeading wraps it
 * with an optional mono eyebrow and body paragraph. Use onBrand when it sits
 * on a brand/dark band.
 */

export interface TwoToneHeadingProps {
    lead: ReactNode;
    muted?: ReactNode;
    as?: ElementType;
    tone?: 'default' | 'onBrand';
    className?: string;
}

export function TwoToneHeading({
    lead,
    muted,
    as,
    tone = 'default',
    className,
}: TwoToneHeadingProps) {
    const Tag = as ?? 'h2';
    const leadColor = tone === 'onBrand' ? 'text-primary-foreground' : 'text-foreground';
    // Lighter, cleaner muted clause so the two-tone contrast reads (matches the
    // designer's light-gray second phrase, not a heavy taupe).
    const mutedColor = tone === 'onBrand' ? 'text-primary-foreground/60' : 'text-foreground/40';
    return (
        <Tag
            className={cn(
                'font-extrabold tracking-[-0.02em] leading-[1.0] text-balance',
                'text-3xl sm:text-4xl md:text-5xl',
                leadColor,
                className,
            )}
        >
            <span>{lead}</span>
            {muted ? <span className={mutedColor}> {muted}</span> : null}
        </Tag>
    );
}

export interface MarketingHeadingProps {
    eyebrow?: string;
    lead: ReactNode;
    muted?: ReactNode;
    body?: ReactNode;
    align?: 'start' | 'center';
    tone?: 'default' | 'onBrand';
    as?: ElementType;
    className?: string;
}

export function MarketingHeading({
    eyebrow,
    lead,
    muted,
    body,
    align = 'start',
    tone = 'default',
    as,
    className,
}: MarketingHeadingProps) {
    const centered = align === 'center';
    return (
        <div className={cn('flex flex-col', centered && 'items-center text-center', className)}>
            {eyebrow && (
                <p
                    className={cn(
                        'label-mono mb-3',
                        tone === 'onBrand' ? 'text-primary-foreground/80' : 'text-primary',
                    )}
                >
                    {eyebrow}
                </p>
            )}
            <TwoToneHeading
                lead={lead}
                muted={muted}
                as={as}
                tone={tone}
                className={cn('max-w-4xl', centered && 'mx-auto')}
            />
            {body && (
                <p
                    className={cn(
                        'mt-4 max-w-2xl text-base sm:text-lg',
                        tone === 'onBrand' ? 'text-primary-foreground/80' : 'text-muted-foreground',
                        centered && 'mx-auto',
                    )}
                >
                    {body}
                </p>
            )}
        </div>
    );
}
