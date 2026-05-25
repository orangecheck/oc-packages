import { cn } from '../tokens/cn';
import { formatSats, satsToUsd } from '../format';

export interface SatsAmountProps {
    sats: number;
    /** Show the "sats" unit. Default true. */
    unit?: boolean;
    /** Append a muted USD conversion. Default false. */
    usd?: boolean;
    /** Override the reference BTC/USD rate for the USD conversion. */
    btcUsd?: number;
    className?: string;
}

/**
 * Canonical sats display: thousands-grouped, monospace, optional "sats" unit and
 * a muted USD conversion. The one true way to render an amount of sats across
 * the family (replaces scattered formatSats() + inline markup).
 */
export function SatsAmount({ sats, unit = true, usd = false, btcUsd, className }: SatsAmountProps) {
    return (
        <span className={cn('font-mono tabular-nums', className)}>
            {formatSats(sats)}
            {unit && <span className="text-muted-foreground"> sats</span>}
            {usd && (
                <span className="text-muted-foreground">
                    {' · '}
                    {satsToUsd(sats, btcUsd)}
                </span>
            )}
        </span>
    );
}
