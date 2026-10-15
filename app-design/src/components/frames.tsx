import type { CSSProperties, ReactNode } from 'react';

import { cn } from '../lib/cn';

/*
 * The product shown as an object: a phone, a browser window, a card floating
 * beside them. They hold real-looking UI drawn from the system's own parts, so
 * a page shows what a person will see instead of describing it.
 */

/** A phone with an ink bezel and a rounded screen. Children are the screen. */
export function PhoneFrame({ className, style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) {
    return (
        <div
            className={cn(
                'relative w-[17.5rem] shrink-0 rounded-[2.9rem] bg-[#0b0b0c] p-[0.6rem]',
                'shadow-[0_50px_100px_-40px_rgb(10_10_10/0.55),0_0_0_1px_rgb(255_255_255/0.06)_inset]',
                className
            )}
            style={style}
        >
            <div className="relative aspect-[9/19.2] overflow-hidden rounded-[2.35rem] bg-background">
                <div aria-hidden className="absolute left-1/2 top-2.5 z-10 h-[1.35rem] w-[5.6rem] -translate-x-1/2 rounded-full bg-[#0b0b0c]" />
                {children}
            </div>
        </div>
    );
}

/** A browser window with its address. Children are the page. */
export function BrowserFrame({
    url = 'ochk.app',
    className,
    style,
    children,
}: {
    url?: string;
    className?: string;
    style?: CSSProperties;
    children: ReactNode;
}) {
    return (
        <div
            className={cn(
                'overflow-hidden rounded-[1.1rem] border border-border bg-card',
                'shadow-[0_40px_90px_-40px_rgb(10_10_10/0.45)]',
                className
            )}
            style={style}
        >
            <div className="flex h-10 items-center gap-3 border-b border-border px-4">
                <div aria-hidden className="flex gap-1.5">
                    <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                    <span className="size-2.5 rounded-full bg-[#febc2e]" />
                    <span className="size-2.5 rounded-full bg-[#28c840]" />
                </div>
                <div className="mx-auto flex h-6 min-w-0 max-w-[60%] flex-1 items-center justify-center rounded-md bg-muted px-3 text-[0.75rem] text-muted-foreground">
                    <span className="truncate">{url}</span>
                </div>
                <span aria-hidden className="w-[2.6rem]" />
            </div>
            <div className="relative">{children}</div>
        </div>
    );
}

/** A small card that floats beside a picture: one fact, with an icon. */
export function FloatChip({
    icon,
    title,
    detail,
    delay = 0,
    className,
    style,
}: {
    icon?: ReactNode;
    title: ReactNode;
    detail?: ReactNode;
    /** Seconds to offset the drift, so neighbours do not move in step. */
    delay?: number;
    className?: string;
    style?: CSSProperties;
}) {
    return (
        <div
            className={cn(
                'oca-animate-drift flex items-center gap-3 rounded-2xl border border-border bg-card/90 py-2.5 pl-2.5 pr-4 backdrop-blur-md',
                'shadow-[0_24px_50px_-24px_rgb(10_10_10/0.35)]',
                className
            )}
            style={{ animationDelay: `${-delay}s`, ...style }}
        >
            {icon ? (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-muted text-foreground [&_svg]:size-4">
                    {icon}
                </span>
            ) : null}
            <span className="flex min-w-0 flex-col">
                <span className="text-[0.875rem] font-medium leading-tight">{title}</span>
                {detail ? <span className="text-[0.8125rem] leading-tight text-muted-foreground">{detail}</span> : null}
            </span>
        </div>
    );
}
