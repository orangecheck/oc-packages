import { useEffect, useRef } from 'react';

import { cn } from '../lib/cn';
import { Mark } from './mark';

export interface IsoCheckProps {
    /** Width in px; the check keeps its 2:1 grid. */
    size?: number;
    /** Drop it into place on first paint, the deck's closing gesture. */
    settle?: boolean;
    /** A soft floor shadow, so it reads as an object on the canvas. */
    shadow?: boolean;
    /** Turn a few degrees toward the pointer, with a warm light behind it. */
    tilt?: boolean;
    title?: string;
    className?: string;
}

/** The isometric check as an object: the deck's closing illustration. */
export function IsoCheck({ size = 360, settle = false, shadow = true, tilt = false, title, className }: IsoCheckProps) {
    const ref = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const el = ref.current;
        if (!el || !tilt || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
        let raf = 0;
        let tx = 0;
        let ty = 0;
        let x = 0;
        let y = 0;
        const step = () => {
            x += (tx - x) * 0.08;
            y += (ty - y) * 0.08;
            el.style.setProperty('--rx', `${(-y * 10).toFixed(2)}deg`);
            el.style.setProperty('--ry', `${(x * 14).toFixed(2)}deg`);
            raf = Math.abs(tx - x) + Math.abs(ty - y) > 0.001 ? requestAnimationFrame(step) : 0;
        };
        const move = (e: PointerEvent) => {
            const b = el.getBoundingClientRect();
            tx = Math.max(-1, Math.min(1, (e.clientX - (b.left + b.width / 2)) / (window.innerWidth / 2)));
            ty = Math.max(-1, Math.min(1, (e.clientY - (b.top + b.height / 2)) / (window.innerHeight / 2)));
            if (!raf) raf = requestAnimationFrame(step);
        };
        window.addEventListener('pointermove', move, { passive: true });
        return () => {
            cancelAnimationFrame(raf);
            window.removeEventListener('pointermove', move);
        };
    }, [tilt]);

    return (
        <div
            ref={ref}
            className={cn('relative inline-block', settle && 'oca-animate-settle', className)}
            style={{ width: size, perspective: tilt ? 900 : undefined }}
        >
            {tilt ? (
                <div
                    aria-hidden
                    className="absolute left-1/2 top-1/2 -z-0 aspect-square w-[120%] -translate-x-1/2 -translate-y-1/2 rounded-full opacity-70 blur-3xl"
                    style={{ background: 'radial-gradient(closest-side, rgb(255 140 70 / 0.35), transparent)' }}
                />
            ) : null}
            <div
                className="relative z-10 transition-transform duration-300 ease-out"
                style={tilt ? { transform: 'rotateX(var(--rx, 0deg)) rotateY(var(--ry, 0deg))', transformStyle: 'preserve-3d' } : undefined}
            >
                <Mark size={size} title={title} className="block" />
            </div>
            {shadow ? (
                <div
                    aria-hidden
                    className="absolute left-[8%] right-[8%] rounded-[50%] opacity-60 blur-xl"
                    style={{ height: size * 0.08, bottom: -size * 0.04, background: 'rgb(234 88 11 / 0.18)' }}
                />
            ) : null}
        </div>
    );
}
