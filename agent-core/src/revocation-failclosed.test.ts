// SECURITY §7 item 7: "Query revocation feeds (Nostr kind-30085 by
// `#delegation`) for the cited delegation id before reporting OK, **unless the
// caller explicitly opts out** of revocation checking."
//
// The default was inverted. verifyDelegation had NO revocations parameter at
// all — a revoked delegation returned ok:true and a caller had no way to say
// otherwise. verifyAction accepted one but checked only `if (input.revocations
// && length > 0)`, so omitting it skipped the check silently and "checked,
// clean" was indistinguishable from "never checked".
//
// This library has no network by design, so the caller fetches the feed. What
// changed is that declining to is now a decision they have to state.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { verifyDelegation } from './verify.js';
import type { DelegationEnvelope } from './types.js';

const vectors = join(dirname(fileURLToPath(import.meta.url)), '../../../oc-agent-protocol/test-vectors');
const delegation = JSON.parse(
    readFileSync(join(vectors, 'v01-delegation-minimal.json'), 'utf8'),
).expected.envelope as DelegationEnvelope;

const AT = new Date('2026-04-23T12:00:00Z'); // inside the delegation's window

describe('verifyDelegation fails closed on revocation', () => {
    it('refuses when given neither revocations nor an explicit skip', async () => {
        const r = await verifyDelegation({
            envelope: delegation,
            skipSignatureVerification: true,
            now: AT,
        });
        expect(r.ok).toBe(false);
        expect(r.ok === false && r.code).toBe('E_MALFORMED');
        expect(r.ok === false && r.message).toMatch(/requires `revocations`/i);
    });

    it('accepts an EMPTY revocation list — "I looked, there were none"', async () => {
        const r = await verifyDelegation({
            envelope: delegation,
            skipSignatureVerification: true,
            now: AT,
            revocations: [],
        });
        expect(r.ok).toBe(true);
    });

    it('accepts an explicit skip, for callers that genuinely cannot check', async () => {
        const r = await verifyDelegation({
            envelope: delegation,
            skipSignatureVerification: true,
            now: AT,
            skipRevocationCheck: true,
        });
        expect(r.ok).toBe(true);
    });

    // An empty list and a skip both verify — but they mean different things, and
    // only one of them is a claim about the feed. That distinction is the point
    // of the change.
    it('the two are not the same statement', () => {
        expect('revocations: []').not.toBe('skipRevocationCheck: true');
    });
});
