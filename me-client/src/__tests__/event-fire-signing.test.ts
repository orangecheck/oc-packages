import { createHmac } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { oc } from '../index';
import { setBearerToken } from '../transport';

/**
 * The billing path's load-bearing correctness: oc.event.fire must
 *   1. sign with X-OC-Signature that byte-matches the server's
 *      event-signature.ts verifier (hmac_sha256(secret, `${t}.${body}`)),
 *   2. NEVER leak the signing secret / bearer token into the request body,
 *   3. forward the user JWT as Authorization and the idempotency key as a header.
 * A drift here 401s every live event, so it's asserted against a fresh
 * node:crypto HMAC — the same primitive the server uses.
 */

function captureFetch() {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    const mock = vi.fn(async (url: string, init: RequestInit) => {
        calls.push({ url, init });
        return {
            ok: true,
            status: 200,
            json: async () => ({ ok: true, event: { id: 'oc-me-test' } }),
            headers: { get: () => null },
        } as unknown as Response;
    });
    vi.stubGlobal('fetch', mock);
    return calls;
}

afterEach(() => {
    vi.restoreAllMocks();
    setBearerToken(null);
});

describe('oc.event.fire · request signing', () => {
    it('signs an X-OC-Signature that verifies against the exact sent body', async () => {
        const calls = captureFetch();
        const secret = 'a'.repeat(64);
        await oc.event.fire({
            project_key: 'pk_live_test',
            subtype: 'session_creation',
            signingSecret: secret,
            bearerToken: 'user.jwt.token',
            idempotencyKey: 'idem-1',
        });

        expect(calls).toHaveLength(1);
        const { init } = calls[0]!;
        const headers = init.headers as Record<string, string>;
        const body = init.body as string;

        // The secret + per-call auth never travel in the body.
        expect(body).not.toContain(secret);
        expect(body).not.toContain('signingSecret');
        expect(body).not.toContain('bearerToken');
        expect(body).not.toContain('idempotencyKey');
        expect(JSON.parse(body)).toEqual({
            project_key: 'pk_live_test',
            subtype: 'session_creation',
        });

        // User proof + idempotency ride as headers.
        expect(headers['authorization']).toBe('Bearer user.jwt.token');
        expect(headers['idempotency-key']).toBe('idem-1');

        // Integrator proof byte-matches the server (node:crypto == the SDK's subtle HMAC).
        const m = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(headers['x-oc-signature'] ?? '');
        expect(m).not.toBeNull();
        const [, t, mac] = m!;
        const expected = createHmac('sha256', secret).update(`${t}.${body}`).digest('hex');
        expect(mac).toBe(expected);
    });

    it('omits X-OC-Signature when no signingSecret (same-origin cookie path)', async () => {
        const calls = captureFetch();
        await oc.event.fire({ project_key: 'pk_test', subtype: 'session_creation' });
        const headers = calls[0]!.init.headers as Record<string, string>;
        expect(headers['x-oc-signature']).toBeUndefined();
        expect(headers['authorization']).toBeUndefined();
    });

    it('there is no user_address field to misattribute cashback', async () => {
        const calls = captureFetch();
        await oc.event.fire({
            project_key: 'pk_test',
            subtype: 'session_creation',
            // @ts-expect-error user_address was removed — the recipient is the forwarded session.
            user_address: 'bc1qattacker',
        });
        const body = calls[0]!.init.body as string;
        expect(body).not.toContain('user_address');
        expect(body).not.toContain('bc1qattacker');
    });
});
