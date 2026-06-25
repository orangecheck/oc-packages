'use client';

import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as React from 'react';

import { cn } from '../tokens/cn';

/**
 * Switch — Radix-backed on/off toggle, skin-aware, accessible. For binary
 * settings (distinct from the domain-specific ThemeToggle). brand-on track,
 * family focus ring. Track is `rounded-full` by toggle convention; the thumb
 * follows suit.
 */
function Switch({ className, ...props }: React.ComponentProps<typeof SwitchPrimitive.Root>) {
    return (
        <SwitchPrimitive.Root
            data-slot="switch"
            className={cn(
                'peer inline-flex h-5 w-9 shrink-0 items-center rounded-full border border-transparent shadow-xs transition-[color,box-shadow,background-color] outline-none',
                'data-[state=checked]:bg-primary data-[state=unchecked]:bg-input',
                'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40',
                className
            )}
            {...props}
        >
            <SwitchPrimitive.Thumb
                data-slot="switch-thumb"
                className={cn(
                    'bg-background pointer-events-none block size-4 rounded-full shadow-sm ring-0 transition-transform',
                    'data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0.5'
                )}
            />
        </SwitchPrimitive.Root>
    );
}

export { Switch };
