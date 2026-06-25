import type { ReactNode } from 'react';

import { IconBadge, Surface } from '../primitives';
import { cn } from '../tokens/cn';

export interface FeatureCardProps {
    /** Optional leading glyph — a lucide icon sized by IconBadge. */
    icon?: ReactNode;
    iconTone?: 'peach' | 'dark' | 'brand' | 'onBrand' | 'muted' | 'surface';
    title: ReactNode;
    children?: ReactNode;
    orientation?: 'vertical' | 'horizontal';
    align?: 'start' | 'center';
    tone?: 'default' | 'muted' | 'onBrand';
    elevation?: 'none' | 'sm' | 'md' | 'lg';
    className?: string;
}

/**
 * FeatureCard — the soft Surface tile that carries a feature: an IconBadge, a
 * title, and a line of body copy. The marketing-grid workhorse. Stack them
 * vertically in a feature grid, or go horizontal for a tighter list row.
 */
export function FeatureCard({
    icon,
    iconTone = 'peach',
    title,
    children,
    orientation = 'vertical',
    align = 'start',
    tone = 'default',
    elevation = 'sm',
    className,
}: FeatureCardProps) {
    const horizontal = orientation === 'horizontal';
    const centered = !horizontal && align === 'center';

    return (
        <Surface
            tone={tone}
            elevation={elevation}
            pad={horizontal ? 'md' : 'lg'}
            className={cn(
                'flex h-full',
                horizontal ? 'flex-row gap-4' : 'flex-col',
                centered && 'items-center text-center',
                className
            )}
        >
            {icon && (
                <IconBadge
                    tone={iconTone}
                    size="lg"
                    className={cn(horizontal ? 'shrink-0' : 'mb-4')}
                >
                    {icon}
                </IconBadge>
            )}
            <div className={cn(horizontal && 'min-w-0')}>
                <h3 className="text-lg font-semibold">{title}</h3>
                {children && (
                    <p className="text-muted-foreground mt-1.5 text-sm leading-relaxed">
                        {children}
                    </p>
                )}
            </div>
        </Surface>
    );
}
