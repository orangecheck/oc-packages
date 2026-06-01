import type { CSSProperties } from 'react';

import { cn } from './cn';

export interface OcAuroraProps {
    /**
     * Master intensity multiplier (default 1, from the theme CSS). Overrides
     * `--oc-aurora-intensity` for this mount — e.g. dial a reading-heavy site down.
     */
    intensity?: number;
    className?: string;
}

const BLOBS = [1, 2, 3, 4, 5] as const;

/**
 * The ambient "bitcoin aurora" background — soft, theme-reactive colour clouds
 * that slowly wander (styling in styles/aurora.css; recolours from --brand /
 * --success / --info / --primary across mode + skin). Pure markup, fixed behind
 * all content; `OcThemeProvider` mounts it by default. Mount manually only if a
 * site renders the aurora outside the provider.
 */
export function OcAurora({ intensity, className }: OcAuroraProps) {
    const style =
        intensity == null
            ? undefined
            : ({ '--oc-aurora-intensity': String(intensity) } as CSSProperties);
    return (
        <div className={cn('oc-aurora', className)} style={style} aria-hidden="true">
            {BLOBS.map((n) => (
                <div key={n} className={`oc-aurora__blob oc-aurora__blob-${n}`} />
            ))}
        </div>
    );
}
