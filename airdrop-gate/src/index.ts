/**
 * @orangecheck/airdrop-gate
 *
 * Sybil filter for token airdrops. Turn a candidate list into an allowlist
 * backed by Bitcoin stake: for each address, verify an OrangeCheck proof
 * meeting your thresholds and drop the addresses that don't qualify.
 *
 *   import { filterAllowlist } from '@orangecheck/airdrop-gate';
 *
 *   const { ok, rejected } = await filterAllowlist(candidates, {
 *     minSats:     100_000,
 *     minDays:     30,
 *     concurrency: 8,
 *     onProgress:  (done, total) => console.log(`${done}/${total}`),
 *   });
 *
 *   // `ok` is your final allowlist; `rejected` explains why each address was dropped.
 */

import type { CheckResult } from '@orangecheck/sdk';

import { check } from '@orangecheck/sdk';

export interface FilterAllowlistOptions {
    /** Minimum sats bonded. Default 0. */
    minSats?: number;
    /** Minimum days unspent. Default 0. */
    minDays?: number;

    /**
     * How many concurrent `check()` calls to run. Default 4. Each call runs in
     * this process and reads the Nostr relays and the SDK's default Esplora API
     * (mempool.space), so their rate limits set the ceiling; there is no
     * OrangeCheck-hosted service in the path.
     */
    concurrency?: number;

    /**
     * Progress callback fired after each candidate. Use for UI feedback or
     * cancellation checks.
     */
    onProgress?: (done: number, total: number, last?: AirdropDecision) => void;

    /** Override discovery relays. */
    relays?: string[];

    /**
     * If the SDK throws for a particular address, treat it as rejected. Default
     * `true` — we don't want airdrops going to untested addresses. Set to
     * `false` to surface lookup errors to the caller.
     */
    rejectOnError?: boolean;
}

/** The options `filterAllowlist` reads. */
const KNOWN_OPTIONS: ReadonlySet<string> = new Set<keyof FilterAllowlistOptions>([
    'minSats',
    'minDays',
    'concurrency',
    'onProgress',
    'relays',
    'rejectOnError',
]);

/**
 * Throw on a key `filterAllowlist` does not read. Ignored, a misspelt
 * `minSats` would leave the threshold at 0 and every attested address would
 * make the list.
 */
function checkOptions(options: FilterAllowlistOptions): void {
    if (options === null || typeof options !== 'object') {
        throw new TypeError('@orangecheck/airdrop-gate: options must be an object');
    }
    const unknown = Object.keys(options).filter((k) => !KNOWN_OPTIONS.has(k));
    if (unknown.length > 0) {
        throw new TypeError(
            `@orangecheck/airdrop-gate: unknown option ${unknown.join(', ')}. ` +
                `filterAllowlist reads only ${[...KNOWN_OPTIONS].join(', ')}.`
        );
    }
    // Readers read options.key, which follows the prototype: a known key must be the caller's own.
    const inherited = [...KNOWN_OPTIONS].filter((k) => k in options && !Object.prototype.hasOwnProperty.call(options, k));
    if (inherited.length > 0) {
        throw new TypeError(`@orangecheck/airdrop-gate: option ${inherited.join(', ')} is inherited, not set by the caller`);
    }
}

export interface AirdropDecision {
    /** The candidate address that was checked. */
    address: string;
    /** Whether the address qualifies. */
    ok: boolean;
    /** Reasons list. Empty on pass; populated on fail. */
    reasons: string[];
    /** Underlying SDK result, present unless the lookup threw. */
    check?: CheckResult;
}

export interface FilterAllowlistResult {
    /** Addresses that passed the filter. In the same order as the input list. */
    ok: string[];
    /** Rejected candidates with reasons. */
    rejected: AirdropDecision[];
    /** Every decision in input order — `ok` ∪ `rejected`. */
    all: AirdropDecision[];
}

async function runWithConcurrency<T, U>(
    items: T[],
    workers: number,
    fn: (item: T, index: number) => Promise<U>
): Promise<U[]> {
    const results = new Array<U>(items.length);
    let cursor = 0;

    async function worker() {
        while (true) {
            const i = cursor++;
            if (i >= items.length) return;
            results[i] = await fn(items[i]!, i);
        }
    }

    const pool = Array.from({ length: Math.max(1, workers) }, () => worker());
    await Promise.all(pool);
    return results;
}

/**
 * Filter a candidate address list against OrangeCheck thresholds.
 *
 * The `addresses` array is deduplicated before checking — duplicates would
 * just waste API calls and never change the outcome.
 */
export async function filterAllowlist(
    addresses: string[],
    options: FilterAllowlistOptions = {}
): Promise<FilterAllowlistResult> {
    checkOptions(options);
    const {
        minSats = 0,
        minDays = 0,
        concurrency = 4,
        onProgress,
        relays,
        rejectOnError = true,
    } = options;

    // De-dupe while preserving order.
    const seen = new Set<string>();
    const unique: string[] = [];
    for (const a of addresses) {
        const v = a.trim();
        if (!v || seen.has(v)) continue;
        seen.add(v);
        unique.push(v);
    }

    let done = 0;

    const decisions = await runWithConcurrency(unique, concurrency, async (address) => {
        let decision: AirdropDecision;
        try {
            const result = await check({
                addr: address,
                minSats,
                minDays,
                ...(relays ? { relays } : {}),
            });
            decision = {
                address,
                ok: result.ok,
                reasons: result.ok ? [] : (result.reasons ?? []),
                check: result,
            };
        } catch (err) {
            // rejectOnError=true (default): lookup failures count as fails and are returned.
            // rejectOnError=false: surface the error to the caller so they can decide.
            if (!rejectOnError) throw err;
            decision = {
                address,
                ok: false,
                reasons: ['lookup_error', err instanceof Error ? err.message : String(err)],
            };
        }
        done++;
        onProgress?.(done, unique.length, decision);
        return decision;
    });

    const ok: string[] = [];
    const rejected: AirdropDecision[] = [];
    for (const d of decisions) {
        if (d.ok) ok.push(d.address);
        else rejected.push(d);
    }

    return { ok, rejected, all: decisions };
}
