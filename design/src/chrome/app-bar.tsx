import type { ReactNode } from 'react';

import { cn } from '../tokens/cn';

export interface OcAppBarProps {
    /**
     * `'full'` (default) = edge-to-edge app chrome: a `.app-bar` row (responsive
     * gutters, NO max-width), so the header's left/right edges align with a
     * full-bleed app shell below it. `'contained'` = the same row inside
     * `.container` (max-w-screen-xl), identical to the marketing/content header —
     * an escape hatch, rarely needed.
     */
    variant?: 'full' | 'contained';
    /** Logo slot — pass `<OcLogoDropdown>…</OcLogoDropdown>` with the site wordmark. */
    start?: ReactNode;
    /** Center slot — pass `<OcPrimaryNav … />`. Centered, flex-1, min-w-0. */
    center?: ReactNode;
    /** Trailing actions — pass e.g. `<HeaderAccount /><OcAppearanceMenu />`. */
    end?: ReactNode;
    /** Stick to the top of the viewport. Default `true`. Keeps `h-12` (3rem). */
    sticky?: boolean;
    className?: string;
}

/**
 * `OcAppBar` — the sanctioned FULL-BLEED application header for full-screen app
 * surfaces (chat `/app`, the analytics cockpit, the forge console, the me
 * operator plane …). It is the app-surface counterpart to the constrained
 * marketing/content header: the SAME primitives (`OcLogoDropdown` /
 * `OcPrimaryNav` / `OcAccountMenu`) mounted in an edge-to-edge `.app-bar` row
 * (gutters only, no `max-w-screen-xl`) instead of a centered `.container`, so a
 * full-bleed app shell underneath lines up edge-to-edge with the chrome above.
 *
 * Marketing / content / protocol pages keep the constrained `.container`
 * header — never use `OcAppBar` over a `.container`-capped body, or you
 * re-introduce the left/right misalignment this composition exists to fix.
 *
 * Auth-free and brand-free by design: all branding + session chrome arrive
 * through the `start` / `center` / `end` slots, so app sites and content sites
 * share one primitive layer and can never visually drift. The fixed `h-12`
 * (3rem) lets a shell below claim `h-[calc(100dvh-3rem)]`.
 */
export function OcAppBar({
    variant = 'full',
    start,
    center,
    end,
    sticky = true,
    className,
}: OcAppBarProps) {
    return (
        <header
            className={cn(
                'bg-background/90 supports-[backdrop-filter]:bg-background/70 w-full border-b backdrop-blur',
                sticky && 'sticky top-0 z-50',
                className
            )}
        >
            <div
                className={cn(
                    variant === 'full' ? 'app-bar' : 'container',
                    'flex h-12 items-center justify-between gap-4'
                )}
            >
                {start}
                <div className="flex min-w-0 flex-1 justify-center px-2">{center}</div>
                <div className="flex items-center gap-1">{end}</div>
            </div>
        </header>
    );
}
