/**
 * useSpotPrice — live BTC/USD spot rate for display surfaces.
 *
 * Pulls a JSON shape `{ btc_usd: number, fetched_at?: string | null }`
 * from a consumer-hosted endpoint (default `/api/price/btc-usd`),
 * refreshing every 60 seconds on a setInterval. The initial paint
 * reads `REFERENCE_BTC_USD` so the first frame is never NaN.
 *
 * Consumer contract (read this when wiring):
 *
 *   The hook makes a relative fetch to `endpoint`. Every consumer that
 *   mounts this MUST host that route locally — typically a Next.js
 *   pages-router API route that proxies mempool.space's spot feed and
 *   caches in-process. The canonical implementation lives at
 *   `oc-vault-web/src/pages/api/price/btc-usd.ts` (and the mirror in
 *   `oc-me-web`). Both also host the matching server-side fetch +
 *   cache in `src/lib/price/feed.ts` — that part stays per-consumer
 *   because it's Node-only code that doesn't belong in a UI package.
 *
 *   If you don't have the route yet, pass an explicit endpoint
 *   (e.g. `useSpotPrice({ endpoint: 'https://other-site.ochk.io/api/price/btc-usd' })`)
 *   pointing at a sibling site's endpoint — they're CORS-open.
 *
 * Returns the rich `{ btcUsd, fetchedAt }` shape rather than a bare
 * number so callers that want a provenance caption can render
 * `asOf(fetchedAt)` without a second hook.
 */

'use client';

import { useEffect, useState } from 'react';

import { REFERENCE_BTC_USD } from './index';

export interface SpotPrice {
    /** BTC/USD rate. Falls back to `REFERENCE_BTC_USD` until the first
     *  fetch lands so the initial paint never reads NaN. */
    btcUsd: number;
    /** ISO timestamp the rate was fetched upstream. `null` until the
     *  first successful fetch. Pair with `asOf()` for "as of HH:MM". */
    fetchedAt: string | null;
}

export interface UseSpotPriceOptions {
    /** Override the endpoint path. Defaults to `/api/price/btc-usd` —
     *  the family-canonical proxy route. Useful when consuming a sibling
     *  site's endpoint cross-origin, or when self-hosting the proxy at
     *  a non-default path. */
    endpoint?: string;
    /** Override the refresh cadence in milliseconds. Defaults to 60_000,
     *  matching the upstream mempool.space cache TTL. Lower than ~10s
     *  is wasted bandwidth — the underlying feed doesn't refresh faster. */
    intervalMs?: number;
}

interface SpotPriceResponse {
    btc_usd?: number;
    fetched_at?: string | null;
}

/**
 * Hook · returns the latest BTC/USD spot rate from `endpoint`.
 *
 * Behaviour:
 *   - First mount: synchronous return of `REFERENCE_BTC_USD` (no NaN),
 *     then an async fetch updates state.
 *   - Every `intervalMs` thereafter, a background fetch keeps the rate
 *     fresh while the tab is alive.
 *   - Network blips keep the last-good value — no flash to fallback.
 *   - Unmount cancels both the in-flight read (`cancelled` flag) and
 *     the interval timer.
 */
export function useSpotPrice(opts: UseSpotPriceOptions = {}): SpotPrice {
    const { endpoint = '/api/price/btc-usd', intervalMs = 60_000 } = opts;
    const [state, setState] = useState<SpotPrice>({
        btcUsd: REFERENCE_BTC_USD,
        fetchedAt: null,
    });

    useEffect(() => {
        let cancelled = false;
        async function pull() {
            try {
                const res = await fetch(endpoint);
                if (!res.ok) return;
                const json = (await res.json()) as SpotPriceResponse;
                if (cancelled) return;
                if (typeof json.btc_usd === 'number' && json.btc_usd > 0) {
                    setState({
                        btcUsd: Math.round(json.btc_usd),
                        fetchedAt: json.fetched_at ?? null,
                    });
                }
            } catch {
                // Network blip · keep the last good value, don't flash a
                // fallback. The next poll will recover.
            }
        }
        void pull();
        const t = setInterval(pull, intervalMs);
        return () => {
            cancelled = true;
            clearInterval(t);
        };
    }, [endpoint, intervalMs]);

    return state;
}
