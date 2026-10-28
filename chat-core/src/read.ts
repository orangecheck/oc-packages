// What a verdict needs from a relay or the chain, and what to say when it is missing.

import type { NostrEvent } from '@orangecheck/lock-device';

/**
 * A read the verdict depends on got no complete answer, so the empty result
 * proves nothing. A verifier throws this rather than read the silence as "no".
 */
export class UnansweredReadError extends Error {
    constructor(message = 'no relay sent a complete answer') {
        super(message);
        this.name = 'UnansweredReadError';
    }
}

/** One relay query: the events, and per relay whether it finished answering (EOSE). */
export interface QueryAnswer {
    events: NostrEvent[];
    relayStatus?: readonly { eose: boolean }[];
}

export type Query = (filter: Record<string, unknown>) => Promise<QueryAnswer>;

/** Relays that finished answering. */
export function completeAnswers(status: readonly { eose: boolean }[]): number {
    return status.filter((r) => r.eose).length;
}

/**
 * How many relays must send OK before a binding or revocation counts as published
 * (§8.7). The read floor is derived from it: the two together are what make a
 * revocation hold, and neither alone is enough.
 */
export const WRITE_QUORUM = 2;

/**
 * How many of `asked` relays must finish a read before what it did not return
 * counts as absent (§8.7): "live", "bound now", "not bound" and "no newer
 * version". It is `asked - WRITE_QUORUM + 1`, at least 1, so the floor plus the
 * quorum exceeds the relays asked. Then a revocation that WRITE_QUORUM of those
 * relays sent OK for is missed only when every one of them is silent in the same
 * read, and that read does not meet the floor. What a read did return needs one
 * relay: a signature or vouch verifying, an earlier version standing on its binding.
 */
export function readFloor(asked: number): number {
    return Math.max(1, asked - WRITE_QUORUM + 1);
}

/** Whether a read's answers meet the read floor. A read that asked no relay never does. */
export function meetsReadFloor(status: readonly { eose: boolean }[]): boolean {
    return completeAnswers(status) >= readFloor(status.length);
}

/** One relay's answer to a write: whether it sent OK. */
export interface WriteAck {
    relay: string;
    ok: boolean;
}

/** A binding or revocation write: published once WRITE_QUORUM relays sent OK, else not yet. */
export interface WriteOutcome {
    state: 'published' | 'not yet published';
    /** The relays that sent OK. */
    ok: string[];
    /** The relays written to that have not. */
    missing: string[];
}

/**
 * Writes with `publish` until WRITE_QUORUM of `relays` have sent OK, or
 * `attempts` run out; each retry goes only to the relays that have not. The
 * quorum is not capped at the relays given: a write to fewer is never published.
 */
export async function publishToQuorum(
    publish: (relays: readonly string[]) => Promise<readonly WriteAck[]>,
    relays: readonly string[],
    opts: { attempts?: number; backoffMs?: number; wait?: (ms: number) => Promise<void> } = {}
): Promise<WriteOutcome> {
    const attempts = opts.attempts ?? 3;
    const wait = opts.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const ok = new Set<string>();
    for (let i = 0; i < attempts; i++) {
        if (i > 0) await wait((opts.backoffMs ?? 2000) * 2 ** (i - 1));
        const left = relays.filter((r) => !ok.has(r));
        for (const a of await publish(left)) if (a.ok && left.includes(a.relay)) ok.add(a.relay);
        if (ok.size >= WRITE_QUORUM) break;
    }
    return {
        state: ok.size >= WRITE_QUORUM ? 'published' : 'not yet published',
        ok: relays.filter((r) => ok.has(r)),
        missing: relays.filter((r) => !ok.has(r)),
    };
}

/**
 * The events of a query, or UnansweredReadError when they came back empty from
 * relays that all stopped early. Without `relayStatus` the events are taken as
 * they are.
 */
export function answeredEvents(res: QueryAnswer): NostrEvent[] {
    const events = res.events ?? [];
    if (events.length === 0 && res.relayStatus && completeAnswers(res.relayStatus) === 0) {
        throw new UnansweredReadError();
    }
    return events;
}

/** A BIP-322 verifier, such as @orangecheck/bip322's `verifySignature` wrapped to this shape. */
export type VerifyBip322 = (args: {
    address: string;
    message: string;
    signature: string;
}) => boolean | Promise<boolean>;
