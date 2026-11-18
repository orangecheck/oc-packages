import type { SVGProps } from 'react';

import { MARK_FACES, MARK_POINTS, MARK_TILE, MARK_VIEWBOX } from '@orangecheck/mark';

import { cn } from '../lib/cn';
import { logoAttrs, type Logo } from './logo';
import { PixelAppIcon, PixelMark, PixelWordmark } from './pixel';
import { pixelFit } from './pixel-fit';

/*
 * The isometric check as the ochk.app design draws it: a chevron with a 3-unit
 * short arm and a 5-unit long arm, one unit thick, its sides four units deep,
 * on a 16×10 box: a near-white check on two oranges. The geometry is
 * @orangecheck/mark's, the package integrators draw it from, so there is one
 * mark; its box is read from there too, so nothing here assumes a shape.
 */

const { top: TOP, left: LEFT, right: RIGHT } = MARK_POINTS;

/** The mark's box in its own units, from the package's viewBox. */
const [, , boxWidth, boxHeight] = MARK_VIEWBOX.split(' ').map(Number) as [number, number, number, number];
export const MARK_BOX = { width: boxWidth, height: boxHeight } as const;

/** The height of a mark `width` wide. */
export const markHeight = (width: number) => (width * MARK_BOX.height) / MARK_BOX.width;

export { MARK_FACES, MARK_POINTS };

export interface MarkProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
    /** Accessible name. Omit to render the mark as decoration. */
    title?: string;
    /** Rendered width in px; height follows the mark's 8:5 box. */
    size?: number;
}

export function Mark({ title, size, className, ...rest }: MarkProps) {
    return (
        <svg
            viewBox={MARK_VIEWBOX}
            width={size}
            height={size ? markHeight(size) : undefined}
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
export function MarkOutline({ className, ...rest }: Omit<SVGProps<SVGSVGElement>, 'children'>) {
    return (
        <svg viewBox={`-0.2 -0.2 ${MARK_BOX.width + 0.4} ${MARK_BOX.height + 0.4}`} aria-hidden className={cn('shrink-0 overflow-visible', className)} {...rest}>
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
                rx={MARK_TILE.radius}
                style={{ fill: 'var(--oca-icon-tile, #0A0A0A)', stroke: 'var(--oca-icon-ring, transparent)' }}
                strokeWidth="0.5"
            />
            <g transform={MARK_TILE.transform}>
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
    /** Icon size in px (the flat mark's width); the word scales with it. */
    size?: number;
    /**
     * `icon` (default): the app icon, a depiction of the app. `flat`: 2.0's page
     * chrome, the flat check (30px wide in a header) and the wordmark in Inter
     * 400 at 0.7 of its width, 21px beside a 30px mark.
     */
    variant?: 'icon' | 'flat';
    className?: string;
    /** Classes for the word alone (ProductLockup hides it on a narrow phone, keeping it for screen readers). */
    nameClassName?: string;
    /**
     * Draw one logo only. Without it both are drawn and the page's switch
     * shows one (brand/logo.ts): the default, or what `?logo=` chose.
     */
    logo?: Logo;
}

/** Icon and wordmark, lowercase, as the deck sets it; the classic and the pixel logo, one shown. */
export function Lockup({ logo, ...props }: LockupProps) {
    if (logo) return logo === 'pixel' ? <PixelLockup {...props} /> : <ClassicLockup {...props} />;
    return (
        <>
            <ClassicLockup {...props} attrs={logoAttrs('classic')} />
            <PixelLockup {...props} attrs={logoAttrs('pixel')} />
        </>
    );
}

type Drawn = Omit<LockupProps, 'logo'> & { attrs?: ReturnType<typeof logoAttrs> };

function ClassicLockup({ name = 'orangecheck', size = 28, variant = 'icon', className, nameClassName, attrs }: Drawn) {
    if (variant === 'flat') {
        return (
            <span
                {...attrs}
                className={cn('inline-flex items-center font-normal tracking-[-0.024em]', className)}
                style={{ gap: size / 3, fontSize: size * 0.7 }}
            >
                <Mark size={size} />
                <span className={nameClassName}>{name}</span>
            </span>
        );
    }
    return (
        <span
            {...attrs}
            className={cn('inline-flex items-center font-medium tracking-[-0.01em]', className)}
            style={{ gap: size * 0.32, fontSize: size * 0.56 }}
        >
            <AppIcon size={size} />
            <span className={nameClassName}>{name}</span>
        </span>
    );
}

/**
 * The pixel lockup at the classic one's size: the word on the grid whose
 * x-height comes nearest Inter's (a header's 30px lockup draws the small grid
 * at 2px a cell, the smaller ones the medium grid at 1px), the flat check on
 * the same grid and cell. Any word other than "orangecheck" stays in type
 * beside the pixel check.
 */
function PixelLockup({ name = 'orangecheck', size = 28, variant = 'icon', className, nameClassName, attrs }: Drawn) {
    const flat = variant === 'flat';
    const fontSize = size * (flat ? 0.7 : 0.56);
    const fit = pixelFit(fontSize);
    const word =
        name === 'orangecheck' ? (
            <PixelWordmark {...fit} className={nameClassName} />
        ) : (
            <span className={cn(flat ? 'font-normal' : 'font-medium', nameClassName)} style={{ fontSize }}>
                {name}
            </span>
        );
    return (
        <span {...attrs} className={cn('inline-flex items-center', className)} style={{ gap: Math.round(flat ? size / 3 : size * 0.32) }}>
            {flat ? <PixelMark {...fit} /> : <PixelAppIcon size={size} />}
            {word}
        </span>
    );
}
