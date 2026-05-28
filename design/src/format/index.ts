/**
 * @orangecheck/design/format — Bitcoin/money display + formatting utilities.
 *
 * Presentational only. Lifted from the canonical implementations across the
 * family (oc-me-web's utils, oc-vault-web's billing) and standardized so every
 * site formats sats, prices, addresses, and times identically. NOTE: crypto
 * (BIP-322 signing, bech32 validation) deliberately does NOT live here — that
 * belongs in a bitcoin/crypto library, not the design system.
 *
 * Includes the `useSpotPrice` React hook for live BTC/USD display. The hook
 * fetches a consumer-hosted endpoint — see `use-spot-price.ts` for the
 * one-route-per-consumer contract.
 */

export { useSpotPrice, type SpotPrice, type UseSpotPriceOptions } from './use-spot-price';

/** Reference BTC/USD rate for sats↔USD display. Override per call when a live
 *  rate is available; this is a display affordance, not a price oracle. */
export const REFERENCE_BTC_USD = 95_000;

/** Format a satoshi integer as a thousands-separated string ("12,408"). */
export function formatSats(sats: number): string {
    return new Intl.NumberFormat('en-US').format(Math.round(sats));
}

/** Compact sats for buttons/chips: "7k sats", "1.5k sats", "999 sats". */
export function formatSatsCompact(sats: number): string {
    const n = Math.round(sats);
    if (n < 1000) return `${n} sats`;
    const k = n / 1000;
    return `${Number.isInteger(k) ? k : k.toFixed(1)}k sats`;
}

/** Convert sats to a USD currency string using the reference (or given) rate. */
export function satsToUsd(sats: number, btcUsd: number = REFERENCE_BTC_USD): string {
    const usd = (sats / 100_000_000) * btcUsd;
    if (usd > 0 && usd < 0.01) return '< $0.01';
    // Whole dollars once >= $100, cents below. min must never exceed max.
    const fractionDigits = usd >= 100 ? 0 : 2;
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: fractionDigits,
        maximumFractionDigits: fractionDigits,
    }).format(usd);
}

/** Convert a USD amount to sats using the reference (or given) rate. */
export function usdToSats(usd: number, btcUsd: number = REFERENCE_BTC_USD): number {
    return Math.round((usd / btcUsd) * 100_000_000);
}

/** Both denominations as one label: "7,000 sats · $6.65". */
export function priceBoth(sats: number, btcUsd: number = REFERENCE_BTC_USD): string {
    return `${formatSats(sats)} sats · ${satsToUsd(sats, btcUsd)}`;
}

/**
 * "as of HH:MM" provenance footnote. Returns `null` for nullish or
 * unparseable input so callers can render nothing
 * (`{x && <span>{x}</span>}`) rather than gate on a magic empty
 * string. 24-hour, locale-aware. Pairs with `useSpotPrice().fetchedAt`
 * to caption a live-rate display.
 */
export function asOf(iso: string | null | undefined): string | null {
    if (!iso) return null;
    const t = new Date(iso);
    if (Number.isNaN(t.getTime())) return null;
    return `as of ${t.toLocaleTimeString(undefined, {
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    })}`;
}

/** Compact relative time — "now", "3m ago", "2h ago", "4d ago", or a date. */
export function relativeTime(when: string | number | Date): string {
    const t = when instanceof Date ? when.getTime() : new Date(when).getTime();
    if (Number.isNaN(t)) return '';
    const diff = Date.now() - t;
    const m = Math.floor(diff / 60_000);
    if (m < 1) return 'now';
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 30) return `${d}d ago`;
    const mo = Math.floor(d / 30);
    if (mo < 12) return `${mo}mo ago`;
    return `${Math.floor(mo / 12)}y ago`;
}

/**
 * Truncate a Bitcoin/Lightning address (or any long id) for display:
 * "bc1qxy…wxyz". Defaults match the family's most common rule (8 head / 4 tail).
 */
export function shortenAddress(value: string, head = 8, tail = 4): string {
    if (!value) return '';
    if (value.length <= head + tail + 1) return value;
    return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export type ExplorerNetwork = 'mainnet' | 'testnet' | 'signet';
export type ExplorerTarget =
    | { address: string }
    | { tx: string }
    | { block: string | number };

/** A mempool.space explorer URL for an address, tx, or block. */
export function explorerUrl(target: ExplorerTarget, network: ExplorerNetwork = 'mainnet'): string {
    const base =
        network === 'mainnet'
            ? 'https://mempool.space'
            : `https://mempool.space/${network}`;
    if ('address' in target) return `${base}/address/${target.address}`;
    if ('tx' in target) return `${base}/tx/${target.tx}`;
    return `${base}/block/${target.block}`;
}
