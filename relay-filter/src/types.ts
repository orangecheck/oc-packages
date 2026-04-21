import type { CheckResult } from '@orangecheck/sdk';

/**
 * Minimal Nostr event — compatible with nostr-tools' Event and Strfry's
 * plugin input format. Only the fields the filter reads are required.
 */
export interface MinimalNostrEvent {
    id: string;
    pubkey: string;
    kind: number;
    // Other fields (tags, content, sig, created_at) are ignored by the filter.
}

export interface FilterOptions {
    /** Minimum sats bonded for the pubkey's attestation. Default 0. */
    minSats?: number;
    /** Minimum days unspent. Default 0. */
    minDays?: number;

    /**
     * Event kinds that bypass the filter. Useful for bootstrapping — e.g.,
     * allow kind-0 profile metadata and kind-3 contact lists so users can
     * publish their handles before they've created a proof.
     *
     * Default: `[0, 3, 10002]` (profile meta, contacts, relay list).
     */
    allowKinds?: number[];

    /**
     * Pubkeys that bypass the filter entirely. Accepts hex or npub.
     * Useful for operator / admin keys.
     */
    allowPubkeys?: string[];

    /**
     * How long the filter caches a per-pubkey decision. Default 60_000 ms
     * (matches /api/check's cache).
     */
    cacheTtlMs?: number;
    /** Max cache entries. Default 1_000. */
    cacheMax?: number;

    /**
     * If the OrangeCheck lookup throws (relays unreachable, network down),
     * let the event through. Default `false` — we fail closed.
     */
    failOpen?: boolean;

    /** Override the discovery relays used by the SDK's check(). */
    relays?: string[];

    /** Called with each decision. Use for logging / metrics. */
    onDecision?: (event: MinimalNostrEvent, decision: FilterDecision) => void;
}

export interface FilterDecision {
    /**
     * `accept` — relay SHOULD accept the event.
     * `reject` — relay MUST reject, returning `msg` to the client.
     * `shadowReject` — relay should accept but silently discard (drop without
     * informing the client). Strfry supports this; most others treat it as
     * `reject`. Use sparingly — it hides errors from honest users.
     */
    action: 'accept' | 'reject' | 'shadowReject';
    /** Why this decision was made. */
    reason:
        | 'ok'
        | 'allowed_kind'
        | 'allowed_pubkey'
        | 'no_attestation'
        | 'below_threshold'
        | 'invalid_proof'
        | 'lookup_error'
        | 'fail_open';
    /** Human-readable message to send the client on reject. */
    message?: string;
    /** Underlying SDK result when a lookup happened. */
    check?: CheckResult;
    /** The pubkey that was looked up (hex). */
    pubkey?: string;
}
