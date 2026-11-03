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
 *   // `ok` is your final allowlist; `rejected` explains why each address was
 *   // dropped; `unread` lists the ones nothing could be concluded about.
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
     * What to do with candidates that are still unread after the retries: the
     * chain or the relays did not answer, or the lookup threw. `true`
     * (default): leave them off `ok` and list them in `unread`, never in
     * `rejected`, so no airdrop goes to an address nobody checked and nobody
     * is dropped as if they fell short. `false`: throw an `AirdropUnreadError`
     * carrying the whole result, so nothing ships without your decision.
     */
    rejectOnError?: boolean;

    /**
     * How many more times to check a candidate that came back unread: no
     * chain API or relay answered, or the lookup threw. Default 2. A candidate
     * whose address holds more coins than the chain API lists, or whose lookup
     * the API refused, is not checked again: asking again does not help.
     */
    retryUnread?: number;

    /** How long to wait before each retry, in ms. Default 30 000, a rate-limit window. */
    retryDelayMs?: number;
}

/** The options `filterAllowlist` reads. */
const KNOWN_OPTIONS: ReadonlySet<string> = new Set<keyof FilterAllowlistOptions>([
    'minSats',
    'minDays',
    'concurrency',
    'onProgress',
    'relays',
    'rejectOnError',
    'retryUnread',
    'retryDelayMs',
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
    /**
     * Present when nothing was concluded about the address: which read did not
     * finish (`chain_unread`, `utxo_cap_unread`, `provider_refused_unread`,
     * `attestation_unread`, `stake_unread`), or `lookup_error` when the lookup
     * threw. Such a decision is in `unread`, never in `rejected`.
     */
    unread?: string;
    /** Underlying SDK result, present unless the lookup threw. */
    check?: CheckResult;
}

export interface FilterAllowlistResult {
    /** Addresses that passed the filter. In the same order as the input list. */
    ok: string[];
    /** Candidates that were checked and fell short, with reasons. */
    rejected: AirdropDecision[];
    /**
     * Candidates nothing could be concluded about, even after the retries.
     * Left off `ok`; decide about them yourself, or run them again later.
     */
    unread: AirdropDecision[];
    /** Every decision in input order: `ok` ∪ `rejected` ∪ `unread`. */
    all: AirdropDecision[];
}

/** Thrown with `rejectOnError: false` when a candidate is still unread after the retries. */
export class AirdropUnreadError extends Error {
    constructor(readonly result: FilterAllowlistResult) {
        super(
            `@orangecheck/airdrop-gate: ${result.unread.length} candidate(s) could not be checked: ` +
                result.unread
                    .slice(0, 5)
                    .map((d) => `${d.address} (${d.unread})`)
                    .join(', ')
        );
        this.name = 'AirdropUnreadError';
    }
}

/** Reads that did not finish, most decisive first (sdk 1.21.0's unreadReason, read here by name). */
const UNREAD = [
    'utxo_cap_unread',
    'provider_refused_unread',
    'chain_unread',
    'attestation_unread',
    'stake_unread',
] as const;
/** Asking again does not help with these. */
const FINAL_UNREAD: ReadonlySet<string> = new Set(['utxo_cap_unread', 'provider_refused_unread']);

/**
 * Which read did not finish, or null when check() concluded. Before sdk
 * 1.21.0, a chain API that never answered came back as `bad_request` beside a
 * verified signature (with `below_min_*` on top): that is unread too, never a
 * candidate who fell short.
 */
function unreadOf(result: CheckResult): string | null {
    if (result.ok) return null;
    const reasons = result.reasons ?? [];
    const named = UNREAD.find((u) => reasons.includes(u));
    if (named) return named;
    const sigOk = reasons.some((r) => r === 'sig_ok_bip322' || r === 'sig_ok_legacy');
    return sigOk && reasons.includes('bad_request') ? 'chain_unread' : null;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

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
        retryUnread = 2,
        retryDelayMs = 30_000,
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

    const decide = async (address: string): Promise<AirdropDecision> => {
        try {
            const result = await check({
                addr: address,
                minSats,
                minDays,
                ...(relays ? { relays } : {}),
            });
            const unread = unreadOf(result);
            return {
                address,
                ok: result.ok,
                reasons: result.ok ? [] : (result.reasons ?? []),
                check: result,
                ...(unread ? { unread } : {}),
            };
        } catch (err) {
            // A lookup that threw concluded nothing: unread, checked again below.
            return {
                address,
                ok: false,
                reasons: ['lookup_error', err instanceof Error ? err.message : String(err)],
                unread: 'lookup_error',
            };
        }
    };

    let done = 0;
    const decisions = await runWithConcurrency(unique, concurrency, async (address) => {
        const decision = await decide(address);
        done++;
        onProgress?.(done, unique.length, decision);
        return decision;
    });

    // Unread candidates are asked again after a rate-limit window, never dropped.
    for (let round = 0; round < retryUnread; round++) {
        const again = decisions.flatMap((d, i) => (d.unread && !FINAL_UNREAD.has(d.unread) ? [i] : []));
        if (again.length === 0) break;
        await sleep(retryDelayMs);
        await runWithConcurrency(again, concurrency, async (i) => {
            decisions[i] = await decide(decisions[i]!.address);
        });
    }

    const ok: string[] = [];
    const rejected: AirdropDecision[] = [];
    const unread: AirdropDecision[] = [];
    for (const d of decisions) {
        if (d.ok) ok.push(d.address);
        else if (d.unread) unread.push(d);
        else rejected.push(d);
    }

    const result = { ok, rejected, unread, all: decisions };
    if (unread.length > 0 && !rejectOnError) throw new AirdropUnreadError(result);
    return result;
}
