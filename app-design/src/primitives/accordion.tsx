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

export function Accordion({
    single = false,
    children,
    className,
}: {
    /** One item open at a time: opening one closes the others. */
    single?: boolean;
    children: ReactNode;
    className?: string;
}) {
    const name = useId();
    return (
        <GroupName.Provider value={single ? name : undefined}>
            <div className={cn('divide-y divide-border overflow-hidden rounded-[1.25rem] border border-border bg-card', className)}>
                {children}
            </div>
        </GroupName.Provider>
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
    return (
        <details id={id} name={name} open={defaultOpen || undefined} className={cn('group scroll-mt-24', className)}>
            <summary
                className={cn(
                    'flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 text-[1rem] font-medium leading-snug md:px-6',
                    // Inside the card's clip, so the ring is drawn within the row.
                    'transition-colors hover:bg-accent/60 focus-visible:outline-offset-[-2px] [&::-webkit-details-marker]:hidden'
                )}
            >
                {title}
                <ChevronDown
                    aria-hidden
                    className="size-4 shrink-0 text-muted-foreground transition-transform duration-200 group-open:rotate-180"
                />
            </summary>
            <div className="oca-body px-5 pb-5 text-[0.9375rem] md:px-6 md:pb-6">{children}</div>
        </details>
    );
}
