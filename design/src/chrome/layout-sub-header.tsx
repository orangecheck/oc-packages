import { cn } from '../tokens/cn';

export interface LayoutSubHeaderTag {
    label: string;
    /** Hide this tag below the given breakpoint (progressive disclosure). */
    hideBelow?: 'sm' | 'md' | 'lg';
}

export interface LayoutSubHeaderProps {
    /** Product label shown after the status, e.g. "oc · stamp". */
    product: string;
    /** Left-side status text. Defaults to "live · mainnet". */
    status?: string;
    /**
     * Right-side capability tag(s). Keep it to ONE short phrase per site —
     * the strip reads as quiet supporting context, not a feature list. A
     * second/third tag is supported (spaced, never comma-jammed) for the rare
     * site that needs it, each with its own `hideBelow`.
     */
    tags?: LayoutSubHeaderTag[];
    /** Hide the pulsing heartbeat dot (e.g. on a degraded surface). */
    noHeartbeat?: boolean;
    className?: string;
}

const HIDE: Record<NonNullable<LayoutSubHeaderTag['hideBelow']>, string> = {
    sm: 'hidden sm:inline',
    md: 'hidden md:inline',
    lg: 'hidden lg:inline',
};

/**
 * LayoutSubHeader — the ecosystem status strip below the header. One line,
 * never wraps. Identical shape across every family surface:
 *
 *   ● live · mainnet   oc · stamp ················· bip-322 · opentimestamps
 *
 * Left cluster (heartbeat + status + product) is the identity; the right
 * cluster is a quiet, low-contrast capability whisper. Below `sm` the strip
 * collapses to just the heartbeat + product so it never wraps or crowds a
 * phone header — the right cluster and the `status` reappear from `sm` up.
 *
 * The band carries a faint skin-tinted translucent shade (`.oc-substrip`) so
 * it has presence on every skin × mode without bleeding the hero/aurora
 * behind it. Pass `product`, optional `status`, and `tags`.
 */
export function LayoutSubHeader({
    product,
    status = 'live · mainnet',
    tags = [],
    noHeartbeat = false,
    className,
}: LayoutSubHeaderProps) {
    return (
        <div className={cn('oc-substrip border-b', className)}>
            <div className="container flex items-center justify-between gap-x-6 py-2 font-mono text-[11px]">
                <div className="flex min-w-0 items-center gap-2.5">
                    {!noHeartbeat && (
                        <span
                            className="bg-primary inline-block size-1.5 shrink-0 animate-pulse rounded-full ring-2 ring-[color-mix(in_oklch,var(--primary),transparent_78%)]"
                            aria-hidden
                        />
                    )}
                    <span className="text-muted-foreground hidden tracking-widest whitespace-nowrap uppercase sm:inline">
                        {status}
                    </span>
                    <span className="text-foreground truncate">{product}</span>
                </div>
                {tags.length > 0 && (
                    <div className="text-muted-foreground/55 hidden shrink-0 items-center gap-x-3 tracking-wider whitespace-nowrap uppercase sm:flex">
                        {tags.map((tag, i) => (
                            <span key={i} className={tag.hideBelow ? HIDE[tag.hideBelow] : undefined}>
                                {tag.label}
                            </span>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
