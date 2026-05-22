import { cn } from '../tokens/cn';

export interface SkeletonProps {
    className?: string;
}

/** Inert shimmer placeholder. Pulses subtly while data is loading. */
export function Skeleton({ className }: SkeletonProps) {
    return <div className={cn('bg-muted/40 animate-pulse rounded-sm', className)} />;
}
