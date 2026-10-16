import type { HTMLAttributes } from 'react';

import { cn } from '../lib/cn';

/*
 * Sats, always as whole integers with tabular figures. An amount nobody has
 * measured renders as "—" with "unknown" for screen readers, never as 0: a
 * missing balance shown as zero is a false statement about someone's money.
 */

const INT = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const COMPACT = new Intl.NumberFormat('en-US', { notation: 'compact', maximumFractionDigits: 1 });

export interface SatsTextOptions {
    /** Append " sats" (default) or nothing. */
    unit?: 'sats' | 'none';
    /** 1.2K, 3.4M. For dense tables and charts only. */
    compact?: boolean;
    /** Prefix + for positive amounts (credits). */
    signed?: boolean;
}

/** A sats amount as text. Returns null for an unknown amount. */
export function satsText(value: number | null | undefined, opts: SatsTextOptions = {}): string | null {
    if (value == null || !Number.isFinite(value)) return null;
    const whole = Math.trunc(value);
    const body = (opts.compact ? COMPACT : INT).format(Math.abs(whole));
    const sign = whole < 0 ? '−' : opts.signed && whole > 0 ? '+' : '';
    const unit = opts.unit === 'none' ? '' : whole === 1 || whole === -1 ? ' sat' : ' sats';
    return `${sign}${body}${unit}`;
}

export interface SatsProps extends Omit<HTMLAttributes<HTMLSpanElement>, 'children'>, SatsTextOptions {
    value: number | null | undefined;
    /** What to show for an unknown amount. */
    unknown?: string;
}

export function Sats({ value, unit, compact, signed, unknown = '—', className, ...props }: SatsProps) {
    const text = satsText(value, { unit, compact, signed });
    if (text === null) {
        return (
            <span className={cn('oca-tabular text-muted-foreground', className)} {...props}>
                <span aria-hidden>{unknown}</span>
                <span className="sr-only">unknown</span>
            </span>
        );
    }
    return (
        <span className={cn('oca-tabular whitespace-nowrap', className)} {...props}>
            {text}
        </span>
    );
}

/** "≈ $12.34" beside an amount, when a price is known. Renders nothing otherwise. */
export function UsdApprox({
    sats,
    usdPerBtc,
    className,
}: {
    sats: number | null | undefined;
    usdPerBtc: number | null | undefined;
    className?: string;
}) {
    if (sats == null || usdPerBtc == null || !Number.isFinite(sats) || !Number.isFinite(usdPerBtc)) return null;
    const usd = (sats / 1e8) * usdPerBtc;
    // Cents, never fractions of one: under half a cent says so instead of "$0.0012".
    const text =
        usd > 0 && usd < 0.005
            ? '< $0.01'
            : new Intl.NumberFormat('en-US', {
                  style: 'currency',
                  currency: 'USD',
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
              }).format(usd);
    return <span className={cn('oca-tabular text-muted-foreground', className)}>≈ {text}</span>;
}

/** A large figure with its label: balances, totals. */
export function SatsFigure({
    label,
    value,
    hint,
    size = 'md',
    className,
}: {
    label: string;
    value: number | null | undefined;
    hint?: React.ReactNode;
    /** lg: the figure a page leads with, well above the tiles beneath it. */
    size?: 'md' | 'lg';
    className?: string;
}) {
    return (
        <div className={cn('flex flex-col gap-1.5', className)}>
            <span className="text-[0.9375rem] text-muted-foreground">{label}</span>
            <span
                className={cn(
                    'oca-tabular',
                    size === 'lg'
                        ? 'text-[clamp(3rem,2.2rem+3vw,4.75rem)] leading-[0.95] tracking-[-0.045em] [font-family:var(--oc-font-display)]'
                        : 'oca-display-3'
                )}
            >
                <Sats value={value} unit="none" />
                <span className="ml-2 text-[0.5em] tracking-normal text-muted-foreground">sats</span>
            </span>
            {hint ? <span className="text-[0.875rem] text-muted-foreground">{hint}</span> : null}
        </div>
    );
}
