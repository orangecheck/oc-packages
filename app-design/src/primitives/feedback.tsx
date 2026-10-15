import * as SeparatorPrimitive from '@radix-ui/react-separator';
import {
    forwardRef,
    useEffect,
    useState,
    type ComponentPropsWithoutRef,
    type ElementRef,
    type HTMLAttributes,
} from 'react';
import { Toaster as SonnerToaster, type ToasterProps } from 'sonner';

import { cn } from '../lib/cn';

export function Spinner({ className, label }: { className?: string; label?: string }) {
    return (
        <svg
            viewBox="0 0 24 24"
            fill="none"
            role={label ? 'status' : undefined}
            aria-label={label}
            aria-hidden={label ? undefined : true}
            className={cn('size-4 animate-spin', className)}
        >
            <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2.5" />
            <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        </svg>
    );
}

/** A placeholder bar, visible on the canvas and on a card in both modes. */
export function Skeleton({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            data-ui="skeleton"
            className={cn('animate-pulse rounded-lg bg-[var(--oca-skeleton)]', className)}
            {...props}
        />
    );
}

/**
 * True once `active` has stayed true for `ms`. A loading state that never
 * ends reads as a broken page; pass this to show a way out instead.
 */
export function useTimedOut(active: boolean, ms = 12_000): boolean {
    const [timedOut, setTimedOut] = useState(false);
    useEffect(() => {
        if (!active) {
            setTimedOut(false);
            return;
        }
        const t = setTimeout(() => setTimedOut(true), ms);
        return () => clearTimeout(t);
    }, [active, ms]);
    return timedOut;
}

export const Separator = forwardRef<
    ElementRef<typeof SeparatorPrimitive.Root>,
    ComponentPropsWithoutRef<typeof SeparatorPrimitive.Root>
>(function Separator({ className, orientation = 'horizontal', decorative = true, ...props }, ref) {
    return (
        <SeparatorPrimitive.Root
            ref={ref}
            decorative={decorative}
            orientation={orientation}
            className={cn(
                'shrink-0 bg-border',
                orientation === 'horizontal' ? 'h-px w-full' : 'h-full w-px',
                className
            )}
            {...props}
        />
    );
});

export function Kbd({ className, ...props }: HTMLAttributes<HTMLElement>) {
    return (
        <kbd
            className={cn(
                'inline-flex h-5 min-w-5 items-center justify-center rounded-md border border-border bg-card px-1.5 font-mono text-[11px] text-muted-foreground',
                className
            )}
            {...props}
        />
    );
}

/** Live-region status dot: a calm pulse for "running", solid otherwise. */
export function StatusDot({
    tone = 'neutral',
    pulse = false,
    className,
}: {
    tone?: 'neutral' | 'success' | 'warning' | 'danger' | 'brand';
    pulse?: boolean;
    className?: string;
}) {
    const color = {
        neutral: 'bg-oca-subtle',
        success: 'bg-success',
        warning: 'bg-warning',
        danger: 'bg-destructive',
        brand: 'bg-brand',
    }[tone];
    return (
        <span
            aria-hidden
            className={cn('inline-block size-2 shrink-0 rounded-full', color, pulse && 'oca-animate-pulse-dot', className)}
        />
    );
}

/** Toasts in the system's type and surfaces. Mount once. */
export function Toaster(props: ToasterProps) {
    return (
        <SonnerToaster
            position="bottom-right"
            toastOptions={{
                classNames: {
                    toast: 'oca-toast rounded-2xl border border-border bg-popover text-popover-foreground shadow-lg font-sans',
                    title: 'text-[0.9375rem] font-medium',
                    description: 'text-sm text-muted-foreground',
                    actionButton: 'rounded-full bg-primary text-primary-foreground',
                    cancelButton: 'rounded-full bg-muted text-foreground',
                },
            }}
            {...props}
        />
    );
}

export { toast } from 'sonner';
