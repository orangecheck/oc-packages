'use client';

import { HelpCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { Popover, PopoverContent, PopoverTrigger } from '../primitives/popover';
import { cn } from '../tokens/cn';

export interface HelpHintProps {
    /** Optional bold heading inside the popover. */
    title?: string;
    /** The help body — short prose explaining a term or control. */
    children: ReactNode;
    /** Which side the popover opens toward. */
    side?: 'top' | 'bottom' | 'left' | 'right';
    /** Accessible label for the trigger (defaults to "more information"). */
    label?: string;
    className?: string;
}

/**
 * HelpHint — the inline "?" affordance for term-level guidance, lifted from
 * oc-me-web's `me/ui/HelpHint`. Built on Popover (not a hover tooltip) so it
 * works on touch and can hold a title plus a paragraph of prose. This is the
 * keystone that lets SectionHeader carry an optional `hint` without every
 * site re-authoring its own help icon.
 */
export function HelpHint({
    title,
    children,
    side = 'bottom',
    label = 'more information',
    className,
}: HelpHintProps) {
    return (
        <Popover>
            <PopoverTrigger
                aria-label={label}
                className={cn(
                    'text-muted-foreground/60 hover:text-foreground inline-flex size-3.5 items-center justify-center align-middle transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    className
                )}
            >
                <HelpCircle className="size-3.5" aria-hidden />
            </PopoverTrigger>
            <PopoverContent side={side} className="w-72 space-y-1.5">
                {title && (
                    <p className="label-mono text-foreground text-[10px]">{title}</p>
                )}
                <div className="text-muted-foreground text-xs leading-relaxed">{children}</div>
            </PopoverContent>
        </Popover>
    );
}
