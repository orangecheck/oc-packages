// SPEC §2: one spelling per address. A bech32 address is written in lowercase;
// discovery tags and every address comparison are by exact string, so the same
// key in capitals would go unlisted, or pass as an agent that differs from the
// swearer. The verify side is pinned by vectors v55-v58; these pin the signer
// side and the edges the vectors do not reach.
import { describe, expect, it, vi } from 'vitest';

import { readOutcomeInput, validatePledgeInput } from './canonical.js';
import { createPledge, PledgeError, wrapPledgeEnvelope } from './pledge.js';
import type {
    Bip322Signer,
    CreatePledgeInput,
    OutcomeCanonicalInput,
    PledgeCanonicalInput,
} from './types.js';

const SWEARER = 'bc1qalice000000000000000000000000000000000';

const canon = {
    swearer: SWEARER,
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

const outcome: OutcomeCanonicalInput = {
    pledge_id: 'a'.repeat(64),
    outcome: 'kept',
    resolved_at: '2026-06-02T10:00:00Z',
    resolved_by: 'bc1qcounter0000000000000000000000000000000',
    evidence: { mechanism: 'counterparty_signs', result: 'kept', witness: 'sig' },
    dispute_window_ends_at: '2026-06-09T10:00:00Z',
};

function fakeSigner(address: string): Bip322Signer {
    return { address, signMessage: vi.fn(async () => 'AAAA') };
}

describe('a bech32 address is written in lowercase (SPEC §2)', () => {
    it.each([
        ['bech32 mainnet in capitals', SWEARER.toUpperCase()],
        ['bech32 with one capital', 'bc1qalicE000000000000000000000000000000000'],
        ['testnet in capitals', 'TB1QW508D6QEJXTDG4Y5R3ZARVARY0C5XW7KXPJZSX'],
        ['regtest in capitals', 'BCRT1Q50RTRMJ2F8VL9TEM8QPFW36YLW5JG9J2DKKU3W'],
    ])('refuses a swearer that is a %s', (_name, swearer) => {
        const v = validatePledgeInput({ ...canon, swearer });
        expect(v).toMatchObject({ ok: false, reason: expect.stringMatching(/lowercase/) });
    });

    it('takes a base58 address as encoded: its capitals are part of it', () => {
        expect(
            validatePledgeInput({ ...canon, swearer: '1BoatSLRHtKNngkdXEeobR76b53LETtpyT' }),
        ).toEqual({
            ok: true,
        });
        expect(validatePledgeInput(canon)).toEqual({ ok: true });
    });

    it('refuses a counterparty in capitals', () => {
        const v = validatePledgeInput({ ...canon, counterparty: SWEARER.toUpperCase() });
        expect(v).toMatchObject({
            ok: false,
            reason: expect.stringMatching(/counterparty.*lowercase/),
        });
    });

    it('refuses a resolver in capitals, and still reads "deterministic"', () => {
        expect(
            readOutcomeInput({ ...outcome, resolved_by: outcome.resolved_by.toUpperCase() }),
        ).toMatchObject({
            ok: false,
            reason: expect.stringMatching(/resolved_by.*lowercase/),
        });
        expect(readOutcomeInput({ ...outcome, resolved_by: 'deterministic' })).toEqual({
            ok: true,
        });
        expect(readOutcomeInput(outcome)).toEqual({ ok: true });
    });

    it("never signs for an agent written as the swearer's key in capitals", async () => {
        const input: CreatePledgeInput = {
            swearer: SWEARER,
            proposition: 'I will not spend the bonded UTXO before block 920000.',
            resolution: {
                mechanism: 'chain_state',
                query: `address(${SWEARER}).balance >= 500000`,
            },
            resolves_at: { block: 920000 },
            expires_at: '2026-12-31T00:00:00Z',
            bond: { attestation_id: '1'.repeat(64), min_sats: 500000, min_days: 180 },
            counterparty: null,
            dispute: { mechanism: null, params: null },
            swornAt: '2026-04-24T18:30:00Z',
            nonce: '0123456789abcdef0123456789abcdef',
            viaDelegation: {
                delegation_id: 'd'.repeat(64),
                agent_signer: fakeSigner(SWEARER.toUpperCase()),
            },
        };
        await expect(createPledge(input)).rejects.toThrow(/lowercase/);
        await expect(createPledge(input)).rejects.toBeInstanceOf(PledgeError);
    });

    it("never wraps an agent signature from the swearer's key in capitals", () => {
        expect(() =>
            wrapPledgeEnvelope(canon, 'AAAA', {
                viaDelegation: {
                    delegationId: 'd'.repeat(64),
                    agentAddress: SWEARER.toUpperCase(),
                },
            }),
        ).toThrow(/lowercase/);
    });
});
