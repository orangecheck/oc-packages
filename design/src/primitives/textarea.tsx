import * as React from 'react';

import { cn } from '../tokens/cn';

function Textarea({ className, ...props }: React.ComponentProps<'textarea'>) {
    return (
        <textarea
            data-slot="textarea"
            className={cn(
                'placeholder:text-muted-foreground border-input bg-input/30 hover:bg-input/50 dark:bg-input/30 dark:hover:bg-input/50 w-full min-w-0 rounded-md border px-3 py-2 font-mono text-xs leading-relaxed shadow-xs transition-[color,box-shadow,background-color] outline-none disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50',
                'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]',
                className
            )}
            {...props}
        />
    );
}

export { Textarea };
