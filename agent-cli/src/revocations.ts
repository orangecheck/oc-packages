// What `--revocations` reads.
//
// The README tells callers to pass what a `{ kinds: [30085], "#t": [<id>] }`
// query returns, and that is Nostr events, the revocation envelope inside
// `content`. agent-core reads envelopes: an entry with no `delegation_id`
// reads as one about another delegation, so a raw event never revoked
// anything and a revoked delegation verified OK. Each event is unwrapped to
// its envelope here, and an entry that is neither is refused, never read
// around.

import type { RevocationEnvelope } from '@orangecheck/agent-core';

/** The Nostr kind revocations are published on (OC Agent SPEC §9.4). */
export const REVOCATION_KIND = 30085;

const isObject = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * The revocation envelopes in a `--revocations` file: each entry is an
 * `agent-revocation` envelope, or a kind-30085 event whose content is one.
 */
export function readRevocations(
    input: unknown,
): { ok: true; revocations: RevocationEnvelope[] } | { ok: false; message: string } {
    if (!Array.isArray(input)) {
        return {
            ok: false,
            message: '--revocations must be a JSON array of revocations or kind-30085 events',
        };
    }
    const revocations: RevocationEnvelope[] = [];
    for (const [i, entry] of input.entries()) {
        if (isObject(entry) && entry.kind === 'agent-revocation') {
            revocations.push(entry as unknown as RevocationEnvelope);
            continue;
        }
        if (
            isObject(entry) &&
            entry.kind === REVOCATION_KIND &&
            typeof entry.content === 'string'
        ) {
            let inner: unknown;
            try {
                inner = JSON.parse(entry.content);
            } catch {
                return {
                    ok: false,
                    message: `--revocations entry ${i}: a kind-${REVOCATION_KIND} event whose content is not JSON`,
                };
            }
            if (!isObject(inner) || inner.kind !== 'agent-revocation') {
                return {
                    ok: false,
                    message: `--revocations entry ${i}: a kind-${REVOCATION_KIND} event whose content is not an agent-revocation`,
                };
            }
            revocations.push(inner as unknown as RevocationEnvelope);
            continue;
        }
        return {
            ok: false,
            message: `--revocations entry ${i} is neither an agent-revocation envelope nor a kind-${REVOCATION_KIND} event`,
        };
    }
    return { ok: true, revocations };
}
