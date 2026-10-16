import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { forwardRef, type ButtonHTMLAttributes } from 'react';

import { cn } from '../lib/cn';
import { Spinner } from './feedback';

/*
 * Pills, as the deck draws them: the black filled pill leads, the white
 * outlined pill follows. `brand` is for the orange band only; `onInk` and
 * `onInkOutline` are the same pair inverted for dark bands.
 */
export const buttonVariants = cva(
    [
        'inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-full font-medium',
        'transition-[background-color,border-color,color,box-shadow,transform] duration-150',
        'outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
        'active:translate-y-px disabled:pointer-events-none',
        // Disabled is one look for every variant: a quiet grey pill, never a
        // faded black or orange slab that reads as broken.
        'disabled:border disabled:border-border disabled:bg-muted disabled:text-oca-subtle disabled:shadow-none',
        '[&_svg]:pointer-events-none [&_svg]:size-[1.1em] [&_svg]:shrink-0',
    ],
    {
        variants: {
            variant: {
                primary: 'bg-primary text-primary-foreground hover:bg-primary/85',
                secondary:
                    'border border-border bg-secondary text-secondary-foreground hover:border-oca-hairline-strong hover:bg-accent',
                brand: 'bg-brand text-brand-foreground hover:bg-oca-orange-deep',
                ghost: 'text-foreground hover:bg-accent',
                danger: 'bg-destructive text-destructive-foreground hover:bg-destructive/90',
                link: 'h-auto rounded-none px-0 text-foreground underline decoration-foreground/35 underline-offset-4 hover:decoration-foreground',
                onInk: 'bg-white text-oca-ink hover:bg-white/90',
                onInkOutline: 'border border-white/20 text-white hover:bg-white/10',
            },
            size: {
                sm: 'h-9 px-4 text-sm',
                md: 'h-11 px-5 text-[0.9375rem]',
                lg: 'h-14 px-7 text-[1.0625rem]',
                icon: 'size-10',
                'icon-sm': 'size-8',
            },
        },
        compoundVariants: [{ variant: 'link', className: 'h-auto px-0' }],
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
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
    { className, variant, size, asChild = false, loading = false, disabled, children, type, ...props },
    ref
) {
    const Comp = asChild ? Slot : 'button';
    return (
        <Comp
            ref={ref}
            data-ui="button"
            className={cn(buttonVariants({ variant, size }), className)}
            disabled={asChild ? undefined : disabled || loading}
            aria-busy={loading || undefined}
            type={asChild ? undefined : (type ?? 'button')}
            {...props}
        >
            {asChild ? (
                children
            ) : (
                <>
                    {loading ? <Spinner className="size-[1.1em]" /> : null}
                    {children}
                </>
            )}
        </Comp>
    );
});
