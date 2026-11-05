import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';

import { cn } from '../lib/cn';
import { visibleObserver } from '../lib/viewport';

/*
 * A line that runs sideways forever, in CSS: the content twice, the second
 * copy hidden from screen readers and from the tab order. It pauses while it
 * is off screen, under the pointer, while something in it has focus, and on
 * its own button (it moves for more than five seconds, so it must stop when
 * asked). Under reduced motion it does not move at all: the content wraps.
 */

export interface MarqueeProps {
    children: ReactNode;
    /** Pixels a second. */
    speed?: number;
    /** The pause button's words. */
    labels?: { pause?: string; play?: string };
    className?: string;
    style?: CSSProperties;
}

export function Marquee({ children, speed = 60, labels, className, style }: MarqueeProps) {
    const ref = useRef<HTMLDivElement>(null);
    const copy = useRef<HTMLDivElement>(null);
    const [stopped, setStopped] = useState(false);

    useEffect(() => {
        const el = ref.current;
        const one = copy.current;
        if (!el || !one) return;
        // One copy's width at `speed` sets the loop's length, so every marquee runs at the same pace.
        const fit = () => el.style.setProperty('--oca-marquee-duration', `${Math.max(4, one.offsetWidth / speed).toFixed(2)}s`);
        fit();
        const ro = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(fit) : null;
        ro?.observe(one);
        const io =
            typeof IntersectionObserver !== 'undefined'
                ? visibleObserver(([e]) => {
                      if (e?.isIntersecting) delete el.dataset.away;
                      else el.dataset.away = '';
                  })
                : null;
        io?.observe(el);
        return () => {
            ro?.disconnect();
            io?.disconnect();
        };
    }, [speed]);

    const words = { pause: 'Pause the moving line', play: 'Play the moving line', ...labels };
    return (
        <div ref={ref} className={cn('oca-marquee', className)} style={style} data-stopped={stopped || undefined}>
            <div className="oca-marquee-window">
                <div className="oca-marquee-track">
                    <div ref={copy} className="oca-marquee-copy">
                        {children}
                    </div>
                    <div className="oca-marquee-copy" aria-hidden inert>
                        {children}
                    </div>
                </div>
            </div>
            <button
                type="button"
                className="oca-marquee-control"
                aria-pressed={stopped}
                aria-label={stopped ? words.play : words.pause}
                title={stopped ? words.play : words.pause}
                onClick={() => setStopped((s) => !s)}
            >
                <svg viewBox="0 0 16 16" width="12" height="12" aria-hidden>
                    {stopped ? <path d="M4.5 3v10l8-5z" fill="currentColor" /> : <path d="M4 3h3v10H4zM9 3h3v10H9z" fill="currentColor" />}
                </svg>
            </button>
        </div>
    );
}
