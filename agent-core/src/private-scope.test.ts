// Round-trip + verifyDelegation integration for v1.2 private-scope mode.
//
// These tests don't depend on any of the cross-impl test vectors — they
// build envelopes inline using deterministic-enough inputs to verify the
// seal → embed → verify-with-key path works against agent-core's own
// expectations.

import {
    generateX25519KeyPair,
    hexEncode,
    randomBytesN,
} from '@orangecheck/lock-crypto';
import { describe, expect, it } from 'vitest';

import { computeDelegationId, delegationCanonicalMessage } from './canonical.js';
import { canonicalizeScopes } from './canonical.js';
import {
    decodeScopesPayload,
    encodeScopesPayload,
    sealScopes,
    unsealScopes,
} from './private-scope.js';
import { verifyDelegation } from './verify.js';

import type { DelegationEnvelope } from './types.js';

describe('private-scope payload codec', () => {
    it('round-trips a canonical scope list as utf-8 JSON', () => {
        const scopes = [
            'ln:send(max_sats<=1000)',
            'lock:seal(recipient=bc1qalice000000000000000000000000000000000)',
        ];
        const bytes = encodeScopesPayload(scopes);
        const decoded = decodeScopesPayload(bytes);
        // payload encodes the *canonical* form (sorted, constraints sorted).
        expect(decoded).toEqual(canonicalizeScopes(scopes));
    });

    it('rejects non-string-array payloads on decode', () => {
        const bytes = new TextEncoder().encode('"not an array"');
        expect(() => decodeScopesPayload(bytes)).toThrow();
    });
});

describe('sealScopes / unsealScopes round-trip', () => {
    it('seals to one recipient and unseals with that recipient device key', async () => {
        const principalAddress = 'bc1qprincipal000000000000000000000000000000';
        const agentKp = generateX25519KeyPair();
        const agentDevice = {
            address: 'bc1qagent0000000000000000000000000000000000',
            device_id: 'agent-test',
            device_pk: hexEncode(agentKp.public),
        };

        const sealed = await sealScopes({
            scopes: ['ln:send(max_sats<=500)'],
            sender: {
                address: principalAddress,
                signMessage: async () => 'AAAA',
            },
            recipients: [agentDevice],
        });

        expect(sealed.kind).toBe('identity');
        expect(sealed.recipients).toHaveLength(1);
        expect(sealed.from.address).toBe(principalAddress);

        const unsealed = await unsealScopes({
            envelope: sealed,
            device: { device_id: 'agent-test', secretKey: agentKp.secret },
            skipSenderVerification: true,
        });
        expect(unsealed.scopes).toEqual(['ln:send(max_sats<=500)']);
        expect(unsealed.matchedDeviceId).toBe('agent-test');
    });

    it('seals to multiple recipients; each can unseal independently', async () => {
        const agentKp = generateX25519KeyPair();
        const auditorKp = generateX25519KeyPair();

        const sealed = await sealScopes({
            scopes: ['mcp:invoke(server=https://x.com,tool=search,max_invocations<=50)'],
            sender: {
                address: 'bc1qprincipal000000000000000000000000000000',
                signMessage: async () => 'AAAA',
            },
            recipients: [
                {
                    address: 'bc1qagent0000000000000000000000000000000000',
                    device_id: 'agent',
                    device_pk: hexEncode(agentKp.public),
                },
                {
                    address: 'bc1qauditor0000000000000000000000000000000',
                    device_id: 'auditor',
                    device_pk: hexEncode(auditorKp.public),
                },
            ],
        });
        expect(sealed.recipients).toHaveLength(2);

        const byAgent = await unsealScopes({
            envelope: sealed,
            device: { device_id: 'agent', secretKey: agentKp.secret },
            skipSenderVerification: true,
        });
        const byAuditor = await unsealScopes({
            envelope: sealed,
            device: { device_id: 'auditor', secretKey: auditorKp.secret },
            skipSenderVerification: true,
        });
        expect(byAgent.scopes).toEqual(byAuditor.scopes);
    });
});

describe('verifyDelegation with v1.2 scopes_encrypted', () => {
    it('returns E_SCOPES_BOTH_PROVIDED when both fields present', async () => {
        const env = await buildPrivateEnvelope(['ln:send(max_sats<=100)']);
        // Inject a public scopes field too — illegal.
        const both = { ...env, scopes: ['ln:send(max_sats<=100)'] } as DelegationEnvelope;
        const r = await verifyDelegation({ envelope: both, skipSignatureVerification: true });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_SCOPES_BOTH_PROVIDED');
    });

    it('returns E_SCOPES_NEITHER_PROVIDED when neither field present', async () => {
        const env = await buildPrivateEnvelope(['ln:send(max_sats<=100)']);
        const neither = { ...env } as DelegationEnvelope;
        delete neither.scopes_encrypted;
        const r = await verifyDelegation({ envelope: neither, skipSignatureVerification: true });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_SCOPES_NEITHER_PROVIDED');
    });

    it('returns E_SCOPES_UNREADABLE when no decryption key is supplied', async () => {
        const env = await buildPrivateEnvelope(['ln:send(max_sats<=100)']);
        const r = await verifyDelegation({ envelope: env, skipSignatureVerification: true });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_SCOPES_UNREADABLE');
    });

    it('decrypts and verifies cleanly when a matching device key is supplied', async () => {
        const { envelope, agentSecret } = await buildPrivateEnvelopeWithKey([
            'ln:send(max_sats<=100)',
        ]);
        const r = await verifyDelegation({
            envelope,
            skipSignatureVerification: true,
            decryptScopesWith: { device_id: 'agent', secretKey: agentSecret },
        });
        expect(r.ok).toBe(true);
        if (r.ok) {
            // Hydrated envelope returned with plaintext scopes.
            expect(r.envelope.scopes).toEqual(['ln:send(max_sats<=100)']);
            expect(r.envelope.scopes_encrypted).toBeDefined();
        }
    });
});

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

async function buildPrivateEnvelope(scopes: string[]): Promise<DelegationEnvelope> {
    const r = await buildPrivateEnvelopeWithKey(scopes);
    return r.envelope;
}

async function buildPrivateEnvelopeWithKey(
    scopes: string[]
): Promise<{ envelope: DelegationEnvelope; agentSecret: Uint8Array }> {
    const principalAddress = 'bc1qprincipal000000000000000000000000000000';
    const agentAddress = 'bc1qagent0000000000000000000000000000000000';
    const agentKp = generateX25519KeyPair();

    const sealed = await sealScopes({
        scopes,
        sender: {
            address: principalAddress,
            signMessage: async () => 'AAAA',
        },
        recipients: [
            {
                address: agentAddress,
                device_id: 'agent',
                device_pk: hexEncode(agentKp.public),
            },
        ],
    });

    const issued_at = '2026-04-22T12:00:00Z';
    const expires_at = '2099-04-22T12:00:00Z';
    const nonce = hexEncode(randomBytesN(16));

    const canonInput = {
        principal: principalAddress,
        agent: agentAddress,
        scopes: canonicalizeScopes(scopes),
        bond_sats: 0,
        bond_attestation: 'none',
        issued_at,
        expires_at,
        nonce,
    };
    const id = computeDelegationId(canonInput);
    delegationCanonicalMessage(canonInput); // sanity check it builds

    const env: DelegationEnvelope = {
        v: 1,
        kind: 'agent-delegation',
        id,
        principal: { address: principalAddress, alg: 'bip322' },
        agent: { address: agentAddress, alg: 'bip322' },
        scopes_encrypted: sealed,
        bond: null,
        issued_at,
        expires_at,
        nonce,
        revocation: { holders: ['principal'], ref: null },
        sig: { alg: 'bip322', pubkey: principalAddress, value: 'AAAA' },
    };
    return { envelope: env, agentSecret: agentKp.secret };
}
