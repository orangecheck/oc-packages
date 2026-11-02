// What `--revocations` reads.
//
// The README tells callers to pass what a `{ kinds: [30085], "#t": [<id>] }`
// query returns, and that is Nostr events, the revocation envelope inside
// `content`. agent-core reads envelopes, keyed on `delegation_id` and decided
// by the signed bytes (SPEC §9.1), so the envelope decides here too, never the
// event's unsigned `kind`: an object with no string `delegation_id` whose string
// `content` parses to a JSON object is unwrapped to it, whatever its kind
// (30085, "30085", " 30085", 30085.5, null, none at all). A kind check let a
// real revocation be read around by writing the number another way.
//
// Every entry is read, none refused: a relay can send anything under a
// delegation's tag, and one junk entry must not stop an honest verify. What
// revoked nothing is counted in two kinds:
//   - not a revocation: not an object, or an object naming no delegation;
//   - names this delegation, unverifiable: a revocation naming the delegation
//     that does not verify (agent-core counts these), or content that mentions
//     the delegation's id but does not parse to an envelope (counted here).
// The second kind means a revocation of this delegation may exist that could
// not be read, so the verdict does not say revocation was checked.

import type { RevocationEnvelope } from '@orangecheck/agent-core';

/** The Nostr kind revocations are published on (OC Agent SPEC §9.4). */
export const REVOCATION_KIND = 30085;

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/** An event's content when it parses to a JSON object, whatever its kind; else null. */
function contentObject(entry: Record<string, unknown>): Record<string, unknown> | null {
    if (typeof entry.content !== 'string') return null;
    try {
        const inner: unknown = JSON.parse(entry.content);
        return isObject(inner) ? inner : null;
    } catch {
        return null;
    }
}

/**
 * The entries of a `--revocations` file for agent-core: the objects that name a
 * delegation, each event unwrapped to its content. `notARevocation` counts what
 * names none; `unreadableNamingThis` counts entries whose content mentions
 * `delegationId` but does not parse to an envelope.
 */
export function readRevocations(
    input: unknown,
    delegationId: string | null,
):
    | {
          ok: true;
          revocations: RevocationEnvelope[];
          notARevocation: number;
          unreadableNamingThis: number;
      }
    | { ok: false; message: string } {
    if (!Array.isArray(input)) {
        return {
            ok: false,
            message: '--revocations must be a JSON array of revocations or kind-30085 events',
        };
    }
    const revocations: RevocationEnvelope[] = [];
    let notARevocation = 0;
    let unreadableNamingThis = 0;
    for (const entry of input) {
        if (!isObject(entry)) {
            notARevocation++;
            continue;
        }
        const envelope =
            typeof entry.delegation_id === 'string' ? entry : (contentObject(entry) ?? entry);
        if (typeof envelope.delegation_id === 'string') {
            revocations.push(envelope as unknown as RevocationEnvelope);
            continue;
        }
        const mentionsThis =
            delegationId !== null &&
            typeof entry.content === 'string' &&
            entry.content.includes(delegationId);
        if (mentionsThis) unreadableNamingThis++;
        else notARevocation++;
    }
    return { ok: true, revocations, notARevocation, unreadableNamingThis };
}
