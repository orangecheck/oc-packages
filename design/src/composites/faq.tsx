'use client';

import type { ReactNode } from 'react';

import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '../primitives';
import { cn } from '../tokens/cn';

export interface FaqItem {
    q: ReactNode;
    a: ReactNode;
}

export interface FaqProps {
    items: FaqItem[];
    /** Index of the item open on first render; omit for all collapsed. */
    defaultOpen?: number;
    className?: string;
}

/**
 * Faq — a plus/minus accordion list of question/answer pairs for the bottom of
 * a marketing page. single-open, collapsible. re-skins via the underlying
 * Accordion primitive.
 */
export function Faq({ items, defaultOpen, className }: FaqProps) {
    return (
        <Accordion
            type="single"
            collapsible
            defaultValue={defaultOpen != null ? String(defaultOpen) : undefined}
            className={cn('w-full', className)}
        >
            {items.map((item, i) => (
                <AccordionItem key={i} value={String(i)}>
                    <AccordionTrigger
                        icon="plusMinus"
                        className="text-foreground text-base font-semibold"
                    >
                        {item.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-muted-foreground leading-relaxed">
                        {item.a}
                    </AccordionContent>
                </AccordionItem>
            ))}
        </Accordion>
    );
}
