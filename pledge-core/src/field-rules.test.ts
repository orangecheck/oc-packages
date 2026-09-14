// Two SPEC §3 field rules that were declared and never enforced.
//
// 1. "resolution.query MUST match the grammar of the named mechanism." The
//    grammar validator existed in resolution.ts and had exactly ONE non-test
//    caller family-wide — a UI playground. Nothing on the create or verify path
//    consulted it, so only the MECHANISM was checked and any query string was
//    accepted. A pledge whose resolution nobody can evaluate is not a pledge:
//    the entire claim is that a stranger can decide the outcome without asking
//    the swearer.
//
// 2. "expires_at MUST satisfy expires_at >= resolves_at when both are
//    time-typed." Only the ISO format was checked, so a pledge that expired
//    BEFORE it could resolve was signable and verified clean — it can never be
//    kept, only run out.
import { describe, expect, it } from 'vitest';

import { validatePledgeInput } from './canonical.js';
import type { PledgeCanonicalInput } from './types.js';

const base = {
    swearer: 'bc1qcarol000000000000000000000000000000000',
    proposition: 'I will ship it.',
    resolution: { mechanism: 'chain_state', query: 'block(900000).exists' },
    resolves_at: { time: '2026-06-01T00:00:00Z' },
    expires_at: '2026-06-15T00:00:00Z',
    bond: { attestation_id: '3'.repeat(64), min_sats: 1, min_days: 1 },
    counterparty: null,
    dispute: { mechanism: null, params: null },
    remediation: 'breach_recorded',
    sworn_at: '2026-04-20T09:00:00Z',
    nonce: 'fedcba9876543210fedcba9876543210',
} as unknown as PledgeCanonicalInput;

const withQuery = (mechanism: string, query: string) =>
    ({ ...base, resolution: { mechanism, query } }) as unknown as PledgeCanonicalInput;

describe('resolution.query must match its mechanism grammar (SPEC §3.4)', () => {
    it('accepts a conforming chain_state query', () => {
        expect(validatePledgeInput(base).ok).toBe(true);
    });

    it('rejects a placeholder query that conforms to nothing', () => {
        const v = validatePledgeInput(withQuery('chain_state', 'q'));
        expect(v.ok).toBe(false);
        expect(v.ok === false && v.reason).toMatch(/E_RESOLUTION_NONDETERMINISTIC/);
    });

    it('rejects a query for the WRONG mechanism, even though both are valid strings', () => {
        // A perfectly good counterparty_signs query, named as chain_state.
        const v = validatePledgeInput(
            withQuery('chain_state', 'counterparty(bc1qalice) signs outcome over pledge_id'),
        );
        expect(v.ok).toBe(false);
    });

    it('still refuses self_proof by name (SPEC §3.4.8)', () => {
        const v = validatePledgeInput(withQuery('self_proof', 'I say so'));
        expect(v.ok).toBe(false);
    });

    it('accepts each mechanism with its own conforming query', () => {
        const ok: [string, string][] = [
            ['chain_state', 'address(bc1qx).balance >= 100000 AND block(900000).exists'],
            ['counterparty_signs', 'counterparty(bc1qalice) signs outcome over pledge_id'],
            ['stamp_published', `stamp(content_hash=sha256:${'a'.repeat(64)}, signer=bc1qbob)`],
            ['http_get_hash', `GET https://example.com/r.pdf body_sha256 == ${'b'.repeat(64)}`],
            ['dns_record', 'TXT _oc.example.com == v=oc1'],
            ['vote_resolves', `poll_id=${'c'.repeat(64)} option=yes threshold=0.6`],
        ];
        for (const [m, q] of ok) {
            // counterparty_signs additionally requires a named counterparty —
            // a separate §3.4.2 rule the validator already enforced.
            const input =
                m === 'counterparty_signs'
                    ? ({ ...withQuery(m, q), counterparty: 'bc1qalice' } as PledgeCanonicalInput)
                    : withQuery(m, q);
            expect(validatePledgeInput(input).ok, `${m} should validate`).toBe(true);
        }
    });
});

describe('expires_at >= resolves_at when both are time-typed (SPEC §3)', () => {
    it('rejects a pledge that expires before it can resolve', () => {
        const v = validatePledgeInput({
            ...base,
            expires_at: '2026-05-01T00:00:00Z', // a month BEFORE resolves_at
        } as PledgeCanonicalInput);
        expect(v.ok).toBe(false);
        expect(v.ok === false && v.reason).toMatch(/before resolves_at/i);
    });

    // The vector suite has an explicit same-time edge case (v09), so the bound
    // is inclusive and must stay that way.
    it('accepts them being EQUAL', () => {
        const v = validatePledgeInput({
            ...base,
            expires_at: '2026-06-01T00:00:00Z',
        } as PledgeCanonicalInput);
        expect(v.ok).toBe(true);
    });

    // A block-typed resolves_at has no wall clock to compare against, so the
    // rule explicitly scopes itself to "when both are time-typed".
    it('does not apply to a block-typed resolves_at', () => {
        const v = validatePledgeInput({
            ...base,
            resolves_at: { block: 920000 },
            expires_at: '2020-01-01T00:00:00Z',
        } as unknown as PledgeCanonicalInput);
        expect(v.ok).toBe(true);
    });
});
