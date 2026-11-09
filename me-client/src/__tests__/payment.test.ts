import { afterEach, describe, expect, it, vi } from 'vitest';

import { payment } from '../payment';
import { clearBearerToken, setBearerToken } from '../transport';

type Sent = { auth: string | null; body: Record<string, unknown> };

// Each request answers only after the test lets it, so two calls can be in flight at once.
function stubFetch() {
    const sent: Sent[] = [];
    const release: Array<() => void> = [];
    vi.stubGlobal('fetch', async (_url: RequestInfo | URL, init?: RequestInit) => {
        const headers = new Headers(init?.headers);
        sent.push({ auth: headers.get('authorization'), body: JSON.parse(String(init?.body)) });
        await new Promise<void>((r) => release.push(r));
        return Response.json({ id: 'pay_x', status: 'authorized' });
    });
    const settle = async (calls = 1) => {
        for (let i = 0; i < 100 && release.length < calls; i++) await Promise.resolve();
        expect(release).toHaveLength(calls);
        for (const r of release) r();
    };
    return { sent, settle };
}

afterEach(() => {
    vi.unstubAllGlobals();
    clearBearerToken();
});

describe('payment.authorize with a per-call bearerToken', () => {
    it('sends the token as Authorization and keeps it out of the body', async () => {
        const { sent, settle } = stubFetch();
        const done = payment.authorize({
            amount_sats: 2100,
            description: 'one coffee',
            bearerToken: 'user-a.jwt',
        });
        await settle();
        await expect(done).resolves.toEqual({ id: 'pay_x', status: 'authorized' });
        expect(sent).toHaveLength(1);
        expect(sent[0]!.auth).toBe('Bearer user-a.jwt');
        expect(sent[0]!.body).toEqual({ amount_sats: 2100, description: 'one coffee' });
    });

    it('gives two people paying at once their own token each, whatever the global holds', async () => {
        const { sent, settle } = stubFetch();
        setBearerToken('someone-else.jwt');
        const a = payment.authorize({ amount_sats: 1, description: 'a', bearerToken: 'user-a.jwt' });
        const b = payment.authorize({ amount_sats: 2, description: 'b', bearerToken: 'user-b.jwt' });
        await settle(2);
        await Promise.all([a, b]);
        expect(sent.map((s) => [s.body.description, s.auth])).toEqual([
            ['a', 'Bearer user-a.jwt'],
            ['b', 'Bearer user-b.jwt'],
        ]);
    });

    it('still uses setBearerToken when no per-call token is given', async () => {
        const { sent, settle } = stubFetch();
        setBearerToken('browser-user.jwt');
        const done = payment.authorize({ usd_cents: 500, description: 'tip' });
        await settle();
        await done;
        expect(sent[0]!.auth).toBe('Bearer browser-user.jwt');
        expect(sent[0]!.body).toEqual({ usd_cents: 500, description: 'tip' });
    });
});
