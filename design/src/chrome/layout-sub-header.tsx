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
    /** Right-side capability tags, joined by "·" separators. */
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
 * LayoutSubHeader — the ecosystem status strip below the header. Identical in
 * shape across all six verb sites (heartbeat + status + product on the left,
 * capability tags on the right); only the content varied, so each site forked
 * it. Now parameterized: pass `product`, optional `status`, and `tags`.
 */
export function LayoutSubHeader({
    product,
    status = 'live · mainnet',
    tags = [],
    noHeartbeat = false,
    className,
}: LayoutSubHeaderProps) {
    return (
        <div className={cn('border-b', className)}>
            <div className="container flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2 font-mono text-[11px]">
                <div className="flex items-center gap-3">
                    {!noHeartbeat && (
                        <span className="bg-primary inline-block h-1.5 w-1.5 animate-pulse rounded-full" />
                    )}
                    <span className="text-muted-foreground tracking-widest uppercase">{status}</span>
                    <span className="text-foreground">{product}</span>
                </div>
                {tags.length > 0 && (
                    <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 gap-y-1 tracking-widest uppercase">
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
