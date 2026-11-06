import { useEffect, useRef, useState, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { MonoLabel } from './frame';
import type { TocItem } from './hero';

/*
 * A long page's contents (privacy, terms, security, a changelog), as S34 draws them: a column ruled
 * off by a hairline that runs the length of the frame, sticky under the site's bar from 900px, its
 * entries numbered, the one being read marked in ember on the rule; on a phone, folded above the text
 * under "On this page" and its +. Plain links: they work before any script.
 */

/** The text's gutter, the frame's own. */
const GUTTER = 'px-[var(--oca-frame-gutter)]';

/** Where the site's sticky bar ends from 900px (its rule counts 4.5rem), with room under it. */
const UNDER_HEADER = 'top-[calc(4.5rem+1px+2.5rem)] max-h-[calc(100svh-4.5rem-1px-2.5rem)]';

/**
 * Which entry is being read, from where its headings sit on screen: the last one whose top has
 * reached the reading line; before the first one reaches it, the first. At the foot of the page the
 * last heading wins once it is in view, so a short last section can still be marked. `tops` are each
 * heading's distance from the top of the viewport, in page order; a heading not on the page is
 * Infinity. -1 when there are none.
 */
export function activeIndex(tops: readonly number[], line: number, atBottom: boolean, viewport: number): number {
    if (tops.length === 0) return -1;
    const last = tops.length - 1;
    if (atBottom && tops[last]! < viewport) return last;
    let found = 0;
    tops.forEach((top, i) => {
        if (top <= line) found = i;
    });
    return found;
}

/**
 * The id of the entry being read: the last heading at or above a line `top` px from the top of the
 * screen (or `share` of its height). Measured at most once a frame while the page scrolls or resizes,
 * and set only when the entry changes: nothing runs at rest.
 */
export function useActiveEntry(ids: readonly string[], top = 140, share?: number): string | undefined {
    const key = ids.join('|');
    const [active, setActive] = useState<string | undefined>(ids[0]);
    useEffect(() => {
        const list = key.split('|');
        let frame = 0;
        let shown = list[0];
        const measure = () => {
            frame = 0;
            const vh = window.innerHeight;
            const tops = list.map((id) => document.getElementById(id)?.getBoundingClientRect().top ?? Infinity);
            const atBottom = Math.ceil(window.scrollY + vh) >= document.documentElement.scrollHeight - 2;
            const next = list[activeIndex(tops, share ? share * vh : top, atBottom, vh)];
            if (next !== shown) {
                shown = next;
                setActive(next);
            }
        };
        const schedule = () => {
            if (!frame) frame = requestAnimationFrame(measure);
        };
        schedule();
        window.addEventListener('scroll', schedule, { passive: true });
        window.addEventListener('resize', schedule);
        return () => {
            window.removeEventListener('scroll', schedule);
            window.removeEventListener('resize', schedule);
            if (frame) cancelAnimationFrame(frame);
        };
    }, [key, top, share]);
    return active;
}

/**
 * The text beside its contents: a column for `nav`, ruled off by a hairline and sticky under the
 * site's bar, from 900px; above the text, folded, on a phone. Put it on a Frame with `padded={false}`
 * so the rule meets the frame's.
 */
export function DocColumns({ nav, children, className }: { nav: ReactNode; children: ReactNode; className?: string }) {
    return (
        <div data-oca-doc-columns="" className={cn('grid grid-cols-1 min-[900px]:grid-cols-[15.5rem_minmax(0,1fr)] xl:grid-cols-[18.5rem_minmax(0,1fr)]', className)}>
            <div className="min-w-0 border-b border-border min-[900px]:border-b-0 min-[900px]:border-r">{nav}</div>
            <div className={cn('min-w-0 pb-20 pt-10 md:pb-28 min-[900px]:pl-16 min-[900px]:pt-14', GUTTER)}>{children}</div>
        </div>
    );
}

export interface TocProps {
    entries: readonly TocItem[];
    /** Under the list in the sticky column, from 900px: a note, a link, a status. */
    aside?: ReactNode;
    /** The reading line, in px from the top of the screen. Default 140. */
    top?: number;
    /** The reading line as a share of the screen's height, in place of `top`. */
    share?: number;
}

/** A page's numbered contents for DocColumns' `nav`, linking to its own headings, the one being read marked. */
export function Toc({ entries, aside, top = 140, share }: TocProps) {
    const active = useActiveEntry(
        entries.map((e) => e.id),
        top,
        share
    );
    // On a short screen the sticky list scrolls inside itself: keep the marked entry in it.
    const sticky = useRef<HTMLElement>(null);
    useEffect(() => {
        const nav = sticky.current;
        const link = nav?.querySelector<HTMLElement>('[aria-current="location"]');
        if (!nav || !link || nav.scrollHeight <= nav.clientHeight) return;
        const start = link.offsetTop;
        const end = start + link.offsetHeight;
        if (start < nav.scrollTop) nav.scrollTop = start - 16;
        else if (end > nav.scrollTop + nav.clientHeight) nav.scrollTop = end - nav.clientHeight + 16;
    }, [active]);
    const list = (
        <ol className="border-l border-border">
            {entries.map((e) => {
                const here = active === e.id;
                return (
                    <li key={e.id}>
                        <a
                            href={`#${e.id}`}
                            aria-current={here ? 'location' : undefined}
                            className={cn(
                                // 44px tall; the mark is this link's own left edge, over the list's rule.
                                '-ml-px flex min-h-11 items-baseline gap-3 border-l-2 py-2.5 pl-4 pr-1 text-[0.875rem] leading-snug transition-colors',
                                here ? 'border-oca-accent-display text-foreground' : 'border-transparent text-muted-foreground hover:text-foreground'
                            )}
                        >
                            <span className="w-5 shrink-0 font-mono text-[0.75rem] tabular-nums text-oca-subtle">{e.num}</span>
                            <span>{e.label}</span>
                        </a>
                    </li>
                );
            })}
        </ol>
    );
    return (
        <>
            <nav ref={sticky} aria-label="On this page" className={cn('sticky hidden flex-col gap-8 overflow-y-auto pb-10 pl-8 pr-5 pt-12 min-[900px]:flex xl:pl-10', UNDER_HEADER)}>
                <div className="flex flex-col gap-4">
                    <MonoLabel mark={false}>On this page</MonoLabel>
                    {list}
                </div>
                {aside}
            </nav>
            <details className="group min-[900px]:hidden">
                <summary className={cn('flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 [&::-webkit-details-marker]:hidden', GUTTER)}>
                    <MonoLabel as="span" mark={false}>
                        On this page
                    </MonoLabel>
                    <span aria-hidden className="font-mono text-[1.125rem] leading-none text-muted-foreground transition-transform duration-300 group-open:rotate-45">
                        +
                    </span>
                </summary>
                <nav aria-label="On this page" className={cn('pb-6 pt-1', GUTTER)}>
                    {list}
                </nav>
            </details>
        </>
    );
}
