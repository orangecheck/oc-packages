import { Children, createElement, useEffect, useRef, type HTMLAttributes, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { prefersStill, useMotionSetting } from './env';
import { schedule } from './scheduler';

/*
 * Numbered cards that stack as you scroll: each sticks under the header, and
 * as the next one slides over it the covered card leans back a little,
 * shrinks and dims. Sticky does the moving; script only writes each card's
 * `--p` (0 to 1, how covered it is) on scroll, and CSS turns it into a
 * transform: no filter, no blur, nothing repainted. Three or more cards make
 * the pattern; under reduced motion they are an ordinary column.
 *
 * The stack keeps its scroll state: in a full-page screenshot the cards a
 * reader has scrolled past show covered. Set data-flat on the stack to lay it
 * out as the ordinary column first.
 */

/** Any other attribute (id, aria-*, data-*) goes on the list. */
export interface StackCardsProps extends Omit<HTMLAttributes<HTMLElement>, 'children'> {
    /** One card per child. */
    children: ReactNode;
    /** Where a card sticks: below the site header. */
    top?: string;
    /** An ordered list by default, so numbered steps stay a list; 'div' for cards that are not one. */
    as?: 'ol' | 'ul' | 'div';
}

export function StackCards({ children, top = '5rem', as = 'ol', className, style, ...rest }: StackCardsProps) {
    const ref = useRef<HTMLElement>(null);
    const setting = useMotionSetting();
    useEffect(() => {
        const el = ref.current;
        if (!el || prefersStill()) return;
        const items = [...el.children] as HTMLElement[];
        const panels = items.map((i) => i.firstElementChild as HTMLElement | null);
        const ticket = schedule(
            el,
            {
                frame() {
                    // Read every position, then write: one layout per frame.
                    const vh = window.innerHeight;
                    const tops = items.map((i) => i.getBoundingClientRect().top);
                    const stick = items.map((i) => parseFloat(getComputedStyle(i).top) || 0);
                    for (let i = 0; i < items.length - 1; i++) {
                        const p = Math.min(1, Math.max(0, (vh - tops[i + 1]!) / Math.max(1, vh - stick[i + 1]!)));
                        panels[i]?.style.setProperty('--p', p.toFixed(4));
                    }
                    return false;
                },
            },
            { scroll: true }
        );
        ticket.wake();
        return () => ticket.stop();
    }, [setting]);
    return createElement(
        as,
        { ...rest, ref, className: cn('oca-stack', className), style: { '--oca-stack-top': top, ...style } },
        Children.toArray(children).map((child, i) =>
            createElement(as === 'div' ? 'div' : 'li', { key: i, className: 'oca-stack-item', style: { zIndex: i + 1 } }, <div className="oca-stack-panel">{child}</div>)
        )
    );
}
