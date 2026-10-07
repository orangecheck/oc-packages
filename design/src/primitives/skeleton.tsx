import { cn } from '../tokens/cn';

export interface SkeletonProps {
    className?: string;
}

/** Inert shimmer placeholder. Pulses subtly while data is loading. */
export function Skeleton({ className }: SkeletonProps) {
    return <div className={cn('bg-foreground/10 animate-pulse rounded-sm', className)} />;
}
