import * as TabsPrimitive from '@radix-ui/react-tabs';
import { createContext, forwardRef, useContext, type ComponentPropsWithoutRef, type ElementRef } from 'react';

import { cn } from '../lib/cn';
import { ScrollFade } from './scroll-fade';

/*
 * Two looks for one behaviour: `pill` is a segmented control for switching a
 * view in place; `line` is page-level navigation between sections.
 */
type TabsLook = 'pill' | 'line';
const LookContext = createContext<TabsLook>('pill');

export const Tabs = forwardRef<
    ElementRef<typeof TabsPrimitive.Root>,
    ComponentPropsWithoutRef<typeof TabsPrimitive.Root> & { look?: TabsLook }
>(function Tabs({ look = 'pill', ...props }, ref) {
    return (
        <LookContext.Provider value={look}>
            <TabsPrimitive.Root ref={ref} {...props} />
        </LookContext.Provider>
    );
});

export const TabsList = forwardRef<
    ElementRef<typeof TabsPrimitive.List>,
    ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
        /** Wrap onto a second row rather than scroll sideways: every tab in view (globe's six layers at 390). */
        wrap?: boolean;
    }
>(function TabsList({ className, wrap = false, ...props }, ref) {
    const look = useContext(LookContext);
    if (wrap) {
        return (
            <TabsPrimitive.List
                ref={ref}
                className={cn(
                    look === 'pill'
                        ? 'inline-flex max-w-full flex-wrap items-center gap-1 rounded-[1.375rem] bg-muted p-1'
                        : 'flex flex-wrap items-center gap-x-6 border-b border-border',
                    className
                )}
                {...props}
            />
        );
    }
    // More tabs than fit a phone scroll sideways, with an edge that says so.
    return (
        <ScrollFade fade="var(--background)" className={look === 'pill' ? 'w-fit max-w-full' : 'w-full'}>
            <TabsPrimitive.List
                ref={ref}
                className={cn(
                    look === 'pill'
                        ? 'inline-flex w-max items-center gap-1 rounded-full bg-muted p-1'
                        : 'flex w-max min-w-full items-center gap-6 border-b border-border',
                    className
                )}
                {...props}
            />
        </ScrollFade>
    );
});

export const TabsTrigger = forwardRef<
    ElementRef<typeof TabsPrimitive.Trigger>,
    ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>
>(function TabsTrigger({ className, onPointerDown, onKeyDown, onBlur, ...props }, ref) {
    const look = useContext(LookContext);
    return (
        <TabsPrimitive.Trigger
            ref={ref}
            /*
             * Radix focuses the tab from script on mousedown, which Chrome can
             * take for keyboard focus and ring. A press marks the tab; a key clears it.
             */
            onPointerDown={(e) => {
                e.currentTarget.dataset.pressed = '';
                onPointerDown?.(e);
            }}
            onKeyDown={(e) => {
                delete e.currentTarget.dataset.pressed;
                onKeyDown?.(e);
            }}
            onBlur={(e) => {
                delete e.currentTarget.dataset.pressed;
                onBlur?.(e);
            }}
            className={cn(
                'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap text-[0.9375rem] outline-none transition-colors',
                '[&:focus-visible:not([data-pressed])]:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
                look === 'pill'
                    ? 'h-9 rounded-full px-4 text-muted-foreground hover:text-foreground data-[state=active]:bg-card data-[state=active]:text-foreground data-[state=active]:shadow-sm'
                    : '-mb-px h-11 border-b-2 border-transparent text-muted-foreground hover:text-foreground data-[state=active]:border-foreground data-[state=active]:text-foreground',
                className
            )}
            {...props}
        />
    );
});

export const TabsContent = forwardRef<
    ElementRef<typeof TabsPrimitive.Content>,
    ComponentPropsWithoutRef<typeof TabsPrimitive.Content> & {
        /** Stay mounted while another tab shows: a chart, a form or a canvas keeps its state. */
        keepMounted?: boolean;
    }
>(function TabsContent({ className, keepMounted = false, ...props }, ref) {
    return (
        <TabsPrimitive.Content
            ref={ref}
            forceMount={keepMounted || undefined}
            // Radix puts the panel in the Tab order; it says so when reached.
            className={cn(
                'mt-6 rounded-lg outline-none focus-visible:[outline:2px_solid_var(--ring)] focus-visible:[outline-offset:4px]',
                keepMounted && 'data-[state=inactive]:hidden',
                className
            )}
            {...props}
        />
    );
});
