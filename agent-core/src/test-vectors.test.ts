// Verify every committed test vector in oc-agent-protocol/test-vectors/.

import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
    actionCanonicalMessage,
    canonicalizeScopes,
    computeActionId,
    computeDelegationId,
    computeRevocationId,
    computeSubdelegationId,
    delegationCanonicalMessage,
    revocationCanonicalMessage,
    subdelegationCanonicalMessage,
} from './canonical.js';
import { parseScope, ScopeParseError } from './scope.js';
import { verifyAction, verifyDelegation, verifyRevocation, verifySubdelegation } from './verify.js';
import type {
    ActionEnvelope,
    AgentErrorCode,
    DelegationEnvelope,
    RevocationEnvelope,
    SubdelegationEnvelope,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VECTORS_DIR =
    process.env.OC_AGENT_VECTORS_DIR ??
    resolve(__dirname, '..', '..', '..', 'oc-agent-protocol', 'test-vectors');

interface BaseVector {
    description: string;
    kind: 'delegation' | 'action' | 'revocation' | 'subdelegation';
    expected: {
        canonical_message: string;
        canonical_message_bytes_len: number;
        id: string;
        envelope:
            | DelegationEnvelope
            | ActionEnvelope
            | RevocationEnvelope
            | SubdelegationEnvelope;
    };
}

interface DelegationVector extends BaseVector {
    kind: 'delegation';
    inputs: {
        principal: string;
        agent: string;
        scopes: string[];
        bond: { sats: number; attestation_id: string } | null;
        issued_at: string;
        expires_at: string;
        nonce: string;
    };
    expected: BaseVector['expected'] & { envelope: DelegationEnvelope };
}

interface ActionVector extends BaseVector {
    kind: 'action';
    inputs: {
        address: string;
        content_hash: string;
        content_length: number;
        content_mime: string;
        signed_at: string;
        delegation_id: string;
        scope_exercised: string;
    };
    expected: BaseVector['expected'] & { envelope: ActionEnvelope };
}

interface RevocationVector extends BaseVector {
    kind: 'revocation';
    inputs: {
        address: string;
        delegation_id: string;
        reason: string;
        signed_at: string;
    };
    expected: BaseVector['expected'] & { envelope: RevocationEnvelope };
}

interface SubdelegationVector extends BaseVector {
    kind: 'subdelegation';
    inputs: {
        parent_id: string;
        principal: string;
        agent: string;
        scopes: string[];
        issued_at: string;
        expires_at: string;
        nonce: string;
    };
    expected: BaseVector['expected'] & { envelope: SubdelegationEnvelope };
}

// Negative vectors carry "negative": true at the top level and document an
// expected verifier rejection (SPEC §11 error code) instead of a canonical-
// message round-trip.
interface NegativeVectorBase {
    description: string;
    kind: 'delegation' | 'action' | 'revocation';
    negative: true;
    expected: {
        verification_outcome: 'REJECT';
        error_code: AgentErrorCode;
        spec_reference: string;
        rejection_reason: string;
    };
}

interface NegativeActionVector extends NegativeVectorBase {
    kind: 'action';
    inputs: {
        address: string;
        content_hash: string;
        content_length: number;
        content_mime: string;
        signed_at: string;
        delegation_id: string;
        scope_exercised: string;
        content_ref?: string | null;
        ots?: unknown;
    };
}

interface NegativeRevocationVector extends NegativeVectorBase {
    kind: 'revocation';
    inputs: {
        address: string;
        delegation_id: string;
        reason: string;
        signed_at: string;
    };
}

interface NegativeDelegationVector extends NegativeVectorBase {
    kind: 'delegation';
    inputs: {
        principal: string;
        agent: string;
        scopes: string[];
        bond: { sats: number; attestation_id: string } | null;
        issued_at: string;
        expires_at: string;
        nonce: string;
    };
    additional_malformed_examples_for_implementer_smoke_tests?: {
        scope: string;
        why: string;
    }[];
}

interface NegativeSubdelegationVector extends NegativeVectorBase {
    kind: 'subdelegation';
    inputs: {
        parent_id: string;
        principal: string;
        agent: string;
        scopes: string[];
        issued_at: string;
        expires_at: string;
        nonce: string;
    };
}

type NegativeVector =
    | NegativeActionVector
    | NegativeRevocationVector
    | NegativeDelegationVector
    | NegativeSubdelegationVector;

type Vector =
    | DelegationVector
    | ActionVector
    | RevocationVector
    | SubdelegationVector
    | NegativeVector;

function isNegative(v: Vector): v is NegativeVector {
    return 'negative' in v && v.negative === true;
}

async function loadVectors(): Promise<{ name: string; data: Vector }[]> {
    try {
        const files = await readdir(VECTORS_DIR);
        const out: { name: string; data: Vector }[] = [];
        for (const name of files) {
            if (!name.endsWith('.json')) continue;
            const text = await readFile(join(VECTORS_DIR, name), 'utf8');
            out.push({ name, data: JSON.parse(text) as Vector });
        }
        return out.sort((a, b) => a.name.localeCompare(b.name));
    } catch {
        return [];
    }
}

const vectors = await loadVectors();

describe('oc-agent-protocol test vectors', () => {
    if (vectors.length === 0) {
        it.skip('(no test-vectors directory found — skipping cross-implementation checks)', () => {});
        return;
    }

    // First pass: the vectors can cross-reference each other (action cites delegation id;
    // subdelegation cites parent id which may be a root or another sub).
    // Key both kinds so chain walking works.
    const delegationEnvelopes = new Map<string, DelegationEnvelope>();
    const subdelegationEnvelopes = new Map<string, SubdelegationEnvelope>();
    for (const { data } of vectors) {
        if (isNegative(data)) continue;
        if (data.kind === 'delegation') {
            delegationEnvelopes.set(data.expected.id, data.expected.envelope);
        } else if (data.kind === 'subdelegation') {
            subdelegationEnvelopes.set(data.expected.id, data.expected.envelope);
        }
    }

    for (const { name, data } of vectors) {
        if (isNegative(data)) continue;
        it(`${name} — canonical message reconstructs byte-identical`, () => {
            const msg = reconstructCanonical(data);
            expect(msg).toBe(data.expected.canonical_message);
            expect(new TextEncoder().encode(msg).byteLength).toBe(
                data.expected.canonical_message_bytes_len
            );
        });

        it(`${name} — id equals sha256(canonical_message)`, () => {
            const id = reconstructId(data);
            expect(id).toBe(data.expected.id);
            expect(id).toBe(data.expected.envelope.id);
        });

        it(`${name} — declared envelope passes verify() with skipSignatureVerification`, async () => {
            if (data.kind === 'delegation') {
                const r = await verifyDelegation({
                    envelope: data.expected.envelope,
                    skipSignatureVerification: true,
                    skipTemporalCheck: true,
                });
                expect(r.ok).toBe(true);
            } else if (data.kind === 'action') {
                const delegation = delegationEnvelopes.get(data.inputs.delegation_id);
                if (!delegation) {
                    throw new Error(`action vector ${name} references missing delegation ${data.inputs.delegation_id}`);
                }
                const r = await verifyAction({
                    action: data.expected.envelope,
                    delegation,
                    skipSignatureVerification: true,
                });
                expect(r.ok).toBe(true);
            } else if (data.kind === 'revocation') {
                const delegation = delegationEnvelopes.get(data.inputs.delegation_id);
                if (!delegation) {
                    throw new Error(`revocation vector ${name} references missing delegation ${data.inputs.delegation_id}`);
                }
                const r = await verifyRevocation({
                    envelope: data.expected.envelope,
                    delegation,
                    skipSignatureVerification: true,
                });
                expect(r.ok).toBe(true);
            } else {
                // subdelegation — parent may be a root delegation or another subdelegation.
                const parentId = data.inputs.parent_id;
                const parent =
                    delegationEnvelopes.get(parentId) ??
                    subdelegationEnvelopes.get(parentId);
                if (!parent) {
                    throw new Error(
                        `subdelegation vector ${name} references missing parent ${parentId}`
                    );
                }
                const r = await verifySubdelegation({
                    envelope: data.expected.envelope,
                    parent,
                    skipSignatureVerification: true,
                    skipTemporalCheck: true,
                });
                expect(r.ok).toBe(true);
            }
        });
    }
});

type PositiveVector =
    | DelegationVector
    | ActionVector
    | RevocationVector
    | SubdelegationVector;

function reconstructCanonical(v: PositiveVector): string {
    if (v.kind === 'delegation') {
        // Canonicalize each scope (constraints sorted by key) then sort the list.
        const canonical = canonicalizeScopes(v.inputs.scopes);
        return delegationCanonicalMessage({
            principal: v.inputs.principal,
            agent: v.inputs.agent,
            scopes: canonical,
            bond_sats: v.inputs.bond?.sats ?? 0,
            bond_attestation: v.inputs.bond?.attestation_id ?? 'none',
            issued_at: v.inputs.issued_at,
            expires_at: v.inputs.expires_at,
            nonce: v.inputs.nonce,
        });
    }
    if (v.kind === 'action') {
        return actionCanonicalMessage(v.inputs);
    }
    if (v.kind === 'revocation') {
        return revocationCanonicalMessage(v.inputs);
    }
    // subdelegation
    const canonical = canonicalizeScopes(v.inputs.scopes);
    return subdelegationCanonicalMessage({
        parent_id: v.inputs.parent_id,
        principal: v.inputs.principal,
        agent: v.inputs.agent,
        scopes: canonical,
        issued_at: v.inputs.issued_at,
        expires_at: v.inputs.expires_at,
        nonce: v.inputs.nonce,
    });
}

function reconstructId(v: PositiveVector): string {
    if (v.kind === 'delegation') {
        const canonical = canonicalizeScopes(v.inputs.scopes);
        return computeDelegationId({
            principal: v.inputs.principal,
            agent: v.inputs.agent,
            scopes: canonical,
            bond_sats: v.inputs.bond?.sats ?? 0,
            bond_attestation: v.inputs.bond?.attestation_id ?? 'none',
            issued_at: v.inputs.issued_at,
            expires_at: v.inputs.expires_at,
            nonce: v.inputs.nonce,
        });
    }
    if (v.kind === 'action') return computeActionId(v.inputs);
    if (v.kind === 'revocation') return computeRevocationId(v.inputs);
    // subdelegation
    const canonical = canonicalizeScopes(v.inputs.scopes);
    return computeSubdelegationId({
        parent_id: v.inputs.parent_id,
        principal: v.inputs.principal,
        agent: v.inputs.agent,
        scopes: canonical,
        issued_at: v.inputs.issued_at,
        expires_at: v.inputs.expires_at,
        nonce: v.inputs.nonce,
    });
}

// ─────────────────────────────────────────────────────────────────────────────
// Negative vectors — verifier MUST reject with the declared error code.
// ─────────────────────────────────────────────────────────────────────────────

describe('oc-agent-protocol negative test vectors', () => {
    const negatives = vectors.filter(({ data }) => isNegative(data)) as {
        name: string;
        data: NegativeVector;
    }[];

    if (negatives.length === 0) {
        it.skip('(no negative vectors found)', () => {});
        return;
    }

    // Need positive delegation envelopes to feed verifyAction / verifyRevocation
    // for the cross-referenced negative vectors.
    const delegationEnvelopes = new Map<string, DelegationEnvelope>();
    for (const { data } of vectors) {
        if (!isNegative(data) && data.kind === 'delegation') {
            delegationEnvelopes.set(data.expected.id, data.expected.envelope);
        }
    }

    for (const { name, data } of negatives) {
        it(`${name} — verifier rejects with ${data.expected.error_code}`, async () => {
            if (data.kind === 'action') {
                const v = data as NegativeActionVector;
                const delegation = delegationEnvelopes.get(v.inputs.delegation_id);
                if (!delegation) {
                    throw new Error(
                        `negative action vector ${name} cites missing delegation ${v.inputs.delegation_id}`
                    );
                }
                // Build a syntactically well-formed action envelope from the
                // inputs (the rejection here is semantic — scope / window —
                // not structural). The id MUST be the real sha256(canonical)
                // or the verifier will short-circuit with E_BAD_ID before
                // reaching the rule we're actually testing.
                const realId = computeActionId({
                    address: v.inputs.address,
                    content_hash: v.inputs.content_hash,
                    content_length: v.inputs.content_length,
                    content_mime: v.inputs.content_mime,
                    signed_at: v.inputs.signed_at,
                    delegation_id: v.inputs.delegation_id,
                    scope_exercised: v.inputs.scope_exercised,
                });
                const action: ActionEnvelope = {
                    v: 1,
                    kind: 'agent-action',
                    id: realId,
                    content: {
                        hash: v.inputs.content_hash,
                        length: v.inputs.content_length,
                        mime: v.inputs.content_mime,
                        ref: v.inputs.content_ref ?? null,
                    },
                    signer: { address: v.inputs.address, alg: 'bip322' },
                    signed_at: v.inputs.signed_at,
                    delegation_id: v.inputs.delegation_id,
                    scope_exercised: v.inputs.scope_exercised,
                    ots: null,
                    sig: { alg: 'bip322', pubkey: v.inputs.address, value: 'AAAA' },
                };
                const r = await verifyAction({
                    action,
                    delegation,
                    skipSignatureVerification: true,
                });
                expect(r.ok).toBe(false);
                if (!r.ok) {
                    // v07 specifically allows either E_OUT_OF_WINDOW or E_EXPIRED
                    // since both fire for an action signed past the delegation's
                    // expires_at; harness_assertion documents this.
                    if (
                        v.expected.error_code === 'E_OUT_OF_WINDOW' &&
                        r.code === 'E_EXPIRED'
                    ) {
                        // accept the alternate code
                    } else {
                        expect(r.code).toBe(v.expected.error_code);
                    }
                }
            } else if (data.kind === 'revocation') {
                const v = data as NegativeRevocationVector;
                const delegation = delegationEnvelopes.get(v.inputs.delegation_id);
                if (!delegation) {
                    throw new Error(
                        `negative revocation vector ${name} cites missing delegation ${v.inputs.delegation_id}`
                    );
                }
                const realRevId = computeRevocationId({
                    address: v.inputs.address,
                    delegation_id: v.inputs.delegation_id,
                    reason: v.inputs.reason,
                    signed_at: v.inputs.signed_at,
                });
                const revocation: RevocationEnvelope = {
                    v: 1,
                    kind: 'agent-revocation',
                    id: realRevId,
                    delegation_id: v.inputs.delegation_id,
                    signer: { address: v.inputs.address, alg: 'bip322' },
                    reason: v.inputs.reason,
                    signed_at: v.inputs.signed_at,
                    ots: null,
                    sig: { alg: 'bip322', pubkey: v.inputs.address, value: 'AAAA' },
                };
                const r = await verifyRevocation({
                    envelope: revocation,
                    delegation,
                    skipSignatureVerification: true,
                });
                expect(r.ok).toBe(false);
                if (!r.ok) expect(r.code).toBe(v.expected.error_code);
            } else if (data.kind === 'delegation') {
                // Delegation negative vectors target the §7.1 grammar parser
                // directly — that's where E_BAD_SCOPE_GRAMMAR fires per
                // SPEC §8.1 step 4. Asserting parseScope throws is the
                // right level of rigor.
                const v = data as NegativeDelegationVector;
                expect(v.expected.error_code).toBe('E_BAD_SCOPE_GRAMMAR');
                for (const s of v.inputs.scopes) {
                    expect(() => parseScope(s)).toThrow(ScopeParseError);
                }
                for (const ex of v.additional_malformed_examples_for_implementer_smoke_tests ??
                    []) {
                    expect(
                        () => parseScope(ex.scope),
                        `additional malformed example: ${ex.why}`
                    ).toThrow(ScopeParseError);
                }
            } else if (data.kind === 'subdelegation') {
                // v12, v13, v14 — chain-link checks via verifySubdelegation.
                // Build a structurally valid subdelegation envelope from inputs
                // (the rejection here is semantic — scope / window / linkage —
                // not structural) and feed it to verifySubdelegation against the
                // root delegation vector.
                const v = data as NegativeSubdelegationVector;
                const parent = delegationEnvelopes.get(v.inputs.parent_id);
                if (!parent) {
                    throw new Error(
                        `negative subdelegation vector ${name} references missing parent ${v.inputs.parent_id}`
                    );
                }
                const realId = computeSubdelegationId({
                    parent_id: v.inputs.parent_id,
                    principal: v.inputs.principal,
                    agent: v.inputs.agent,
                    scopes: canonicalizeScopes(v.inputs.scopes),
                    issued_at: v.inputs.issued_at,
                    expires_at: v.inputs.expires_at,
                    nonce: v.inputs.nonce,
                });
                const sub: SubdelegationEnvelope = {
                    v: 1,
                    kind: 'agent-subdelegation',
                    id: realId,
                    parent_id: v.inputs.parent_id,
                    principal: { address: v.inputs.principal, alg: 'bip322' },
                    agent: { address: v.inputs.agent, alg: 'bip322' },
                    scopes: v.inputs.scopes,
                    issued_at: v.inputs.issued_at,
                    expires_at: v.inputs.expires_at,
                    nonce: v.inputs.nonce,
                    revocation: { holders: ['principal'], ref: null },
                    sig: { alg: 'bip322', pubkey: v.inputs.principal, value: 'AAAA' },
                };
                const r = await verifySubdelegation({
                    envelope: sub,
                    parent,
                    skipSignatureVerification: true,
                    skipTemporalCheck: true,
                });
                expect(r.ok).toBe(false);
                if (!r.ok) expect(r.code).toBe(v.expected.error_code);
            }
        });
    }
});
