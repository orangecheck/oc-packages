'use client';

import * as Popover from '@radix-ui/react-popover';
import { HelpCircle } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../tokens/cn';

export interface HelpHintProps {
    /** The help body — short prose (1–3 sentences) explaining a term/control. */
    children: ReactNode;
    /** Optional bold "§ "-prefixed heading inside the popover. */
    title?: string;
    /** Which side the popover prefers to open toward. Default `top`. */
    side?: 'top' | 'right' | 'bottom' | 'left';
    /** `xs` tightens the icon for dense label rows; `sm` (default) suits most. */
    size?: 'xs' | 'sm';
    /** `subtle` mutes the "?" icon when it sits in a description / muted row;
     *  `default` is primary-tinted for active labels. */
    tone?: 'default' | 'subtle';
    /** Accessible label for the trigger (defaults to "what is this?"). */
    label?: string;
    className?: string;
}

/**
 * HelpHint — the canonical inline "?" affordance for term-level guidance.
 * Click/focus reveals a small popover (Radix) with optional title + prose;
 * works on touch (not a hover tooltip). Lifted from oc-me-web's richer
 * `me/ui/HelpHint` (with `size`/`tone`), now the single source. Also the
 * keystone behind `SectionHeader`'s optional `hint`.
 */
export function HelpHint({
    children,
    title,
    side = 'top',
    size = 'sm',
    tone = 'default',
    label = 'what is this?',
    className,
}: HelpHintProps) {
    const iconSize = size === 'xs' ? 12 : 14;
    return (
        <Popover.Root>
            <Popover.Trigger
                aria-label={label}
                onClick={(e) => e.stopPropagation()}
                className={cn(
                    'focus-visible:ring-primary/60 inline-flex shrink-0 items-center justify-center rounded-full transition-colors outline-none focus-visible:ring-2',
                    tone === 'subtle'
                        ? 'text-muted-foreground/60 hover:text-foreground/80'
                        : 'text-primary/70 hover:text-primary',
                    className
                )}
            >
                <HelpCircle size={iconSize} aria-hidden />
            </Popover.Trigger>
            <Popover.Portal>
                <Popover.Content
                    side={side}
                    sideOffset={6}
                    collisionPadding={12}
                    className="border-border bg-popover text-popover-foreground data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 z-50 max-w-xs rounded-md border p-3 text-xs leading-relaxed shadow-md outline-none"
                >
                    {title && <div className="label-mono text-primary mb-1.5">§ {title}</div>}
                    <div className="text-foreground/90">{children}</div>
                    <Popover.Arrow className="fill-popover" />
                </Popover.Content>
            </Popover.Portal>
        </Popover.Root>
    );
}
