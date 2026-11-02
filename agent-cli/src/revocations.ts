// What `--revocations` reads.
//
// The README tells callers to pass what a `{ kinds: [30085], "#t": [<id>] }`
// query returns, and that is Nostr events, the revocation envelope inside
// `content`. agent-core reads envelopes: an entry with no `delegation_id`
// reads as one about another delegation, so a raw event never revoked
// anything and a revoked delegation verified OK. Each event whose content is
// an agent-revocation is unwrapped to it here.
//
// Every other entry goes to agent-core as it is: a relay can send anything
// under a delegation's tag, and one junk entry must not stop an honest
// verify. agent-core counts a non-object in `revocationsSkipped`, but reads an
// object with no `delegation_id` as about another delegation and counts
// nothing, so such objects are counted here (`unread`) for the output to add.

import type { RevocationEnvelope } from '@orangecheck/agent-core';

/** The Nostr kind revocations are published on (OC Agent SPEC §9.4). */
export const REVOCATION_KIND = 30085;

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/** The envelope inside a kind-30085 event, or null when it carries none. */
function carried(entry: Record<string, unknown>): Record<string, unknown> | null {
    if (entry.kind !== REVOCATION_KIND || typeof entry.content !== 'string') return null;
    try {
        const inner: unknown = JSON.parse(entry.content);
        return isObject(inner) && inner.kind === 'agent-revocation' ? inner : null;
    } catch {
        return null;
    }
}

/**
 * The entries of a `--revocations` file for agent-core: kind-30085 events
 * carrying an agent-revocation unwrapped to it, everything else as it is.
 * `unread` counts the objects that are neither a revocation nor carry one.
 */
export function readRevocations(
    input: unknown,
):
    | { ok: true; revocations: RevocationEnvelope[]; unread: number }
    | { ok: false; message: string } {
    if (!Array.isArray(input)) {
        return {
            ok: false,
            message: '--revocations must be a JSON array of revocations or kind-30085 events',
        };
    }
    let unread = 0;
    const revocations = input.map((entry: unknown) => {
        if (!isObject(entry) || entry.kind === 'agent-revocation') return entry;
        const inner = carried(entry);
        if (inner) return inner;
        unread++;
        return entry;
    });
    return { ok: true, revocations: revocations as RevocationEnvelope[], unread };
}
