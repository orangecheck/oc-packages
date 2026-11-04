import { ChevronDown } from 'lucide-react';
import { createContext, useContext, useId, type ReactNode } from 'react';

import { cn } from '../lib/cn';

/*
 * Questions and sections that open in place. Built on <details>, so it works
 * before script loads, a browser's find-in-page opens the item that holds the
 * match, and a screen reader hears each title as a button that is expanded
 * or collapsed. `single` lets one item be open at a time.
 */
const GroupName = createContext<string | undefined>(undefined);
const Variant = createContext<'card' | 'rule'>('card');

export function Accordion({
    single = false,
    variant = 'card',
    children,
    className,
}: {
    /** One item open at a time: opening one closes the others. */
    single?: boolean;
    /** `card` is a framed panel with a chevron; `rule` is 2.0's hairline rows with a "+" that turns into "−". */
    variant?: 'card' | 'rule';
    children: ReactNode;
    className?: string;
}) {
    const name = useId();
    return (
        <GroupName.Provider value={single ? name : undefined}>
            <Variant.Provider value={variant}>
                <div
                    data-variant={variant}
                    className={cn(
                        variant === 'rule'
                            ? 'divide-y divide-border border-y border-border'
                            : 'divide-y divide-border overflow-hidden rounded-none border border-border bg-card',
                        className
                    )}
                >
                    {children}
                </div>
            </Variant.Provider>
        </GroupName.Provider>
    );
}

/** The rule variant's "+": its upright bar turns flat as the item opens, leaving "−". */
function PlusMinus() {
    return (
        <span aria-hidden className="relative size-4 shrink-0 text-muted-foreground">
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-current" />
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-current transition-transform duration-300 ease-oca-out group-open:rotate-90" />
        </span>
    );
}

export function AccordionItem({
    title,
    children,
    defaultOpen = false,
    id,
    className,
}: {
    title: ReactNode;
    children: ReactNode;
    defaultOpen?: boolean;
    /** For a link straight to this item. */
    id?: string;
    className?: string;
}) {
    const name = useContext(GroupName);
    const variant = useContext(Variant);
    const rule = variant === 'rule';
    return (
        <details id={id} name={name} open={defaultOpen || undefined} className={cn('group scroll-mt-24', className)}>
            <summary
                className={cn(
                    'flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 leading-snug',
                    rule ? 'py-5 text-[1.0625rem] md:text-[1.125rem]' : 'px-5 py-4 text-[1rem] font-medium md:px-6',
                    // Inside the card's clip, so the ring is drawn within the row.
                    'transition-colors focus-visible:outline-offset-[-2px] [&::-webkit-details-marker]:hidden',
                    rule ? 'hover:text-oca-accent-ink' : 'hover:bg-accent/60'
                )}
            >
                {title}
                {rule ? (
                    <PlusMinus />
                ) : (
                    <ChevronDown
                        aria-hidden
                        className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                    />
                )}
            </summary>
            <div className={cn('oca-body text-[0.9375rem]', rule ? 'max-w-[44rem] pb-6 pr-10' : 'px-5 pb-5 md:px-6 md:pb-6')}>
                {children}
            </div>
        </details>
    );
}
