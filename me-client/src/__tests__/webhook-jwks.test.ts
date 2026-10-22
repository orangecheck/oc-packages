import { afterEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair } from 'jose';

import { verify } from '../webhook';

const HOUR = 60 * 60 * 1000;

async function makeSigner(kid: string) {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const jwk = { ...(await exportJWK(publicKey)), kid, alg: 'EdDSA' };
    const sign = async (body: string) => {
        const sig = await globalThis.crypto.subtle.sign(
            'Ed25519',
            privateKey as CryptoKey,
            new TextEncoder().encode(body) as unknown as ArrayBuffer
        );
        return Buffer.from(sig).toString('hex');
    };
    return { jwk, sign };
}

describe('the webhook key list, cached', () => {
    let calls = 0;
    let up = true;

    function serve(keys: unknown[]) {
        calls = 0;
        up = true;
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => {
                calls++;
                return up
                    ? new Response(JSON.stringify({ keys }), { status: 200 })
                    : new Response('unavailable', { status: 503 });
            })
        );
    }

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    it('stands in for an unreachable key list for six hours, then refuses', async () => {
        const issuer = 'https://wh-stale-cap.test';
        const { jwk, sign } = await makeSigner('wh-a');
        const body = '{"type":"test"}';
        const sig = await sign(body);
        serve([jwk]);
        const t0 = Date.now();
        expect((await verify(body, sig, 'wh-a', { issuer })).ok).toBe(true);
        up = false;
        vi.spyOn(Date, 'now').mockReturnValue(t0 + 5 * HOUR);
        expect((await verify(body, sig, 'wh-a', { issuer })).ok).toBe(true);
        vi.spyOn(Date, 'now').mockReturnValue(t0 + 6 * HOUR + 1000);
        const late = await verify(body, sig, 'wh-a', { issuer });
        expect(late.ok).toBe(false);
        expect(late.reason).toMatch(/^jwks unavailable/);
    });

    it('takes a shorter stand-in window from jwksMaxStaleMs', async () => {
        const issuer = 'https://wh-stale-option.test';
        const { jwk, sign } = await makeSigner('wh-b');
        const body = '{"type":"test"}';
        const sig = await sign(body);
        serve([jwk]);
        const t0 = Date.now();
        expect((await verify(body, sig, 'wh-b', { issuer })).ok).toBe(true);
        up = false;
        vi.spyOn(Date, 'now').mockReturnValue(t0 + 2 * HOUR);
        expect((await verify(body, sig, 'wh-b', { issuer, jwksMaxStaleMs: HOUR })).ok).toBe(false);
    });

    it('asks again for an unknown key at most once a minute', async () => {
        const issuer = 'https://wh-unknown-kid.test';
        const { jwk, sign } = await makeSigner('wh-c');
        const body = '{"type":"test"}';
        const sig = await sign(body);
        serve([jwk]);
        const t0 = Date.now();
        expect((await verify(body, sig, 'wh-c', { issuer })).ok).toBe(true);
        expect(calls).toBe(1);
        expect((await verify(body, sig, 'wh-other', { issuer })).ok).toBe(false);
        expect(calls).toBe(2);
        expect((await verify(body, sig, 'wh-other', { issuer })).ok).toBe(false);
        expect(calls).toBe(2);
        vi.spyOn(Date, 'now').mockReturnValue(t0 + 61_000);
        expect((await verify(body, sig, 'wh-other', { issuer })).ok).toBe(false);
        expect(calls).toBe(3);
    });

    it('keeps the cached keys when an unknown key arrives during an outage', async () => {
        const issuer = 'https://wh-unknown-outage.test';
        const { jwk, sign } = await makeSigner('wh-d');
        const body = '{"type":"test"}';
        const sig = await sign(body);
        serve([jwk]);
        expect((await verify(body, sig, 'wh-d', { issuer })).ok).toBe(true);
        up = false;
        expect((await verify(body, sig, 'wh-other', { issuer })).ok).toBe(false);
        expect((await verify(body, sig, 'wh-d', { issuer })).ok).toBe(true);
    });
});
