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
                // A lighter bezel in dark mode, or the phone dissolves into the page.
                'relative w-[17.5rem] shrink-0 rounded-[2.9rem] bg-[#0b0b0c] p-[0.6rem] dark:bg-[#2a2a2d]',
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

/**
 * A browser window with its address. Children are the page. `paper` is the
 * product as a depiction on a page of paper: a white screen with the 12px
 * corner pictures of products keep, a plain bar with no address when `url`
 * is null, and with `glow`, an orange light behind it.
 */
export function BrowserFrame({
    url = 'ochk.app',
    variant = 'default',
    glow = false,
    className,
    style,
    children,
}: {
    url?: string | null;
    variant?: 'default' | 'paper';
    glow?: boolean;
    className?: string;
    style?: CSSProperties;
    children: ReactNode;
}) {
    const paper = variant === 'paper';
    const frame = (
        <div
            data-frame={variant}
            className={cn(
                'relative overflow-hidden',
                // 2.0's depiction shadow (tokens.css), drawn tight to the window.
                paper
                    ? 'rounded-depict bg-oca-surface text-oca-surface-foreground shadow-[var(--oca-shadow-depict)]'
                    : 'rounded-depict border border-border bg-card shadow-[var(--oca-shadow-depict)]',
                !glow && className
            )}
            style={glow ? undefined : style}
        >
            <div className={cn('flex h-10 items-center gap-3 border-b px-4', paper ? 'border-oca-surface-foreground/10 bg-oca-surface-foreground/[0.04]' : 'border-border')}>
                <div aria-hidden className="flex gap-1.5">
                    <span className="size-2.5 rounded-full bg-[#ff5f57]" />
                    <span className="size-2.5 rounded-full bg-[#febc2e]" />
                    <span className="size-2.5 rounded-full bg-[#28c840]" />
                </div>
                {url ? (
                    <div className="mx-auto flex h-6 min-w-0 max-w-[60%] flex-1 items-center justify-center rounded-md bg-muted px-3 text-[0.75rem] text-muted-foreground">
                        <span className="truncate">{url}</span>
                    </div>
                ) : null}
                {url ? <span aria-hidden className="w-[2.6rem]" /> : null}
            </div>
            <div className="relative">{children}</div>
        </div>
    );
    if (!glow) return frame;
    return (
        <div className={cn('relative isolate', className)} style={style}>
            {/* The light behind the screen: a still gradient, no blur filter to raster. On a phone it stays within the
                frame's width, so it never widens the page. */}
            <div
                aria-hidden
                data-frame-glow=""
                className="pointer-events-none absolute inset-x-0 -inset-y-[min(20%,3rem)] -z-10 bg-[image:var(--oca-glow)] md:-inset-x-[12%]"
            />
            {frame}
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
                'oca-animate-drift flex items-center gap-3 rounded-none border border-border bg-card/90 py-2.5 pl-2.5 pr-4 backdrop-blur-md',
                'shadow-[0_24px_50px_-24px_rgb(10_10_10/0.35)]',
                className
            )}
            style={{ animationDelay: `${-delay}s`, ...style }}
        >
            {icon ? (
                <span className="flex size-9 shrink-0 items-center justify-center rounded-none bg-muted text-foreground [&_svg]:size-4">
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
