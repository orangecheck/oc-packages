'use client';

import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as React from 'react';

import { cn } from '../tokens/cn';

/**
 * Tabs — accessible tabbed interface (Radix). Replaces the hand-rolled
 * `role="tablist"` + manual `useState` toggles found in vault settings, the
 * www dashboard, me's SnippetCard, attest's CodeTabs, and others. Keyboard
 * nav, roving tabindex, and ARIA wiring come from Radix; the OC look (mono,
 * underline-on-active) is layered on top.
 */
function Tabs({ ...props }: React.ComponentProps<typeof TabsPrimitive.Root>) {
    return <TabsPrimitive.Root data-slot="tabs" {...props} />;
}

function TabsList({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.List>) {
    return (
        <TabsPrimitive.List
            data-slot="tabs-list"
            // A tab row is `flex` (nowrap), so a long set of triggers overflows the
            // page horizontally on narrow screens. Let the row scroll inside itself
            // instead — `overflow-x-auto` + `min-w-0`, scrollbar hidden so it still
            // reads as a clean tab strip.
            className={cn(
                'border-border -mb-px flex min-w-0 items-center gap-6 overflow-x-auto border-b [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden',
                className
            )}
            {...props}
        />
    );
}

function TabsTrigger({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Trigger>) {
    return (
        <TabsPrimitive.Trigger
            data-slot="tabs-trigger"
            className={cn(
                'text-muted-foreground hover:text-foreground data-[state=active]:text-primary data-[state=active]:border-primary -mb-px border-b-2 border-transparent py-2 font-mono text-[11px] tracking-widest uppercase transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
                className
            )}
            {...props}
        />
    );
}

function TabsContent({ className, ...props }: React.ComponentProps<typeof TabsPrimitive.Content>) {
    return (
        <TabsPrimitive.Content
            data-slot="tabs-content"
            className={cn('mt-4 outline-none', className)}
            {...props}
        />
    );
}

export { Tabs, TabsList, TabsTrigger, TabsContent };
