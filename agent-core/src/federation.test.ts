// Conformance: OC Agent v1.2 federation-principal vectors (FEDERATION.md §9),
// loaded from oc-agent-protocol/test-vectors/ v18–v26.

import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import {
    computeFederationDescriptorId,
    federationDescriptorCanonicalMessage,
    verifyFederationDelegation,
    verifyFederationRevocation,
    type FederationDelegationEnvelope,
    type FederationRevocationEnvelope,
} from './federation.js';
import { verifyDelegation } from './verify.js';
import type { DelegationEnvelope } from './types.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const VECTORS_DIR =
    process.env.OC_AGENT_VECTORS_DIR ??
    resolve(__dirname, '..', '..', '..', 'oc-agent-protocol', 'test-vectors');

async function load(name: string): Promise<any> {
    return JSON.parse(await readFile(resolve(VECTORS_DIR, name), 'utf8'));
}

const opts = { skipSignatureVerification: true, skipTemporalCheck: true } as const;

describe('federation descriptor (v18)', () => {
    it('canonical message + descriptor_id reconstruct byte-identical', async () => {
        const v = await load('v18-federation-descriptor-3of5.json');
        const descriptor = {
            v: 1 as const,
            kind: 'agent-federation' as const,
            threshold: v.inputs.threshold,
            guardians: v.inputs.guardians,
        };
        expect(federationDescriptorCanonicalMessage(descriptor)).toBe(
            v.expected.canonical_message
        );
        expect(computeFederationDescriptorId(descriptor)).toBe(v.expected.descriptor_id);
    });
});

describe('federation delegation vectors (v19–v24, v26)', () => {
    const cases: Array<[string, 'valid' | 'invalid']> = [
        ['v19-federation-delegation-3of5-valid.json', 'valid'],
        ['v20-federation-delegation-2of5-below-threshold.json', 'invalid'],
        ['v21-federation-delegation-duplicate-guardian.json', 'invalid'],
        ['v22-federation-delegation-unknown-guardian.json', 'invalid'],
        ['v23-federation-delegation-descriptor-id-mismatch.json', 'invalid'],
        ['v24-federation-delegation-threshold-mismatch.json', 'invalid'],
        ['v26-federation-singleaddress-baseline-unchanged.json', 'valid'],
    ];

    for (const [file, verdict] of cases) {
        it(`${file} → verifier returns ${verdict}`, async () => {
            const v = await load(file);
            const env = v.expected.envelope;
            const result =
                env.principal?.alg === 'federation'
                    ? await verifyFederationDelegation({
                          envelope: env as FederationDelegationEnvelope,
                          ...opts,
                      })
                    : await verifyDelegation({
                          envelope: env as DelegationEnvelope,
                          skipSignatureVerification: true,
                          skipTemporalCheck: true,
                      });
            expect(result.ok).toBe(verdict === 'valid');
            if (verdict === 'valid' && result.ok) {
                expect(result.id).toBe(env.id);
            }
        });
    }
});

describe('federation revocation (v25)', () => {
    it('3-of-5 threshold met → valid', async () => {
        const v = await load('v25-federation-revocation-3of5-valid.json');
        const result = await verifyFederationRevocation({
            envelope: v.expected.envelope as FederationRevocationEnvelope,
            skipSignatureVerification: true,
        });
        expect(result.ok).toBe(true);
        if (result.ok) expect(result.id).toBe(v.expected.envelope.id);
    });
});

describe('federation reject reasons (each invalid case fails for its named reason)', () => {
    it('below threshold → E_THRESHOLD_NOT_MET', async () => {
        const v = await load('v20-federation-delegation-2of5-below-threshold.json');
        const r = await verifyFederationDelegation({ envelope: v.expected.envelope, ...opts });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_THRESHOLD_NOT_MET');
    });
    it('duplicate guardian → E_DUPLICATE_GUARDIAN', async () => {
        const v = await load('v21-federation-delegation-duplicate-guardian.json');
        const r = await verifyFederationDelegation({ envelope: v.expected.envelope, ...opts });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_DUPLICATE_GUARDIAN');
    });
    it('unknown guardian → E_UNKNOWN_GUARDIAN', async () => {
        const v = await load('v22-federation-delegation-unknown-guardian.json');
        const r = await verifyFederationDelegation({ envelope: v.expected.envelope, ...opts });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_UNKNOWN_GUARDIAN');
    });
    it('descriptor_id mismatch → E_BAD_FEDERATION_DESCRIPTOR', async () => {
        const v = await load('v23-federation-delegation-descriptor-id-mismatch.json');
        const r = await verifyFederationDelegation({ envelope: v.expected.envelope, ...opts });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_BAD_FEDERATION_DESCRIPTOR');
    });
    it('threshold mismatch → E_THRESHOLD_MISMATCH', async () => {
        const v = await load('v24-federation-delegation-threshold-mismatch.json');
        const r = await verifyFederationDelegation({ envelope: v.expected.envelope, ...opts });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_THRESHOLD_MISMATCH');
    });
});
