// Cross-implementation conformance harness.
//
// Loads every committed test vector in oc-pledge-protocol/test-vectors/ and
// asserts the SDK reproduces them byte-for-byte. The vectors are the spec's
// ground truth; an implementation that fails here is non-conformant by
// definition.
//
// Vector shapes (per oc-pledge-protocol/test-vectors/README.md):
//   A — envelope vectors (pledge / outcome / abandonment) — assert canonical
//       message + id + envelope round-trip
//   B — verification or transition vectors — bond / state / bilateral
//   C — malformed-input vectors — must raise the named error code

import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
    canonicalAbandonmentMessage,
    canonicalOutcomeMessage,
    canonicalPledgeMessage,
    computeAbandonmentId,
    computeOutcomeId,
    computePledgeId,
} from './canonical.js';
import { createPledge, PledgeError, verifyPledge } from './pledge.js';
import { verifyOutcome } from './outcome.js';
import { verifyAbandonment } from './abandonment.js';
import { classifyState } from './state.js';
import { verifyBond } from './bond.js';
import {
    ENVELOPE_VERSION,
    type AbandonmentCanonicalInput,
    type AbandonmentEnvelope,
    type OutcomeCanonicalInput,
    type OutcomeEnvelope,
    type PledgeBond,
    type PledgeCanonicalInput,
    type PledgeEnvelope,
    type ResolutionMechanism,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

function locateVectorsDir(): string | null {
    if (process.env.OC_PLEDGE_VECTORS_DIR && existsSync(process.env.OC_PLEDGE_VECTORS_DIR)) {
        return process.env.OC_PLEDGE_VECTORS_DIR;
    }
    const sibling = resolve(__dirname, '..', '..', '..', 'oc-pledge-protocol', 'test-vectors');
    if (existsSync(sibling)) return sibling;
    const userHome = '/Users/wilneeley/Projects/ochk/oc-pledge-protocol/test-vectors';
    if (existsSync(userHome)) return userHome;
    return null;
}

interface AnyVector {
    description: string;
    kind: string;
    inputs: Record<string, unknown>;
    expected: Record<string, unknown>;
}

const dir = locateVectorsDir();
const vectors: { name: string; data: AnyVector }[] = dir
    ? readdirSync(dir)
          .filter((n) => n.endsWith('.json'))
          .sort()
          .map((name) => ({
              name,
              data: JSON.parse(readFileSync(join(dir, name), 'utf8')) as AnyVector,
          }))
    : [];

describe('oc-pledge-protocol test vectors', () => {
    if (vectors.length === 0) {
        it.skip('(no test-vectors directory found — set OC_PLEDGE_VECTORS_DIR or sibling-clone oc-pledge-protocol)', () => {
            /* intentionally empty */
        });
        return;
    }

    for (const { name, data } of vectors) {
        describe(name, () => {
            it(data.description, async () => {
                await runVector(name, data);
            });
        });
    }
});

async function runVector(name: string, vec: AnyVector) {
    if (vec.kind === 'pledge') return runPledgeVector(vec);
    if (vec.kind === 'pledge-outcome') return runOutcomeVector(vec);
    if (vec.kind === 'pledge-abandonment') return runAbandonmentVector(vec);
    if (vec.kind === 'bond-verification') return runBondVector(vec);
    if (vec.kind === 'state-transition') return runStateTransitionVector(vec);
    if (vec.kind === 'malformed-input') return runMalformedVector(vec);
    throw new Error(`unknown vector kind in ${name}: ${vec.kind}`);
}

// ─── Shape A — pledge envelope vectors ───────────────────────────────────────

async function runPledgeVector(vec: AnyVector) {
    const i = vec.inputs;
    const expected = vec.expected;

    const canon = pledgeCanonFromInputs(i);

    const msg = canonicalPledgeMessage(canon);
    expect(msg).toBe(expected['canonical_message']);

    const bytes = new TextEncoder().encode(msg).byteLength;
    expect(bytes).toBe(expected['canonical_message_bytes_len']);

    const id = computePledgeId(canon);
    expect(id).toBe(expected['pledge_id']);

    const env = expected['envelope'] as PledgeEnvelope;
    expect(env.id).toBe(id);

    const r = await verifyPledge({ envelope: env, skipSignatureVerification: true });
    if (!r.ok) {
        throw new Error(`verifyPledge() failed for declared envelope: ${r.code} ${r.message}`);
    }
    expect(r.id).toBe(id);
}

function pledgeCanonFromInputs(i: Record<string, unknown>): PledgeCanonicalInput {
    return {
        swearer: i['swearer'] as string,
        proposition: i['proposition'] as string,
        resolution: i['resolution'] as PledgeCanonicalInput['resolution'],
        resolves_at: i['resolves_at'] as PledgeCanonicalInput['resolves_at'],
        expires_at: i['expires_at'] as string,
        bond: i['bond'] as PledgeCanonicalInput['bond'],
        counterparty: (i['counterparty'] ?? null) as string | null,
        dispute: i['dispute'] as PledgeCanonicalInput['dispute'],
        remediation: 'breach_recorded',
        sworn_at: i['sworn_at'] as string,
        nonce: i['nonce'] as string,
    };
}

// ─── Shape A — outcome envelope vectors ──────────────────────────────────────

async function runOutcomeVector(vec: AnyVector) {
    const i = vec.inputs;
    const expected = vec.expected;

    const canon: OutcomeCanonicalInput = {
        pledge_id: i['pledge_id'] as string,
        outcome: i['outcome'] as OutcomeCanonicalInput['outcome'],
        resolved_at: i['resolved_at'] as string,
        resolved_by: i['resolved_by'] as string,
        evidence: i['evidence'] as OutcomeCanonicalInput['evidence'],
        dispute_window_ends_at: i['dispute_window_ends_at'] as string,
    };

    const msg = canonicalOutcomeMessage(canon);
    expect(msg).toBe(expected['canonical_message']);

    const bytes = new TextEncoder().encode(msg).byteLength;
    expect(bytes).toBe(expected['canonical_message_bytes_len']);

    const id = computeOutcomeId(canon);
    expect(id).toBe(expected['outcome_id']);

    const env = expected['envelope'] as OutcomeEnvelope;
    expect(env.id).toBe(id);

    const r = await verifyOutcome({ envelope: env, skipSignatureVerification: true });
    if (!r.ok) {
        throw new Error(`verifyOutcome() failed for declared envelope: ${r.code} ${r.message}`);
    }
    expect(r.id).toBe(id);
}

// ─── Shape A — abandonment envelope vectors ──────────────────────────────────

async function runAbandonmentVector(vec: AnyVector) {
    const i = vec.inputs;
    const expected = vec.expected;

    const canon: AbandonmentCanonicalInput = {
        pledge_id: i['pledge_id'] as string,
        abandoned_at: i['abandoned_at'] as string,
        reason: i['reason'] as string,
    };

    const msg = canonicalAbandonmentMessage(canon);
    expect(msg).toBe(expected['canonical_message']);

    const bytes = new TextEncoder().encode(msg).byteLength;
    expect(bytes).toBe(expected['canonical_message_bytes_len']);

    const id = computeAbandonmentId(canon);
    expect(id).toBe(expected['abandonment_id']);

    const env = expected['envelope'] as AbandonmentEnvelope;
    expect(env.id).toBe(id);

    const r = await verifyAbandonment({ envelope: env, skipSignatureVerification: true });
    if (!r.ok) {
        throw new Error(
            `verifyAbandonment() failed for declared envelope: ${r.code} ${r.message}`,
        );
    }
    expect(r.id).toBe(id);
}

// ─── Shape B — bond verification vectors ─────────────────────────────────────
//
// Vector inputs (v18-v20):
//   inputs.bond                = pledge.bond record (attestation_id/min_sats/min_days)
//   inputs.attestation_resolved = simulated chain lookup result
//                                 { sats_bonded, days_unspent, address,
//                                   valid_at_block, [spent_at_block] }
//   inputs.resolves_at_block    = pledge resolves_at.block (the verification
//                                 moment in the vector)
//
// We synthesize a minimal PledgeEnvelope (only fields verifyBond reads) and
// a simulated AttestationLookup that returns the vector's attestation_resolved
// (with utxo_spent_at_or_before_now derived from spent_at_block).

async function runBondVector(vec: AnyVector) {
    const i = vec.inputs;
    const expected = vec.expected;
    const bond = i['bond'] as PledgeBond;
    const resolvesAtBlock = i['resolves_at_block'] as number;
    const attest = i['attestation_resolved'] as
        | {
              sats_bonded: number;
              days_unspent: number;
              address: string;
              valid_at_block: number;
              spent_at_block?: number;
          }
        | null;

    // Synthesize a PledgeEnvelope skeleton — verifyBond only reads
    // pledge.bond and pledge.swearer.address.
    const swearerAddress = attest?.address ?? '';
    const pledge: PledgeEnvelope = {
        v: ENVELOPE_VERSION,
        kind: 'pledge',
        id: '0'.repeat(64),
        swearer: { address: swearerAddress, alg: 'bip322' },
        proposition: 'synthetic',
        resolution: { mechanism: 'chain_state' as ResolutionMechanism, query: 'synthetic' },
        resolves_at: { block: resolvesAtBlock },
        expires_at: '2099-01-01T00:00:00Z',
        bond,
        counterparty: null,
        dispute: { mechanism: null, params: null },
        remediation: 'breach_recorded',
        sworn_at: '2026-01-01T00:00:00Z',
        nonce: '0'.repeat(32),
        sig: { alg: 'bip322', pubkey: swearerAddress, value: 'AAAA' },
    };

    const lookup = async () =>
        attest === null
            ? null
            : {
                  address: attest.address,
                  sats_bonded: attest.sats_bonded,
                  days_unspent: attest.days_unspent,
                  utxo_spent_at_or_before_now:
                      attest.spent_at_block !== undefined &&
                      attest.spent_at_block <= attest.valid_at_block,
              };

    const r = await verifyBond({
        pledge,
        now: '2026-12-31T00:00:00Z',
        lookup,
    });

    const expectedOk = expected['ok'] as boolean;
    const expectedCode = expected['code'] as string | null;

    expect(r.ok).toBe(expectedOk);
    if (!r.ok && expectedCode !== null) {
        expect(r.code).toBe(expectedCode);
    }
}

// ─── Shape B — state-transition vectors ──────────────────────────────────────
//
// Two sub-shapes share kind="state-transition":
//   1. Bilateral (v21, v22): inputs.outcomes is an array of
//      { author, outcome, resolved_at } shorthands. Synthesize OutcomeEnvelope
//      stubs and feed first as primary, rest as contradictoryOutcomes.
//   2. Standard (v23-v27): inputs.pledge + inputs.outcome_envelope (or null) +
//      inputs.abandonment_envelope (or null) + inputs.now.

async function runStateTransitionVector(vec: AnyVector) {
    const i = vec.inputs;
    const expected = vec.expected;
    const expectedState = expected['state'] as string;

    // Sub-shape 1 — bilateral
    if (Array.isArray(i['outcomes'])) {
        const outcomes = i['outcomes'] as Array<{
            author: string;
            outcome: 'kept' | 'broken' | 'expired_unresolved' | 'disputed';
            resolved_at: string;
        }>;
        const pledgeId = i['pledge_id'] as string;
        const now = i['now'] as string;

        // For bilateral vectors we don't have the full pledge envelope —
        // classifyState only reads pledge.expires_at and pledge.resolves_at
        // when neither outcome nor abandonment is set; here outcomes are
        // present so the pledge fields don't load-bear. Use a synthetic
        // pledge with non-load-bearing dates.
        const pledge = syntheticPledge(pledgeId, '2099-01-01T00:00:00Z');
        const stubOutcomes = outcomes.map((o) =>
            outcomeStub(pledgeId, o.outcome, o.resolved_at),
        );
        const state = classifyState({
            pledge,
            outcome: stubOutcomes[0]!,
            abandonment: null,
            now,
            contradictoryOutcomes: stubOutcomes.slice(1),
        });
        expect(state).toBe(expectedState);
        return;
    }

    // Sub-shape 2 — standard
    const pledgeInputs = i['pledge'] as Record<string, unknown>;
    const pledge = pledgeEnvelopeFromInputs(pledgeInputs);

    const outcomeInputs = i['outcome_envelope'] as Record<string, unknown> | null;
    const outcome = outcomeInputs ? outcomeEnvelopeFromInputs(outcomeInputs) : null;

    const abandonmentInputs = i['abandonment_envelope'] as Record<string, unknown> | null;
    const abandonment = abandonmentInputs
        ? abandonmentEnvelopeFromInputs(abandonmentInputs, pledge.swearer.address)
        : null;

    const now = i['now'] as string;
    const chainHeight = i['chain_height'] as number | undefined;
    const chain =
        chainHeight !== undefined
            ? { tip_height: chainHeight, tip_time: now }
            : undefined;

    const state = classifyState({ pledge, outcome, abandonment, now, chain });
    expect(state).toBe(expectedState);
}

function pledgeEnvelopeFromInputs(p: Record<string, unknown>): PledgeEnvelope {
    const canon = pledgeCanonFromInputs(p);
    const id = computePledgeId(canon);
    return {
        v: ENVELOPE_VERSION,
        kind: 'pledge',
        id,
        swearer: { address: canon.swearer, alg: 'bip322' },
        proposition: canon.proposition,
        resolution: canon.resolution,
        resolves_at: canon.resolves_at,
        expires_at: canon.expires_at,
        bond: canon.bond,
        counterparty: canon.counterparty,
        dispute: canon.dispute,
        remediation: 'breach_recorded',
        sworn_at: canon.sworn_at,
        nonce: canon.nonce,
        sig: { alg: 'bip322', pubkey: canon.swearer, value: 'AAAA' },
    };
}

function outcomeEnvelopeFromInputs(o: Record<string, unknown>): OutcomeEnvelope {
    const canon: OutcomeCanonicalInput = {
        pledge_id: o['pledge_id'] as string,
        outcome: o['outcome'] as OutcomeCanonicalInput['outcome'],
        resolved_at: o['resolved_at'] as string,
        resolved_by: o['resolved_by'] as string,
        evidence: o['evidence'] as OutcomeCanonicalInput['evidence'],
        dispute_window_ends_at: o['dispute_window_ends_at'] as string,
    };
    const id = computeOutcomeId(canon);
    return {
        v: ENVELOPE_VERSION,
        kind: 'pledge-outcome',
        id,
        ...canon,
        sig: null,
    };
}

function abandonmentEnvelopeFromInputs(
    a: Record<string, unknown>,
    swearerAddress: string,
): AbandonmentEnvelope {
    const canon: AbandonmentCanonicalInput = {
        pledge_id: a['pledge_id'] as string,
        abandoned_at: a['abandoned_at'] as string,
        reason: a['reason'] as string,
    };
    const id = computeAbandonmentId(canon);
    return {
        v: ENVELOPE_VERSION,
        kind: 'pledge-abandonment',
        id,
        ...canon,
        sig: { alg: 'bip322', pubkey: swearerAddress, value: 'AAAA' },
    };
}

function syntheticPledge(pledgeId: string, expiresAt: string): PledgeEnvelope {
    return {
        v: ENVELOPE_VERSION,
        kind: 'pledge',
        id: pledgeId,
        swearer: { address: 'bc1qsynthetic', alg: 'bip322' },
        proposition: 'synthetic',
        resolution: { mechanism: 'chain_state', query: 'synthetic' },
        resolves_at: { time: '2099-01-01T00:00:00Z' },
        expires_at: expiresAt,
        bond: { attestation_id: '0'.repeat(64), min_sats: 0, min_days: 0 },
        counterparty: null,
        dispute: { mechanism: null, params: null },
        remediation: 'breach_recorded',
        sworn_at: '2026-01-01T00:00:00Z',
        nonce: '0'.repeat(32),
        sig: { alg: 'bip322', pubkey: 'bc1qsynthetic', value: 'AAAA' },
    };
}

function outcomeStub(
    pledgeId: string,
    outcome: 'kept' | 'broken' | 'expired_unresolved' | 'disputed',
    resolvedAt: string,
): OutcomeEnvelope {
    return {
        v: ENVELOPE_VERSION,
        kind: 'pledge-outcome',
        id: '0'.repeat(64),
        pledge_id: pledgeId,
        outcome,
        resolved_at: resolvedAt,
        resolved_by: 'deterministic',
        evidence: { mechanism: 'chain_state', result: 'synthetic', witness: 'synthetic' },
        dispute_window_ends_at: resolvedAt,
        sig: null,
    };
}

// ─── Shape C — malformed-input vectors ───────────────────────────────────────

async function runMalformedVector(vec: AnyVector) {
    const i = vec.inputs;
    const expected = vec.expected;
    const expectedError = expected['error'] as string;

    // v28 (the only Shape C vector currently): empty-nonce pledge. Build the
    // canonical input from the vector's fields and assert createPledge()
    // throws PledgeError with the SPEC error code (E_PLEDGE_MALFORMED).
    const canon = pledgeCanonFromInputs(i);

    let thrown: PledgeError | null = null;
    try {
        await createPledge({
            ...canon,
            swornAt: canon.sworn_at,
            nonce: canon.nonce,
            remediation: canon.remediation,
            swearerSigner: {
                address: canon.swearer,
                signMessage: async () => 'NEVER_REACHED',
            },
        });
    } catch (e) {
        if (e instanceof PledgeError) thrown = e;
        else throw e;
    }

    expect(thrown).not.toBeNull();
    expect(thrown!.code).toBe(expectedError);
}
