// What `--revocations` reads.
//
// The README tells callers to pass what a `{ kinds: [30085], "#t": [<id>] }`
// query returns, and that is Nostr events, the revocation envelope inside
// `content`. agent-core reads envelopes: an entry with no `delegation_id`
// reads as one about another delegation, so a raw event never revoked
// anything and a revoked delegation verified OK. Each kind-30085 event whose
// content is a JSON object is unwrapped to it here, whatever its unsigned
// `kind` says: agent-core decides by `delegation_id` and the signed bytes
// (SPEC §9.1), never by that field.
//
// Every entry goes on to agent-core: a relay can send anything under a
// delegation's tag, and one junk entry must not stop an honest verify.
// agent-core counts a non-object, and an entry naming this delegation that
// does not verify, in `revocationsSkipped`. An object with no `delegation_id`
// it reads as about another delegation and counts nothing, so those are
// counted here (`unread`) for the output to add.

import type { RevocationEnvelope } from '@orangecheck/agent-core';

/** The Nostr kind revocations are published on (OC Agent SPEC §9.4). */
export const REVOCATION_KIND = 30085;

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/** A kind-30085 event's content when it is a JSON object, else the entry as it came. */
function unwrapped(entry: unknown): unknown {
    if (!isObject(entry) || entry.kind !== REVOCATION_KIND || typeof entry.content !== 'string') {
        return entry;
    }
    try {
        const inner: unknown = JSON.parse(entry.content);
        return isObject(inner) ? inner : entry;
    } catch {
        return entry;
    }
}

/**
 * The entries of a `--revocations` file for agent-core, each kind-30085 event
 * unwrapped to its content. `unread` counts the objects that, unwrapped, name
 * no delegation (no string `delegation_id`), which agent-core does not count.
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
    const revocations = input.map(unwrapped);
    const unread = revocations.filter(
        (e) => isObject(e) && typeof e.delegation_id !== 'string',
    ).length;
    return { ok: true, revocations: revocations as RevocationEnvelope[], unread };
}
