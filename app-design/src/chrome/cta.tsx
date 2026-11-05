import type { ReactNode } from 'react';

import { cn } from '../lib/cn';

/** 2.0's header block: deep orange, the bar's full height, flush to the frame's right rule. */
export const CTA_BLOCK =
    'flex items-center gap-3 self-stretch whitespace-nowrap bg-primary px-4 text-[0.9375rem] font-medium text-primary-foreground min-[900px]:px-7';

/** The block as a link: its hover, its press and an inset ring that shows on the orange. */
export const CTA_LINK =
    'group/cta outline-none transition-colors duration-200 ease-oca-out hover:bg-oca-cta-hover focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-oca-ring-on-fill';

/** The trailing "+" of a CTA; it turns as the pointer lands on its link. */
export function CtaPlus() {
    return (
        <span
            aria-hidden
            className="relative inline-block size-3 shrink-0 transition-transform duration-300 ease-oca-out group-hover/cta:rotate-90 group-active/cta:rotate-90"
        >
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-current" />
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-current" />
        </span>
    );
}

/** A CTA's label in a one-cell grid with the labels it may become, so its width never changes. */
export function CtaLabel({ label, reserve = [], hidden }: { label: ReactNode; reserve?: readonly ReactNode[]; hidden?: boolean }) {
    return (
        <span className="grid [&>*]:[grid-area:1/1]">
            <span className={cn(hidden && 'invisible')}>{label}</span>
            {reserve.map((r, i) => (
                <span key={i} aria-hidden className="invisible">
                    {r}
                </span>
            ))}
        </span>
    );
}
