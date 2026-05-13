import { afterEach, describe, expect, it, vi } from 'vitest';
import { generateKeyPair, exportJWK, type KeyObject } from 'jose';

import {
    verifyActivityAttestation,
    type ActivityAttestation,
    type ActivityAttestationBundle,
} from '../identity';

/**
 * Generate a synthetic attestation signed by a fresh ed25519 key,
 * exported as JWK. The verifier accepts the JWK via the `jwk`
 * option · no live JWKS fetch needed for these tests.
 */
async function makeAttestation(
    overrides: Partial<ActivityAttestation> = {}
): Promise<{
    bundle: ActivityAttestationBundle;
    jwk: { kty: 'OKP'; crv: 'Ed25519'; x: string; kid: string; alg: 'EdDSA' };
}> {
    const { privateKey, publicKey } = (await generateKeyPair('EdDSA', {
        crv: 'Ed25519',
        extractable: true,
    })) as { privateKey: KeyObject; publicKey: KeyObject };
    const pubJwk = (await exportJWK(publicKey)) as {
        kty: 'OKP';
        crv: 'Ed25519';
        x: string;
    };
    // Use first 10 chars of `x` as a stable kid for the test fixture.
    const kid = 'test-' + pubJwk.x.slice(0, 10);

    const future = new Date(Date.now() + 60_000).toISOString();
    const attestation: Omit<ActivityAttestation, 'id'> = {
        v: 1,
        kind: 'oc-me-activity',
        did_oc: 'did:bip322:bc1qabc',
        event_count: 42,
        human_event_count: 40,
        lifetime_sats: 12500,
        distinct_integrator_count: 4,
        oldest_event_at: '2026-04-01T00:00:00.000Z',
        active_days: 28,
        computed_at: new Date().toISOString(),
        expires_at: future,
        ...overrides,
    };
    const canonical = new TextEncoder().encode(
        JSON.stringify({
            v: attestation.v,
            kind: attestation.kind,
            did_oc: attestation.did_oc,
            event_count: attestation.event_count,
            human_event_count: attestation.human_event_count,
            lifetime_sats: attestation.lifetime_sats,
            distinct_integrator_count: attestation.distinct_integrator_count,
            oldest_event_at: attestation.oldest_event_at,
            active_days: attestation.active_days,
            computed_at: attestation.computed_at,
            expires_at: attestation.expires_at,
        })
    );
    const subtle = globalThis.crypto.subtle;
    const idBytes = new Uint8Array(
        await subtle.digest('SHA-256', canonical as unknown as ArrayBuffer)
    );
    const id = bytesToHex(idBytes);
    const sigBuffer = await subtle.sign(
        'Ed25519',
        privateKey as unknown as CryptoKey,
        canonical as unknown as ArrayBuffer
    );
    const sigHex = bytesToHex(new Uint8Array(sigBuffer));
    const canonical_b64 = Buffer.from(canonical).toString('base64');
    const jwk = {
        kty: 'OKP' as const,
        crv: 'Ed25519' as const,
        x: pubJwk.x,
        kid,
        alg: 'EdDSA' as const,
    };
    return {
        bundle: {
            attestation: { id, ...attestation },
            sig: sigHex,
            kid,
            canonical_b64,
        },
        jwk,
    };
}

function bytesToHex(b: Uint8Array): string {
    let out = '';
    for (const x of b) out += x.toString(16).padStart(2, '0');
    return out;
}

describe('oc.identity.verifyActivityAttestation', () => {
    afterEach(() => {
        vi.restoreAllMocks();
    });

    it('returns ok=true on a freshly signed valid bundle (with embedded jwk)', async () => {
        const { bundle, jwk } = await makeAttestation();
        const result = await verifyActivityAttestation(bundle, { jwk });
        expect(result.ok).toBe(true);
        expect(result.attestation?.lifetime_sats).toBe(12500);
        expect(result.checks.every((c) => c.ok)).toBe(true);
    });

    it('rejects a bundle whose canonical_b64 has been tampered (id mismatch)', async () => {
        const { bundle, jwk } = await makeAttestation();
        const tampered: ActivityAttestationBundle = {
            ...bundle,
            canonical_b64: Buffer.from(
                Buffer.concat([
                    Buffer.from(bundle.canonical_b64, 'base64'),
                    Buffer.from([0]),
                ])
            ).toString('base64'),
        };
        const result = await verifyActivityAttestation(tampered, { jwk });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/id does not match/);
        const idCheck = result.checks.find((c) =>
            c.label.includes('sha256(canonical_bytes)')
        );
        expect(idCheck?.ok).toBe(false);
    });

    it('rejects a bundle whose sig has been swapped from another attestation', async () => {
        const { bundle: bundleA, jwk } = await makeAttestation();
        const { bundle: bundleB } = await makeAttestation({
            lifetime_sats: 999999,
        });
        const swapped: ActivityAttestationBundle = { ...bundleA, sig: bundleB.sig };
        const result = await verifyActivityAttestation(swapped, { jwk });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/signature does not match/);
    });

    it('rejects a bundle whose kid does not match the provided jwk', async () => {
        const { bundle, jwk } = await makeAttestation();
        const mismatchedJwk = { ...jwk, kid: 'definitely-different-kid' };
        const result = await verifyActivityAttestation(bundle, {
            jwk: mismatchedJwk,
        });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/kid mismatch/);
    });

    it('rejects an attestation past its expires_at', async () => {
        const { bundle, jwk } = await makeAttestation({
            expires_at: new Date(Date.now() - 60_000).toISOString(),
        });
        const result = await verifyActivityAttestation(bundle, { jwk });
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/expired/);
        const freshness = result.checks.find((c) =>
            c.label.includes('expires_at')
        );
        expect(freshness?.ok).toBe(false);
    });

    it('rejects malformed bundle shape with a clear reason (no throw)', async () => {
        // @ts-expect-error · intentionally malformed
        const result = await verifyActivityAttestation({ totally: 'wrong' }, {});
        expect(result.ok).toBe(false);
        expect(result.reason).toMatch(/shape/);
    });

    it('short-circuits on bad shape · returns single failed check', async () => {
        // @ts-expect-error · intentionally malformed
        const result = await verifyActivityAttestation(null, {});
        expect(result.ok).toBe(false);
        expect(result.checks.length).toBe(1);
        expect(result.checks[0]!.ok).toBe(false);
    });

    it('respects an injected `now` for deterministic freshness checks', async () => {
        const { bundle, jwk } = await makeAttestation({
            expires_at: '2026-06-01T00:00:00.000Z',
        });
        // "now" is BEFORE expires_at · should pass
        const before = await verifyActivityAttestation(bundle, {
            jwk,
            now: new Date('2026-05-15T00:00:00.000Z'),
        });
        expect(before.ok).toBe(true);
        // "now" is AFTER expires_at · should fail
        const after = await verifyActivityAttestation(bundle, {
            jwk,
            now: new Date('2026-07-01T00:00:00.000Z'),
        });
        expect(after.ok).toBe(false);
        expect(after.reason).toMatch(/expired/);
    });
});
