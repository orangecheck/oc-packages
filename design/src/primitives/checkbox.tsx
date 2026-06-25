'use client';

import * as CheckboxPrimitive from '@radix-ui/react-checkbox';
import { CheckIcon } from 'lucide-react';
import * as React from 'react';

import { cn } from '../tokens/cn';

/**
 * Checkbox — Radix-backed, skin-aware, accessible. Replaces raw
 * `<input type="checkbox">` (the family had ~18 unstyled instances). Sharp
 * `rounded-sm` (skin radius), brand fill when checked, the family focus ring,
 * and `aria-invalid` error styling for parity with Input/Select/Textarea.
 */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
    return (
        <CheckboxPrimitive.Root
            data-slot="checkbox"
            className={cn(
                'peer border-input bg-input/30 size-4 shrink-0 rounded-sm border shadow-xs transition-[color,box-shadow,background-color] outline-none',
                'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                'disabled:cursor-not-allowed disabled:opacity-50',
                'data-[state=checked]:bg-primary data-[state=checked]:border-primary data-[state=checked]:text-primary-foreground',
                'aria-invalid:ring-2 aria-invalid:ring-destructive/50 aria-invalid:border-destructive',
                className
            )}
            {...props}
        >
            <CheckboxPrimitive.Indicator
                data-slot="checkbox-indicator"
                className="flex items-center justify-center text-current"
            >
                <CheckIcon className="size-3.5" strokeWidth={3} />
            </CheckboxPrimitive.Indicator>
        </CheckboxPrimitive.Root>
    );
}

export { Checkbox };
