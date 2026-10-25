// SPEC §4.1, §5.1, §11.13: a signer keeps the free-text limits, a verifier
// does not. A signed abandonment or outcome counts whatever the length or line
// breaks of its reason or evidence. A verifier refuses a value that is not a
// string, and a line feed in evidence.result, which would let another envelope
// give the same bytes. BIP-322 is a stand-in that binds signature, message and
// address.

import { describe, expect, it } from 'vitest';

import { createAbandonment, verifyAbandonment, wrapAbandonmentEnvelope } from './abandonment.js';
import { computeAbandonmentId, computeOutcomeId, computePledgeId } from './canonical.js';
import { createOutcome, verifyOutcome } from './outcome.js';
import { PledgeError } from './pledge.js';
import { classifyState } from './state.js';
import type {
    AbandonmentEnvelope,
    OutcomeCanonicalInput,
    OutcomeEnvelope,
    PledgeCanonicalInput,
    PledgeEnvelope,
} from './types.js';

const SWEARER = 'bc1qswearer00000000000000000000000000000000';
const COUNTERPARTY = 'bc1qcounter0000000000000000000000000000000';
const sign = (addr: string, msg: string) => `sig:${addr}:${msg}`;
const verifyBip322 = async (msg: string, sig: string, addr: string) => sig === sign(addr, msg);

const pledge: PledgeCanonicalInput = {
    swearer: SWEARER,
    proposition: 'I will deliver the audit report to the counterparty.',
    resolution: {
        mechanism: 'counterparty_signs',
        query: `counterparty(${COUNTERPARTY}) signs outcome over pledge_id`,
    },
    resolves_at: { time: '2027-01-01T00:00:00Z' },
    expires_at: '2027-02-01T00:00:00Z',
    bond: { attestation_id: 'c'.repeat(64), min_sats: 1000, min_days: 1 },
    counterparty: COUNTERPARTY,
    dispute: { mechanism: null, params: null },
    remediation: 'breach_recorded',
    sworn_at: '2026-10-20T00:00:00Z',
    nonce: '0123456789abcdef0123456789abcdef',
};
const pledgeId = computePledgeId(pledge);

/** An abandonment the swearer signed over `reason`, built by hand: the producers refuse odd ones. */
function abandonment(reason: unknown): AbandonmentEnvelope {
    const canon = { pledge_id: pledgeId, abandoned_at: '2026-11-01T00:00:00Z', reason } as {
        pledge_id: string;
        abandoned_at: string;
        reason: string;
    };
    const id = computeAbandonmentId(canon);
    return {
        v: 1,
        kind: 'pledge-abandonment',
        id,
        ...canon,
        sig: { alg: 'bip322', pubkey: SWEARER, value: sign(SWEARER, id) },
    };
}

/** A broken outcome the counterparty signed, with this evidence. */
function outcome(result: unknown, witness: unknown): OutcomeEnvelope {
    const canon = {
        pledge_id: pledgeId,
        outcome: 'broken',
        resolved_at: '2027-01-02T00:00:00Z',
        resolved_by: COUNTERPARTY,
        evidence: { mechanism: 'counterparty_signs', result, witness },
        dispute_window_ends_at: '2027-01-09T00:00:00Z',
    } as OutcomeCanonicalInput;
    const id = computeOutcomeId(canon);
    return {
        v: 1,
        kind: 'pledge-outcome',
        id,
        ...canon,
        sig: { alg: 'bip322', pubkey: COUNTERPARTY, value: sign(COUNTERPARTY, id) },
    };
}

const checkAbandonment = (env: AbandonmentEnvelope) =>
    verifyAbandonment({ envelope: env, pledge, verifyBip322 });
const checkOutcome = (env: OutcomeEnvelope) =>
    verifyOutcome({ envelope: env, pledge, verifyBip322 });

const envelopeOf = (p: PledgeCanonicalInput): PledgeEnvelope => ({
    v: 1,
    kind: 'pledge',
    id: pledgeId,
    swearer: { address: p.swearer, alg: 'bip322' },
    proposition: p.proposition,
    resolution: p.resolution,
    resolves_at: p.resolves_at,
    expires_at: p.expires_at,
    bond: p.bond,
    counterparty: p.counterparty,
    dispute: p.dispute,
    remediation: 'breach_recorded',
    sworn_at: p.sworn_at,
    nonce: p.nonce,
    sig: { alg: 'bip322', pubkey: SWEARER, value: sign(SWEARER, pledgeId) },
});

describe('a verifier counts a signed abandonment whatever its reason says', () => {
    it.each([
        ['281 bytes', 'r'.repeat(281)],
        ['4000 bytes', 'é'.repeat(2000)],
        ['empty', ''],
        ['a lone surrogate', `lost ${String.fromCharCode(0xd800)} key`],
        ['two lines', 'cannot deliver\nsorry'],
        ['lines that read like fields', 'x\npledge_id: ' + 'f'.repeat(64) + '\r\nabandoned_at: 2026-01-01T00:00:00Z'],
    ])('verifies one whose reason is %s, and the pledge reads broken', async (_, reason) => {
        const env = abandonment(reason);
        expect(await checkAbandonment(env)).toMatchObject({ ok: true, id: env.id });
        const state = classifyState({
            pledge: envelopeOf(pledge),
            outcome: null,
            abandonment: env,
            now: '2026-11-02T00:00:00Z',
        });
        expect(state).toBe('broken');
    });

    it.each([
        ['is a number', 5],
        ['is null', null],
    ])('refuses, as malformed and without throwing, one whose reason %s', async (_, reason) => {
        expect(await checkAbandonment(abandonment(reason))).toMatchObject({
            ok: false,
            code: 'E_ABANDONMENT_MALFORMED',
        });
    });

    it('still refuses one a stranger signed', async () => {
        const env = { ...abandonment('r'.repeat(281)) };
        env.sig = { ...env.sig, value: sign(COUNTERPARTY, env.id) };
        expect(await checkAbandonment(env)).toMatchObject({ ok: false, code: 'E_ABANDONMENT_BAD_SIG' });
    });
});

describe('a verifier counts a signed outcome whatever its evidence says', () => {
    it.each([
        ['empty', '', ''],
        ['long', 'r'.repeat(5000), 'w'.repeat(5000)],
        ['a witness of several lines', 'broken', 'w\n  witness: x\ndispute_window_ends_at: 2027-01-01T00:00:00Z'],
        ['a result with a carriage return', 'broken\r', 'w'],
    ])('verifies one whose evidence is %s', async (_, result, witness) => {
        const env = outcome(result, witness);
        expect(await checkOutcome(env)).toMatchObject({ ok: true, id: env.id });
    });

    it.each([
        ['a line feed in the result', 'broken\n  witness: x', 'w'],
        ['a witness that is a number', 'broken', 7],
    ])('refuses, as malformed and without throwing, one with %s', async (_, result, witness) => {
        expect(await checkOutcome(outcome(result, witness))).toMatchObject({
            ok: false,
            code: 'E_OUTCOME_MALFORMED',
        });
    });
});

describe('a signer keeps the limits a verifier does not', () => {
    const signer = { address: SWEARER, signMessage: async (m: string) => sign(SWEARER, m) };
    const create = (reason: unknown) =>
        createAbandonment({
            pledge_id: pledgeId,
            abandoned_at: '2026-11-01T00:00:00Z',
            reason: reason as string,
            swearerSigner: signer,
        });

    it.each([
        ['281 bytes', 'r'.repeat(281)],
        ['empty', ''],
        ['two lines', 'cannot\ndeliver'],
        ['a lone surrogate', `lost ${String.fromCharCode(0xdc00)}`],
        ['a number', 5],
    ])('refuses to sign or wrap a reason that is %s', async (_, reason) => {
        await expect(create(reason)).rejects.toMatchObject({ code: 'E_ABANDONMENT_MALFORMED' });
        const canon = { pledge_id: pledgeId, abandoned_at: '2026-11-01T00:00:00Z', reason } as {
            pledge_id: string;
            abandoned_at: string;
            reason: string;
        };
        expect(() => wrapAbandonmentEnvelope(canon, 'sig', SWEARER)).toThrow(PledgeError);
    });

    it('signs a reason of 280 bytes', async () => {
        await expect(create('r'.repeat(280))).resolves.toMatchObject({ reason: 'r'.repeat(280) });
    });

    it.each([
        ['empty', ''],
        ['two lines', 'w\nx'],
    ])('refuses to sign an outcome whose witness is %s', async (_, witness) => {
        await expect(
            createOutcome({
                pledge_id: pledgeId,
                outcome: 'broken',
                resolved_at: '2027-01-02T00:00:00Z',
                resolved_by: COUNTERPARTY,
                evidence: { mechanism: 'counterparty_signs', result: 'broken', witness },
                dispute_window_ends_at: '2027-01-09T00:00:00Z',
                signer: { address: COUNTERPARTY, signMessage: async (m) => sign(COUNTERPARTY, m) },
            }),
        ).rejects.toMatchObject({ code: 'E_OUTCOME_MALFORMED' });
    });
});
