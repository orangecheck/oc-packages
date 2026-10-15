import { cn } from '../lib/cn';
import { Mark } from './mark';

export interface IsoCheckProps {
    /** Width in px; the check keeps its 2:1 grid. */
    size?: number;
    /** Drop it into place on first paint, the deck's closing gesture. */
    settle?: boolean;
    /** A soft floor shadow, so it reads as an object on the canvas. */
    shadow?: boolean;
    title?: string;
    className?: string;
}

/** The isometric check as an object: the deck's closing illustration. */
export function IsoCheck({ size = 360, settle = false, shadow = true, title, className }: IsoCheckProps) {
    return (
        <div className={cn('relative inline-block', settle && 'oca-animate-settle', className)} style={{ width: size }}>
            <Mark size={size} title={title} className="relative z-10 block" />
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
