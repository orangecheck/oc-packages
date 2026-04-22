import type { FilterDecision, FilterOptions, MinimalNostrEvent } from './types';

import { check } from '@orangecheck/sdk';

import { TtlLru } from './cache';

const DEFAULT_ALLOW_KINDS = [0, 3, 10002]; // profile meta, contacts, relay list

// Short TTL for lookup-error decisions — acts as a circuit breaker so we
// don't thundering-herd /api/check when upstream is flapping.
const LOOKUP_ERROR_TTL_MS = 5_000;

/**
 * Process-wide cache. The old WeakMap<FilterOptions, …> design meant callers
 * who constructed a fresh options object per event (very common) never
 * produced a cache hit — every event was a cold lookup. Keying by a stable
 * config signature instead lets identical-config callers share.
 */
const caches = new Map<string, TtlLru>();

function configSignature(opts: FilterOptions): string {
    return JSON.stringify([
        opts.minSats ?? 0,
        opts.minDays ?? 0,
        (opts.allowKinds ?? DEFAULT_ALLOW_KINDS).slice().sort(),
        (opts.allowPubkeys ?? []).slice().sort(),
        (opts.relays ?? []).slice().sort(),
        opts.cacheMax ?? 1_000,
        opts.cacheTtlMs ?? 60_000,
    ]);
}

function cacheFor(opts: FilterOptions): TtlLru {
    const sig = configSignature(opts);
    let c = caches.get(sig);
    if (!c) {
        c = new TtlLru(opts.cacheMax ?? 1_000, opts.cacheTtlMs ?? 60_000);
        caches.set(sig, c);
    }
    return c;
}

/**
 * The Nostr public key an OrangeCheck attestation binds is the `nostr:npub…`
 * identity. Events on the wire carry the hex-encoded pubkey. We build the
 * identity lookup key using the hex form and let OrangeCheck's discovery
 * handle both formats.
 */
function identityFor(pubkeyHex: string) {
    return { protocol: 'nostr', identifier: pubkeyHex } as const;
}

function reject(
    reason: FilterDecision['reason'],
    message: string,
    extras?: Partial<FilterDecision>
): FilterDecision {
    return { action: 'reject', reason, message, ...extras };
}

function accept(
    reason: FilterDecision['reason'],
    extras?: Partial<FilterDecision>
): FilterDecision {
    return { action: 'accept', reason, ...extras };
}

/**
 * Decide whether a relay should accept an event based on the OrangeCheck
 * status of the author's pubkey.
 *
 * Framework-agnostic. Use this from a custom relay, nostr-tools, or whatever.
 * For Strfry, see `@orangecheck/relay-filter/strfry`.
 */
export async function filterEvent(
    event: MinimalNostrEvent,
    options: FilterOptions
): Promise<FilterDecision> {
    // Bypass: allowed kinds.
    const allowKinds = options.allowKinds ?? DEFAULT_ALLOW_KINDS;
    if (allowKinds.includes(event.kind)) {
        return finish(event, accept('allowed_kind'), options);
    }

    // Bypass: operator / admin pubkeys.
    if (options.allowPubkeys?.includes(event.pubkey)) {
        return finish(event, accept('allowed_pubkey', { pubkey: event.pubkey }), options);
    }

    // Check cache keyed by (pubkey, thresholds).
    const cache = cacheFor(options);
    const key = `${event.pubkey}:${options.minSats ?? 0}:${options.minDays ?? 0}`;
    const cached = cache.get(key);
    if (cached) {
        return finish(event, { ...cached, pubkey: event.pubkey }, options);
    }

    // Look up the pubkey's attestation via OrangeCheck.
    let decision: FilterDecision;
    try {
        const result = await check({
            identity: identityFor(event.pubkey),
            minSats: options.minSats,
            minDays: options.minDays,
            ...(options.relays ? { relays: options.relays } : {}),
        });

        if (result.ok) {
            decision = accept('ok', { check: result, pubkey: event.pubkey });
        } else if (result.reasons?.includes('not_found')) {
            decision = reject(
                'no_attestation',
                `orangecheck: this relay requires a Bitcoin-stake proof. See https://ochk.io`,
                { check: result, pubkey: event.pubkey }
            );
        } else if (result.reasons?.some((r) => r === 'below_min_sats' || r === 'below_min_days')) {
            decision = reject(
                'below_threshold',
                `orangecheck: proof below relay thresholds (min_sats=${options.minSats ?? 0}, min_days=${options.minDays ?? 0})`,
                { check: result, pubkey: event.pubkey }
            );
        } else {
            decision = reject(
                'invalid_proof',
                `orangecheck: proof invalid (${result.reasons?.join(', ') ?? 'unknown'})`,
                { check: result, pubkey: event.pubkey }
            );
        }

        cache.set(key, decision);
    } catch (err) {
        // Lookup failure — fail open or closed per policy.
        if (options.failOpen) {
            decision = accept('fail_open', { pubkey: event.pubkey });
        } else {
            decision = reject('lookup_error', `orangecheck: lookup failed, try again later`, {
                pubkey: event.pubkey,
            });
        }
        // Cache the error decision with a short TTL so a burst of traffic
        // while /api/check is down doesn't all dogpile the upstream.
        cache.set(key, decision, LOOKUP_ERROR_TTL_MS);
        console.warn(
            '[orangecheck/relay-filter] lookup failed:',
            err instanceof Error ? err.message : String(err)
        );
    }

    return finish(event, decision, options);
}

function finish(
    event: MinimalNostrEvent,
    decision: FilterDecision,
    options: FilterOptions
): FilterDecision {
    options.onDecision?.(event, decision);
    return decision;
}
