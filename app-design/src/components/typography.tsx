import { createElement, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '../lib/cn';

/** The small orange line above a heading ("How it works", "The honest version"). */
export function Eyebrow({ className, onInk, ...props }: HTMLAttributes<HTMLParagraphElement> & { onInk?: boolean }) {
    return <p className={cn('oca-eyebrow', onInk && 'text-oca-ink-eyebrow', className)} {...props} />;
}

type DisplayLevel = 1 | 2 | 3;

export interface DisplayProps extends HTMLAttributes<HTMLHeadingElement> {
    /** Visual size. The element follows unless `as` says otherwise. */
    level?: DisplayLevel;
    as?: 'h1' | 'h2' | 'h3' | 'p';
}

/** Headlines: regular weight, tight, balanced. */
export function Display({ level = 2, as, className, ...props }: DisplayProps) {
    const tag = as ?? (`h${level}` as const);
    return createElement(tag, { className: cn(`oca-display-${level}`, className), ...props });
}

/** The one orange word ("cost something *real*."). Display sizes only: as small
 *  text this orange would fail contrast. */
export function Accent({ children, className }: { children: ReactNode; className?: string }) {
    return <span className={cn('text-oca-accent-display', className)}>{children}</span>;
}

export function Lead({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
    return <p className={cn('oca-lead max-w-[40rem]', className)} {...props} />;
}

/** Fine print under a section ("Who holds what today: …"). */
export function Footnote({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
    return <p className={cn('text-[0.9375rem] text-muted-foreground', className)} {...props} />;
}

/** Body copy for long-form pages: measured line length, calm rhythm. */
export function Prose({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
    return (
        <div
            className={cn(
                'max-w-[42rem] text-[1.0625rem] leading-[1.7] text-muted-foreground',
                '[&_h2]:oca-display-3 [&_h2]:mb-4 [&_h2]:mt-14 [&_h2]:text-foreground',
                '[&_h3]:oca-title [&_h3]:mb-3 [&_h3]:mt-10 [&_h3]:text-foreground',
                '[&_p]:my-4 [&_strong]:font-medium [&_strong]:text-foreground',
                '[&_a]:text-foreground [&_a]:underline [&_a]:decoration-border [&_a]:underline-offset-4 hover:[&_a]:decoration-foreground',
                '[&_ul]:my-4 [&_ul]:list-disc [&_ul]:pl-5 [&_li]:my-1.5 [&_code]:text-foreground',
                className
            )}
            {...props}
        />
    );
}
