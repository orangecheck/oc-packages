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

/**
 * The reference relay set (§8.7): the relays the reference reader asks, and so the only
 * relays a write counts on toward WRITE_QUORUM. A write elsewhere reaches no reader.
 */
export const CHAT_RELAYS: readonly string[] = [
    'wss://relay.ochk.io',
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.primal.net',
];

/** One relay's answer to a write: whether it sent OK. */
export interface WriteAck {
    relay: string;
    ok: boolean;
}

/** A binding or revocation write: published once WRITE_QUORUM reference relays hold it, else not yet. */
export interface WriteOutcome {
    state: 'published' | 'not yet published';
    /** The reference relays that hold it. */
    held: string[];
    /** The reference relays that do not, yet. */
    missing: string[];
}

/**
 * Writes with `publish` to `to` and to every relay of the reference set, until
 * WRITE_QUORUM of the reference set hold it, or `attempts` run out. Only the
 * reference set counts: an OK from any other relay, the writer's own included,
 * reaches no reader. With `readBack`, a reference relay counts only once it serves
 * the write back; without it, on its OK. Each retry goes only to the reference
 * relays that do not hold it yet.
 */
export async function publishToQuorum(
    publish: (relays: readonly string[]) => Promise<readonly WriteAck[]>,
    to: readonly string[],
    opts: {
        /** The relays readers ask. Defaults to CHAT_RELAYS. */
        reference?: readonly string[];
        /** Whether `relay` serves the write back, asked of one relay at a time. */
        readBack?: (relay: string) => Promise<boolean>;
        attempts?: number;
        backoffMs?: number;
        wait?: (ms: number) => Promise<void>;
    } = {}
): Promise<WriteOutcome> {
    const reference = opts.reference ?? CHAT_RELAYS;
    const attempts = opts.attempts ?? 3;
    const wait = opts.wait ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    const held = new Set<string>();
    for (let i = 0; i < attempts; i++) {
        if (i > 0) await wait((opts.backoffMs ?? 2000) * 2 ** (i - 1));
        const left = reference.filter((r) => !held.has(r));
        const acks = await publish(i === 0 ? [...new Set([...to, ...reference])] : left);
        const ok = new Set(acks.filter((a) => a.ok).map((a) => a.relay));
        for (const r of left) {
            if (opts.readBack ? await opts.readBack(r).catch(() => false) : ok.has(r)) held.add(r);
        }
        if (held.size >= WRITE_QUORUM) break;
    }
    return {
        state: held.size >= WRITE_QUORUM ? 'published' : 'not yet published',
        held: reference.filter((r) => held.has(r)),
        missing: reference.filter((r) => !held.has(r)),
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
