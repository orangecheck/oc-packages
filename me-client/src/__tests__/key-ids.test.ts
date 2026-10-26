import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair, type KeyObject } from 'jose';

import { verifyActivityAttestation, type ActivityAttestation, type ActivityAttestationBundle } from '../identity';
import { verify } from '../webhook';

/**
 * A kid must name one of the key set's own keys. A kid that names no key in
 * the set is refused whatever it spells, and a key set may use any string as a
 * kid. Both key sets here are fetched, never passed in.
 */

const NAMES = ['constructor', '__proto__', 'toString', 'hasOwnProperty', 'valueOf'];

function serve(keys: unknown[]): void {
    vi.stubGlobal('fetch', async () => new Response(JSON.stringify({ keys }), { status: 200 }));
}

async function signer(kid: string) {
    const { privateKey, publicKey } = (await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true })) as {
        privateKey: KeyObject;
        publicKey: KeyObject;
    };
    const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'EdDSA' };
    const sign = async (bytes: Uint8Array) =>
        Buffer.from(
            await globalThis.crypto.subtle.sign(
                'Ed25519',
                privateKey as unknown as CryptoKey,
                bytes as unknown as ArrayBuffer
            )
        ).toString('hex');
    return { jwk, sign };
}

async function attestation(kid: string, sign: (b: Uint8Array) => Promise<string>): Promise<ActivityAttestationBundle> {
    const body: Omit<ActivityAttestation, 'id'> = {
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
        expires_at: new Date(Date.now() + 60_000).toISOString(),
    };
    const canonical = new TextEncoder().encode(JSON.stringify(body));
    const id = Buffer.from(
        await globalThis.crypto.subtle.digest('SHA-256', canonical as unknown as ArrayBuffer)
    ).toString('hex');
    return {
        attestation: { id, ...body },
        sig: await sign(canonical),
        kid,
        canonical_b64: Buffer.from(canonical).toString('base64'),
    };
}

afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
});

describe('webhook key ids', () => {
    const body = '{"type":"test"}';
    const bytes = new TextEncoder().encode(body);

    it.each(NAMES)('a kid that names no key in the set (%s) is refused', async (kid) => {
        const inSet = await signer('real-kid');
        const outside = await signer(kid);
        serve([inSet.jwk]);
        const r = await verify(body, await outside.sign(bytes), kid, { issuer: `https://wh-none-${kid}.test` });
        expect(r.ok).toBe(false);
    });

    it.each(NAMES)('a set may name its own key %s, and that key verifies', async (kid) => {
        const own = await signer(kid);
        serve([own.jwk]);
        expect((await verify(body, await own.sign(bytes), kid, { issuer: `https://wh-own-${kid}.test` })).ok).toBe(true);
    });
});

describe('key ids that join the set after it was cached', () => {
    it('webhook: a key named toString that joins later verifies', async () => {
        const issuer = 'https://wh-join.test';
        const first = await signer('real-kid');
        const later = await signer('toString');
        const body = '{"type":"test"}';
        const bytes = new TextEncoder().encode(body);
        serve([first.jwk]);
        expect((await verify(body, await first.sign(bytes), 'real-kid', { issuer })).ok).toBe(true);
        serve([first.jwk, later.jwk]);
        expect((await verify(body, await later.sign(bytes), 'toString', { issuer })).ok).toBe(true);
    });

    it('attestation: a key named toString that joins later verifies', async () => {
        const issuer = 'https://id-join.test';
        const first = await signer('real-kid');
        const later = await signer('toString');
        serve([first.jwk]);
        expect((await verifyActivityAttestation(await attestation('real-kid', first.sign), { issuer })).ok).toBe(true);
        serve([first.jwk, later.jwk]);
        expect((await verifyActivityAttestation(await attestation('toString', later.sign), { issuer })).ok).toBe(true);
    });
});

describe('activity attestation key ids', () => {
    it.each(NAMES)('a kid that names no key in the set (%s) is refused', async (kid) => {
        const inSet = await signer('real-kid');
        const outside = await signer(kid);
        serve([inSet.jwk]);
        const r = await verifyActivityAttestation(await attestation(kid, outside.sign), {
            issuer: `https://id-none-${kid}.test`,
        });
        expect(r.ok).toBe(false);
    });

    it.each(NAMES)('a set may name its own key %s, and that key verifies', async (kid) => {
        const own = await signer(kid);
        serve([own.jwk]);
        const r = await verifyActivityAttestation(await attestation(kid, own.sign), { issuer: `https://id-own-${kid}.test` });
        expect(r.ok).toBe(true);
    });
});
