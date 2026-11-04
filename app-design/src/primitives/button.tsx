import { Slot, Slottable } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '../lib/cn';
import { useDensity } from '../lib/density';
import { HIT_LINK } from '../lib/hit';
import { Spinner } from './feedback';

/*
 * 2.0: square buttons. `primary` is the page CTA, deep orange with white
 * text; `secondary` is the outlined one. `brand` is the orange fill with ink
 * text, for in-product CTAs and tiles (white on orange is never used).
 * `onInk` and `onInkOutline` are the pair for dark bands. `plus` adds the
 * trailing "+" that turns 90° on hover and press, CSS only.
 */
export const buttonVariants = cva(
    [
        'group/button inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-none font-medium',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-200 ease-oca-out',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'active:translate-y-px disabled:pointer-events-none',
        // Disabled is one look for every variant: a quiet grey block, never a
        // faded black or orange slab that reads as broken.
        'disabled:border disabled:border-border disabled:bg-muted disabled:text-oca-subtle disabled:shadow-none',
        '[&_svg]:pointer-events-none [&_svg]:size-[1.1em] [&_svg]:shrink-0',
    ],
    {
        variants: {
            variant: {
                primary: 'bg-primary text-primary-foreground hover:bg-oca-primary-hover',
                // A border's width, so the touch target below is measured from the border box.
                secondary:
                    'border border-foreground/45 bg-transparent text-foreground hover:border-foreground hover:bg-accent/60 [--hit-b:1px]',
                // Ink text on orange; the hover lightens, since ink on the deep orange is 3.55:1.
                brand: 'bg-brand text-brand-foreground hover:bg-oca-orange-light',
                ghost: 'text-foreground hover:bg-accent',
                danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                link: 'h-auto rounded-none px-0 text-foreground underline decoration-foreground/35 underline-offset-4 hover:decoration-foreground',
                onInk: 'bg-white text-oca-ink hover:bg-white/90',
                onInkOutline: 'border border-white/40 text-white hover:border-white hover:bg-white/10 [--hit-b:1px]',
            },
            size: {
                // 36px drawn, 44px to a thumb. The target is positioned from inside the
                // border, so a bordered button adds the border back.
                sm: 'relative h-9 px-4 text-sm pointer-coarse:before:absolute pointer-coarse:before:-inset-x-[var(--hit-b,0px)] pointer-coarse:before:-inset-y-[calc(0.25rem+var(--hit-b,0px))]',
                md: 'h-11 px-5 text-[0.9375rem]',
                lg: 'h-14 px-7 text-[1.0625rem]',
                icon: 'relative size-10 pointer-coarse:before:absolute pointer-coarse:before:-inset-[calc(0.125rem+var(--hit-b,0px))]',
                // 32px drawn, 44px to a thumb (HIT_32).
                'icon-sm': 'relative size-8 pointer-coarse:before:absolute pointer-coarse:before:-inset-[calc(0.375rem+var(--hit-b,0px))]',
            },
        },
        // A link is its line's height, 44px to a thumb (HIT_LINK).
        compoundVariants: [{ variant: 'link', className: ['h-auto px-0', HIT_LINK] }],
        defaultVariants: { variant: 'primary', size: 'md' },
    }
);

export interface ButtonProps
    extends ButtonHTMLAttributes<HTMLButtonElement>,
        VariantProps<typeof buttonVariants> {
    /** Render the child element (a Link, an <a>) with the button's styles. */
    asChild?: boolean;
    /** Shows a spinner and disables the button. */
    loading?: boolean;
    /** The trailing "+" of 2.0's CTAs. It turns 90° on hover and press; it is decoration, hidden from screen readers. */
    plus?: boolean;
}

/** The trailing "+": two bars, so it turns about its own centre at any size. */
function Plus() {
    return (
        <span
            aria-hidden
            data-oca-plus=""
            className="relative inline-block size-[0.75em] shrink-0 transition-transform duration-300 ease-oca-out group-hover/button:rotate-90 group-active/button:rotate-90"
        >
            <span className="absolute inset-x-0 top-1/2 h-px -translate-y-1/2 bg-current" />
            <span className="absolute inset-y-0 left-1/2 w-px -translate-x-1/2 bg-current" />
        </span>
    );
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { className, variant, size, asChild = false, loading = false, plus = false, disabled, children, type, ...props },
    ref
) {
    const Comp = asChild ? Slot : 'button';
    // Under a tool's compact density a default button is `sm`, the height of the fields beside it
    // (36px drawn, 44px to a thumb), so a Field's action lines up with its input.
    const density = useDensity();
    const s = size ?? (density === 'compact' ? 'sm' : undefined);
    return (
        <Comp
            ref={ref}
            data-ui="button"
            className={cn(buttonVariants({ variant, size: s }), className)}
            disabled={asChild ? undefined : disabled || loading}
            aria-busy={loading || undefined}
            type={asChild ? undefined : (type ?? 'button')}
            {...props}
        >
            {asChild ? (
                plus ? (
                    // The child (a Link, an <a>) is the root and the "+" goes inside it. Slot finds
                    // Slottable only among its direct children, so this is an array, not a fragment.
                    [<Slottable key="child">{children}</Slottable>, <Plus key="plus" />]
                ) : (
                    children
                )
            ) : (
                <>
                    {loading ? <Spinner className="size-[1.1em]" /> : null}
                    {children}
                    {plus ? <Plus /> : null}
                </>
            )}
        </Comp>
    );
});
