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
    delegationCanonicalMessage,
    revocationCanonicalMessage,
} from './canonical.js';
import { verifyAction, verifyDelegation, verifyRevocation } from './verify.js';
import type {
    ActionEnvelope,
    DelegationEnvelope,
    RevocationEnvelope,
} from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VECTORS_DIR = resolve(__dirname, '..', '..', '..', 'oc-agent-protocol', 'test-vectors');

interface BaseVector {
    description: string;
    kind: 'delegation' | 'action' | 'revocation';
    expected: {
        canonical_message: string;
        canonical_message_bytes_len: number;
        id: string;
        envelope: DelegationEnvelope | ActionEnvelope | RevocationEnvelope;
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

type Vector = DelegationVector | ActionVector | RevocationVector;

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

    // First pass: the vectors can cross-reference each other (action cites delegation id).
    // We'll need the envelopes keyed for the verifyAction tests.
    const delegationEnvelopes = new Map<string, DelegationEnvelope>();
    for (const { data } of vectors) {
        if (data.kind === 'delegation') {
            delegationEnvelopes.set(data.expected.id, data.expected.envelope);
        }
    }

    for (const { name, data } of vectors) {
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
            } else {
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
            }
        });
    }
});

function reconstructCanonical(v: Vector): string {
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
    return revocationCanonicalMessage(v.inputs);
}

function reconstructId(v: Vector): string {
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
    return computeRevocationId(v.inputs);
}
