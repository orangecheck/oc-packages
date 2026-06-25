import type { ReactNode } from 'react';

import { IconBadge, Surface } from '../primitives';
import { cn } from '../tokens/cn';

/**
 * NumberedStep / StepList — the marketing "how it works" sequence: a peach
 * numbered tile, a title, and a short body, laid out in a responsive grid.
 * Use for 2–4 step walkthroughs on a landing page; pass tone='onBrand' when
 * the list sits on a terracotta band.
 */

export interface Step {
    title: ReactNode;
    children?: ReactNode;
}

export interface NumberedStepProps {
    n: number;
    title: ReactNode;
    children?: ReactNode;
    tone?: 'default' | 'onBrand';
    card?: boolean;
    className?: string;
}

export function NumberedStep({
    n,
    title,
    children,
    tone = 'default',
    card = false,
    className,
}: NumberedStepProps) {
    const onBrand = tone === 'onBrand';
    const body = (
        <div className={cn(!card && className)}>
            <IconBadge tone={onBrand ? 'onBrand' : 'peach'} size="sm">
                {n}
            </IconBadge>
            <div className="mt-4 text-lg font-semibold">{title}</div>
            {children && (
                <div
                    className={cn(
                        'mt-1.5 text-sm leading-relaxed',
                        onBrand ? 'text-brand-foreground/80' : 'text-muted-foreground'
                    )}
                >
                    {children}
                </div>
            )}
        </div>
    );

    if (!card) return body;

    return (
        <Surface
            tone={onBrand ? 'onBrand' : 'default'}
            elevation={onBrand ? 'none' : 'sm'}
            pad="md"
            className={className}
        >
            {body}
        </Surface>
    );
}

export interface StepListProps {
    steps: Step[];
    variant?: 'bare' | 'card';
    tone?: 'default' | 'onBrand';
    columns?: 2 | 3 | 4;
    className?: string;
}

const COLUMNS: Record<2 | 3 | 4, string> = {
    2: 'md:grid-cols-2',
    3: 'md:grid-cols-3',
    4: 'md:grid-cols-4',
};

export function StepList({
    steps,
    variant = 'bare',
    tone = 'default',
    columns = 3,
    className,
}: StepListProps) {
    return (
        <div className={cn('grid gap-6 sm:grid-cols-2 sm:gap-8', COLUMNS[columns], className)}>
            {steps.map((step, index) => (
                <NumberedStep
                    key={index}
                    n={index + 1}
                    title={step.title}
                    tone={tone}
                    card={variant === 'card'}
                >
                    {step.children}
                </NumberedStep>
            ))}
        </div>
    );
}
