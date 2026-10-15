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
    ComponentPropsWithoutRef<typeof TabsPrimitive.List>
>(function TabsList({ className, ...props }, ref) {
    const look = useContext(LookContext);
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
>(function TabsTrigger({ className, ...props }, ref) {
    const look = useContext(LookContext);
    return (
        <TabsPrimitive.Trigger
            ref={ref}
            className={cn(
                'inline-flex shrink-0 items-center justify-center gap-2 whitespace-nowrap text-[0.9375rem] outline-none transition-colors',
                'focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50',
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
    ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(function TabsContent({ className, ...props }, ref) {
    return <TabsPrimitive.Content ref={ref} className={cn('mt-6 outline-none', className)} {...props} />;
});
