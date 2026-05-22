'use client';

import * as DialogPrimitive from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';

import { cn } from '../tokens/cn';

export interface ModalProps {
    open: boolean;
    onOpenChange: (open: boolean) => void;
    title: string;
    subtitle?: string;
    children: ReactNode;
    /** Optional toolbar slot rendered to the right of the title. */
    actions?: ReactNode;
    /** Bias narrower for input-focused modals. */
    width?: 'wide' | 'narrow';
}

/**
 * Family-standard near-fullscreen modal with terminal-window chrome. Dense data
 * gets room to breathe; ESC + backdrop close, focus trapped while open. Backed
 * by Radix Dialog. Visual: ~95vw × 90vh, scrollable body, pinned title strip.
 */
export function Modal({ open, onOpenChange, title, subtitle, children, actions, width = 'wide' }: ModalProps) {
    return (
        <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
            <DialogPrimitive.Portal>
                <DialogPrimitive.Overlay className="bg-background/80 fixed inset-0 z-[100] backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0" />
                <DialogPrimitive.Content
                    className={cn(
                        'terminal fixed top-[5vh] left-1/2 z-[110] flex max-h-[90vh] -translate-x-1/2 flex-col overflow-hidden rounded-sm border',
                        width === 'wide' ? 'w-[95vw] max-w-screen-2xl' : 'w-[80vw] max-w-3xl',
                        'data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95'
                    )}
                >
                    <div className="terminal-title flex shrink-0 items-center justify-between gap-3">
                        <div className="flex items-center gap-2">
                            <span className="terminal-dot" aria-hidden />
                            <span className="terminal-dot opacity-70" aria-hidden />
                            <span className="terminal-dot opacity-50" aria-hidden />
                            <DialogPrimitive.Title className="ml-2 truncate">{title}</DialogPrimitive.Title>
                            {subtitle && (
                                <span className="text-muted-foreground/70 ml-1 truncate text-[10px] normal-case tracking-normal">
                                    · {subtitle}
                                </span>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            {actions}
                            <DialogPrimitive.Close
                                aria-label="close"
                                className="text-muted-foreground hover:text-foreground inline-flex h-6 w-6 items-center justify-center rounded-sm"
                            >
                                <X className="size-3.5" />
                            </DialogPrimitive.Close>
                        </div>
                    </div>
                    <div className="flex-1 overflow-y-auto p-4 sm:p-6">{children}</div>
                </DialogPrimitive.Content>
            </DialogPrimitive.Portal>
        </DialogPrimitive.Root>
    );
}
