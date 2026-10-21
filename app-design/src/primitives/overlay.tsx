import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as DropdownMenuPrimitive from '@radix-ui/react-dropdown-menu';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { X } from 'lucide-react';
import { forwardRef, type ComponentPropsWithoutRef, type ElementRef, type HTMLAttributes } from 'react';

import { cn } from '../lib/cn';

/* ── Dialog ───────────────────────────────────────────────────────────── */

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;
export const DialogClose = DialogPrimitive.Close;

const overlayClass =
    'oca-animate-fade fixed inset-0 z-50 bg-[rgb(10_10_10/0.38)] backdrop-blur-[2px] data-[state=closed]:opacity-0';

export const DialogContent = forwardRef<
    ElementRef<typeof DialogPrimitive.Content>,
    ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
        hideClose?: boolean;
        /** The dimmed layer under it: a z-index for a page with its own layers (a fullscreen canvas). */
        overlayClassName?: string;
    }
>(function DialogContent({ className, children, hideClose, overlayClassName, ...props }, ref) {
    return (
        <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className={cn(overlayClass, overlayClassName)} />
            <DialogPrimitive.Content
                ref={ref}
                className={cn(
                    'oca-animate-rise fixed left-1/2 top-1/2 z-50 w-[min(92vw,34rem)] -translate-x-1/2 -translate-y-1/2',
                    'max-h-[88vh] overflow-y-auto rounded-[1.5rem] border border-border bg-popover p-6 text-popover-foreground shadow-xl md:p-8',
                    'outline-none',
                    className
                )}
                {...props}
            >
                {children}
                {hideClose ? null : (
                    <DialogPrimitive.Close
                        className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                        aria-label="Close"
                    >
                        <X className="size-4" />
                    </DialogPrimitive.Close>
                )}
            </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
    );
});

export function DialogHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('mb-5 flex flex-col gap-2 pr-8', className)} {...props} />;
}

export function DialogFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
    return <div className={cn('mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end', className)} {...props} />;
}

export const DialogTitle = forwardRef<
    ElementRef<typeof DialogPrimitive.Title>,
    ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(function DialogTitle({ className, ...props }, ref) {
    return (
        <DialogPrimitive.Title
            ref={ref}
            className={cn('text-[1.5rem] font-normal leading-tight tracking-[-0.02em]', className)}
            {...props}
        />
    );
});

export const DialogDescription = forwardRef<
    ElementRef<typeof DialogPrimitive.Description>,
    ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(function DialogDescription({ className, ...props }, ref) {
    return <DialogPrimitive.Description ref={ref} className={cn('oca-body', className)} {...props} />;
});

/* ── Sheet: a dialog from an edge ────────────────────────────────────── */

export const Sheet = DialogPrimitive.Root;
export const SheetTrigger = DialogPrimitive.Trigger;
export const SheetClose = DialogPrimitive.Close;
export const SheetTitle = DialogTitle;
export const SheetDescription = DialogDescription;

const sheetSide = {
    right: 'inset-y-0 right-0 h-full w-[min(88vw,24rem)] border-l',
    left: 'inset-y-0 left-0 h-full w-[min(88vw,24rem)] border-r',
    bottom: 'inset-x-0 bottom-0 max-h-[88vh] rounded-t-[1.5rem] border-t',
} as const;

export const SheetContent = forwardRef<
    ElementRef<typeof DialogPrimitive.Content>,
    ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
        side?: keyof typeof sheetSide;
        /** The dimmed layer under it: a z-index for a page with its own layers (a fullscreen canvas). */
        overlayClassName?: string;
    }
>(function SheetContent({ className, children, side = 'right', overlayClassName, ...props }, ref) {
    return (
        <DialogPrimitive.Portal>
            <DialogPrimitive.Overlay className={cn(overlayClass, overlayClassName)} />
            <DialogPrimitive.Content
                ref={ref}
                className={cn(
                    'oca-animate-fade fixed z-50 flex flex-col gap-4 overflow-y-auto border-border bg-popover p-6 text-popover-foreground shadow-xl outline-none',
                    sheetSide[side],
                    className
                )}
                {...props}
            >
                {children}
                <DialogPrimitive.Close
                    className="absolute right-4 top-4 inline-flex size-9 items-center justify-center rounded-full text-muted-foreground hover:bg-accent hover:text-foreground"
                    aria-label="Close"
                >
                    <X className="size-4" />
                </DialogPrimitive.Close>
            </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
    );
});

/* ── Popover ──────────────────────────────────────────────────────────── */

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;
export const PopoverAnchor = PopoverPrimitive.Anchor;

export const PopoverContent = forwardRef<
    ElementRef<typeof PopoverPrimitive.Content>,
    ComponentPropsWithoutRef<typeof PopoverPrimitive.Content>
>(function PopoverContent({ className, align = 'center', sideOffset = 8, ...props }, ref) {
    return (
        <PopoverPrimitive.Portal>
            <PopoverPrimitive.Content
                ref={ref}
                align={align}
                sideOffset={sideOffset}
                className={cn(
                    'oca-animate-fade z-50 w-72 rounded-2xl border border-border bg-popover p-4 text-popover-foreground shadow-lg outline-none',
                    className
                )}
                {...props}
            />
        </PopoverPrimitive.Portal>
    );
});

/* ── Tooltip: ink, small, quick ───────────────────────────────────────── */

export const TooltipProvider = TooltipPrimitive.Provider;
export const Tooltip = TooltipPrimitive.Root;
export const TooltipTrigger = TooltipPrimitive.Trigger;

export const TooltipContent = forwardRef<
    ElementRef<typeof TooltipPrimitive.Content>,
    ComponentPropsWithoutRef<typeof TooltipPrimitive.Content>
>(function TooltipContent({ className, sideOffset = 6, ...props }, ref) {
    return (
        <TooltipPrimitive.Portal>
            <TooltipPrimitive.Content
                ref={ref}
                sideOffset={sideOffset}
                className={cn(
                    'oca-animate-fade z-50 max-w-xs rounded-lg bg-oca-ink px-2.5 py-1.5 text-[0.8125rem] leading-snug text-oca-ink-foreground',
                    className
                )}
                {...props}
            />
        </TooltipPrimitive.Portal>
    );
});

/* ── Menu ─────────────────────────────────────────────────────────────── */

export const DropdownMenu = DropdownMenuPrimitive.Root;
export const DropdownMenuTrigger = DropdownMenuPrimitive.Trigger;
export const DropdownMenuGroup = DropdownMenuPrimitive.Group;

export const DropdownMenuContent = forwardRef<
    ElementRef<typeof DropdownMenuPrimitive.Content>,
    ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Content>
>(function DropdownMenuContent({ className, sideOffset = 8, ...props }, ref) {
    return (
        <DropdownMenuPrimitive.Portal>
            <DropdownMenuPrimitive.Content
                ref={ref}
                sideOffset={sideOffset}
                className={cn(
                    'oca-animate-fade z-50 min-w-56 overflow-hidden rounded-2xl border border-border bg-popover p-1.5 text-popover-foreground shadow-lg',
                    className
                )}
                {...props}
            />
        </DropdownMenuPrimitive.Portal>
    );
});

export const DropdownMenuItem = forwardRef<
    ElementRef<typeof DropdownMenuPrimitive.Item>,
    ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Item> & { destructive?: boolean }
>(function DropdownMenuItem({ className, destructive, ...props }, ref) {
    return (
        <DropdownMenuPrimitive.Item
            ref={ref}
            className={cn(
                // A thumb's 44px on a phone.
                'flex h-10 cursor-default select-none items-center gap-2.5 rounded-xl px-3 text-[0.9375rem] outline-none max-md:h-11',
                'data-[highlighted]:bg-accent data-[disabled]:opacity-50 [&_svg]:size-4 [&_svg]:text-muted-foreground',
                destructive && 'text-destructive [&_svg]:text-destructive',
                className
            )}
            {...props}
        />
    );
});

export const DropdownMenuLabel = forwardRef<
    ElementRef<typeof DropdownMenuPrimitive.Label>,
    ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Label>
>(function DropdownMenuLabel({ className, ...props }, ref) {
    return (
        <DropdownMenuPrimitive.Label
            ref={ref}
            className={cn('px-3 pb-1.5 pt-2 text-[0.8125rem] text-muted-foreground', className)}
            {...props}
        />
    );
});

export const DropdownMenuSeparator = forwardRef<
    ElementRef<typeof DropdownMenuPrimitive.Separator>,
    ComponentPropsWithoutRef<typeof DropdownMenuPrimitive.Separator>
>(function DropdownMenuSeparator({ className, ...props }, ref) {
    return <DropdownMenuPrimitive.Separator ref={ref} className={cn('my-1.5 h-px bg-border', className)} {...props} />;
});
