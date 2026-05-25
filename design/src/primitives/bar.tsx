import { cn } from '../tokens/cn';

export interface BarProps {
    /** 0–100; clamped. */
    pct: number;
    accent?: 'primary' | 'warning' | 'destructive' | 'success';
    label?: string;
    right?: string;
    className?: string;
}

const ACCENT: Record<NonNullable<BarProps['accent']>, string> = {
    primary: 'bg-primary',
    warning: 'bg-warning',
    destructive: 'bg-destructive',
    success: 'bg-success',
};

/** Horizontal capacity/progress bar with optional label + right-aligned value. */
export function Bar({ pct, accent = 'primary', label, right, className }: BarProps) {
    const clamped = Math.max(0, Math.min(100, pct));
    return (
        <div className={cn(className)}>
            {(label || right) && (
                <div className="flex items-baseline justify-between font-mono text-[10.5px] tracking-widest uppercase">
                    {label && <span className="text-muted-foreground">{label}</span>}
                    {right && <span className="text-foreground tabular-nums">{right}</span>}
                </div>
            )}
            <div className="bg-muted mt-1.5 h-1.5 w-full overflow-hidden">
                <div className={cn('h-full', ACCENT[accent])} style={{ width: `${clamped}%` }} />
            </div>
        </div>
    );
}
