import type { SVGProps } from 'react';

import { MARK_FACES, MARK_POINTS } from '@orangecheck/mark';

import { cn } from '../lib/cn';

/*
 * The isometric check, measured from the ochk.app design (iteration 2, slide 9) onto a 16×8 grid:
 * a chevron with a 3-unit short arm and a 5-unit long arm, one unit thick,
 * extruded two units. Three faces, three oranges. The geometry is @orangecheck/mark's,
 * the package integrators draw it from, so there is one mark.
 */

const { top: TOP, left: LEFT, right: RIGHT } = MARK_POINTS;

export { MARK_FACES, MARK_POINTS };

export interface MarkProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
    /** Accessible name. Omit to render the mark as decoration. */
    title?: string;
    /** Rendered width in px; height follows the 2:1 grid. */
    size?: number;
}

export function Mark({ title, size, className, ...rest }: MarkProps) {
    return (
        <svg
            viewBox="0 0 16 8"
            width={size}
            height={size ? size / 2 : undefined}
            role={title ? 'img' : undefined}
            aria-hidden={title ? undefined : true}
            className={cn('shrink-0', className)}
            {...rest}
        >
            {title ? <title>{title}</title> : null}
            <polygon points={LEFT} fill={MARK_FACES.left} />
            <polygon points={RIGHT} fill={MARK_FACES.right} />
            <polygon points={TOP} fill={MARK_FACES.top} />
        </svg>
    );
}

/**
 * The mark drawn in hairlines only: the check where a check is missing (an
 * error page). Decoration; the stroke stays the same width at any size.
 */
export function MarkOutline({ className }: { className?: string }) {
    return (
        <svg viewBox="-0.2 -0.2 16.4 8.4" aria-hidden className={cn('shrink-0 overflow-visible', className)}>
            {[TOP, LEFT, RIGHT].map((points) => (
                <polygon
                    key={points}
                    points={points}
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1"
                    strokeLinejoin="round"
                    vectorEffect="non-scaling-stroke"
                />
            ))}
        </svg>
    );
}

export interface AppIconProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
    title?: string;
    size?: number;
}

/** The app icon: the mark on an ink squircle, as in the deck's lockup. */
export function AppIcon({ title, size = 32, className, ...rest }: AppIconProps) {
    return (
        <svg
            viewBox="0 0 24 24"
            width={size}
            height={size}
            role={title ? 'img' : undefined}
            aria-hidden={title ? undefined : true}
            className={cn('shrink-0', className)}
            {...rest}
        >
            {title ? <title>{title}</title> : null}
            <rect
                width="24"
                height="24"
                rx="6.25"
                style={{ fill: 'var(--oca-icon-tile, #0A0A0A)', stroke: 'var(--oca-icon-ring, transparent)' }}
                strokeWidth="0.5"
            />
            <g transform="translate(4.25 8.1) scale(0.97)">
                <polygon points={LEFT} fill={MARK_FACES.left} />
                <polygon points={RIGHT} fill={MARK_FACES.right} />
                <polygon points={TOP} fill={MARK_FACES.top} />
            </g>
        </svg>
    );
}

export interface LockupProps {
    /** The word beside the icon. */
    name?: string;
    /** Icon size in px; the word scales with it. */
    size?: number;
    className?: string;
}

/** Icon and wordmark, lowercase, as the deck sets it. */
export function Lockup({ name = 'orangecheck', size = 28, className }: LockupProps) {
    return (
        <span
            className={cn('inline-flex items-center font-medium tracking-[-0.01em]', className)}
            style={{ gap: size * 0.32, fontSize: size * 0.56 }}
        >
            <AppIcon size={size} />
            <span>{name}</span>
        </span>
    );
}
