import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exportJWK, generateKeyPair } from 'jose';

import { _resetWebhookWarningForTests, verify, type OcPublicJwk } from '../webhook';

/** What a receiver gets back, and refuses, from the fields every delivery signs. */

const NOW = Date.parse('2026-12-01T12:00:00.000Z');
const DAY = 24 * 60 * 60 * 1000;

async function signer() {
    const { privateKey, publicKey } = await generateKeyPair('EdDSA', { crv: 'Ed25519', extractable: true });
    const jwk = { ...(await exportJWK(publicKey)), kid: 'wh-fields', alg: 'EdDSA' } as OcPublicJwk;
    const sign = async (body: string) =>
        Buffer.from(
            await globalThis.crypto.subtle.sign(
                'Ed25519',
                privateKey as CryptoKey,
                new TextEncoder().encode(body) as unknown as ArrayBuffer
            )
        ).toString('hex');
    return { jwk, sign };
}

const notice = (fields: Record<string, unknown> = {}) =>
    JSON.stringify({
        kind: 'oc-system-event',
        subtype: 'escrow.low',
        id: 'sys_1',
        project_key: 'pk_live_mine',
        issued_at: new Date(NOW - 60_000).toISOString(),
        ...fields,
    });

let s: Awaited<ReturnType<typeof signer>>;
const check = async (body: string, options: Record<string, unknown> = { project: 'pk_live_mine' }) =>
    verify(body, await s.sign(body), 'wh-fields', { jwk: s.jwk, ...options });

beforeEach(async () => {
    s = await signer();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    _resetWebhookWarningForTests();
});

afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
});

describe('the fields every delivery signs', () => {
    it('answers the signed id, project and time', async () => {
        expect(await check(notice())).toEqual({
            ok: true,
            id: 'sys_1',
            project_key: 'pk_live_mine',
            issued_at: new Date(NOW - 60_000).toISOString(),
        });
    });

    it('refuses a delivery signed for another project', async () => {
        const r = await check(notice({ project_key: 'pk_test_theirs' }));
        expect(r).toEqual({ ok: false, reason: 'signed for another project (pk_test_theirs)' });
    });

    it('takes a day, and refuses past it', async () => {
        expect((await check(notice({ issued_at: new Date(NOW - DAY).toISOString() }))).ok).toBe(true);
        const r = await check(notice({ issued_at: new Date(NOW - DAY - 1000).toISOString() }));
        expect(r).toEqual({ ok: false, reason: 'older than the accepted age (issued_at)' });
    });

    it('takes a shorter window from maxAgeSeconds', async () => {
        const body = notice({ issued_at: new Date(NOW - 2 * 3600_000).toISOString() });
        expect((await check(body, { project: 'pk_live_mine' })).ok).toBe(true);
        expect((await check(body, { project: 'pk_live_mine', maxAgeSeconds: 3600 })).ok).toBe(false);
    });

    it.each([
        ['NaN', Number.NaN],
        ['Infinity', Number.POSITIVE_INFINITY],
        ['0', 0],
        ['a negative', -1],
        ['a string', '3600'],
        ['null', null],
    ])('refuses every delivery, before any key is fetched, for a maxAgeSeconds of %s', async (_, maxAgeSeconds) => {
        const fetch = vi.spyOn(globalThis, 'fetch');
        const fresh = notice({ issued_at: new Date(NOW).toISOString() });
        const reason = 'maxAgeSeconds must be a finite number above 0';
        expect(await check(fresh, { project: 'pk_live_mine', maxAgeSeconds })).toEqual({ ok: false, reason });
        // Without a jwk, verify would fetch the key list first.
        const body = notice();
        const options = { project: 'pk_live_mine', maxAgeSeconds } as Record<string, unknown>;
        expect(await verify(body, await s.sign(body), 'wh-fields', options)).toEqual({ ok: false, reason });
        expect(fetch).not.toHaveBeenCalled();
    });

    it('takes a fractional maxAgeSeconds: half a second takes a delivery that old, not one a second old', async () => {
        const half = { project: 'pk_live_mine', maxAgeSeconds: 0.5 };
        expect((await check(notice({ issued_at: new Date(NOW - 500).toISOString() }), half)).ok).toBe(true);
        const r = await check(notice({ issued_at: new Date(NOW - 1000).toISOString() }), half);
        expect(r).toEqual({ ok: false, reason: 'older than the accepted age (issued_at)' });
    });

    it('keeps the window it checked when the caller changes maxAgeSeconds during the key fetch', async () => {
        const body = notice({ issued_at: new Date(NOW - 2 * 3600_000).toISOString() });
        const jwk = { ...s.jwk, kid: 'wh-reread' };
        const options = { project: 'pk_live_mine', maxAgeSeconds: 3600 };
        vi.spyOn(globalThis, 'fetch').mockImplementation(async () => {
            // A shared options object reloaded from an unset env var while this call waits.
            options.maxAgeSeconds = Number.NaN;
            return new Response(JSON.stringify({ keys: [jwk] }), { status: 200 });
        });
        expect(await verify(body, await s.sign(body), 'wh-reread', options)).toEqual({
            ok: false,
            reason: 'older than the accepted age (issued_at)',
        });
    });

    it('takes five minutes ahead of this clock, and refuses more', async () => {
        expect((await check(notice({ issued_at: new Date(NOW + 300_000).toISOString() }))).ok).toBe(true);
        const r = await check(notice({ issued_at: new Date(NOW + 301_000).toISOString() }));
        expect(r).toEqual({ ok: false, reason: 'issued_at is in the future' });
    });

    it.each([
        ['no id', { id: undefined }],
        ['an empty id', { id: '' }],
        ['no project_key', { project_key: undefined }],
        ['no issued_at', { issued_at: undefined }],
        ['issued_at in seconds', { issued_at: String(NOW / 1000) }],
        ['issued_at with an offset', { issued_at: '2026-12-01T12:59:00+01:00' }],
        ['issued_at that is no date', { issued_at: '2026-13-45T99:00:00Z' }],
        ['issued_at on a day that does not exist', { issued_at: '2026-02-30T12:00:00.000Z' }],
        ['issued_at at second 60', { issued_at: '2026-12-01T11:58:60.000Z' }],
    ])('refuses a signed body with %s', async (_name, fields) => {
        const r = await check(notice(fields));
        expect(r).toEqual({ ok: false, reason: 'missing a signed id, project_key or issued_at' });
    });

    it('refuses a signed body that is not a JSON object', async () => {
        expect(await check('[1,2]')).toEqual({ ok: false, reason: 'body is not a JSON object' });
        expect(await check('not json')).toEqual({ ok: false, reason: 'body is not JSON' });
    });

    it('checks the signature before any field', async () => {
        const body = notice({ project_key: 'pk_test_theirs' });
        const r = await verify(body, await s.sign(notice()), 'wh-fields', { jwk: s.jwk, project: 'pk_live_mine' });
        expect(r).toEqual({ ok: false, reason: 'signature does not match' });
    });
});

describe('verify without project', () => {
    it('accepts any project and warns once per process', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        expect((await check(notice({ project_key: 'pk_test_theirs' }), {})).ok).toBe(true);
        expect((await check(notice(), {})).ok).toBe(true);
        expect(warn).toHaveBeenCalledTimes(1);
        expect(String(warn.mock.calls[0]![0])).toMatch(/without `project`.*any project.*next major/);
    });

    it('does not warn when project is passed', async () => {
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        await check(notice());
        await check(notice({ project_key: 'pk_test_theirs' }));
        expect(warn).not.toHaveBeenCalled();
    });
});
