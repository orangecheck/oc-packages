import * as React from 'react';

import { cn } from '../tokens/cn';

/**
 * Sizing note, and it is load-bearing: `text-base md:text-xs`, not `text-xs`.
 *
 * iOS Safari zooms the viewport when a form field with text under 16px takes
 * focus, and the user is not zoomed back out afterwards — every textarea in
 * the family did this. `text-base` (16px) on mobile suppresses it; `md:text-xs`
 * keeps the 12px mono look on a pointer device, where the zoom behaviour does
 * not exist. Input already used this ladder (`text-base md:text-sm`); Textarea
 * was flat 12px with no responsive step.
 *
 * A consumer passing `text-xs` via className will re-break it — tailwind-merge
 * lets the caller win. Pass the ladder, not a single size.
 */
function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
    return (
        <textarea
            data-slot="textarea"
            className={cn(
                'placeholder:text-muted-foreground border-input bg-input/30 hover:bg-input/50 dark:bg-input/30 dark:hover:bg-input/50 w-full min-w-0 rounded-md border px-3 py-2 font-mono text-base leading-relaxed shadow-xs md:text-xs transition-[color,box-shadow,background-color] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
                'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                // aria-invalid parity with Input — error styling when a consumer
                // marks the field invalid.
                'aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive',
                className
            )}
            {...props}
        />
    );
}

export { Textarea };
