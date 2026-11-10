import type { NextApiRequest, NextApiResponse } from 'next';
import { describe, expect, it } from 'vitest';

import { recorder } from './fixtures';
import { answerSessionUnverified, answersUnverified, SessionUnverified } from './unverified';

const req = { method: 'GET', headers: {} } as unknown as NextApiRequest;

async function run(handler: (req: NextApiRequest, res: NextApiResponse) => unknown, sent = false) {
    const { res, out } = recorder();
    const r = Object.assign(res, { headersSent: sent }) as unknown as NextApiResponse;
    await answersUnverified(handler)(req, r);
    return out;
}

describe('answersUnverified', () => {
    it('answers SessionUnverified 503 session_unverified, Retry-After 60, never cached', async () => {
        const out = await run(async () => {
            throw new SessionUnverified();
        });
        expect(out.status).toBe(503);
        expect(out.body).toEqual({ ok: false, error: 'session_unverified' });
        expect(out.headers['retry-after']).toBe('60');
        expect(out.headers['cache-control']).toBe('no-store, private');
    });

    it('answers it thrown before the first await too', async () => {
        const out = await run(() => {
            throw new SessionUnverified();
        });
        expect(out.status).toBe(503);
    });

    it('leaves the route its own answer when nothing is thrown', async () => {
        const out = await run((_q, res) => res.status(200).json({ ok: true }));
        expect(out).toMatchObject({ status: 200, body: { ok: true } });
        expect(out.headers['retry-after']).toBeUndefined();
    });

    it('lets any other error out, an Error named the same included', async () => {
        const plain = new Error('session_unverified');
        await expect(run(() => Promise.reject(plain))).rejects.toBe(plain);
        const lookalike = Object.assign(new Error('x'), { name: 'SessionUnverified' });
        await expect(run(() => Promise.reject(lookalike))).rejects.toBe(lookalike);
    });

    it('lets SessionUnverified out once the route has started its answer', async () => {
        const err = new SessionUnverified();
        await expect(run(() => Promise.reject(err), true)).rejects.toBe(err);
    });
});

describe('answerSessionUnverified', () => {
    it('is the same 503 a route answers', () => {
        const { res, out } = recorder();
        answerSessionUnverified(res as unknown as NextApiResponse);
        expect(out).toEqual({
            status: 503,
            body: { ok: false, error: 'session_unverified' },
            headers: { 'retry-after': '60', 'cache-control': 'no-store, private' },
        });
    });
});
