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
