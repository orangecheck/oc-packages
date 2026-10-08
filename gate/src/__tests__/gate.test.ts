/**
 * Gate regression tests. Each block corresponds to a CRITICAL / MEDIUM
 * audit finding — breaking any of these means reintroducing a known-bad
 * behavior in the layer that enforces the sybil gate in production.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

// Mock @orangecheck/sdk's `check` so we can control the upstream without
// hitting the network. Scoped per-test via vi.mocked below.
vi.mock('@orangecheck/sdk', () => ({
    check: vi.fn(),
    FANOUT_DEADLINE_MS: 4000,
}));
import { check } from '@orangecheck/sdk';

import { assertOc, DEFAULT_LOOKUP_TIMEOUT_MS } from '../core';
import type { GateOptions, MinimalReq } from '../types';

function req(partial: Partial<MinimalReq> = {}): MinimalReq {
    return { headers: {}, query: {}, ...partial };
}

beforeEach(() => {
    vi.mocked(check).mockReset();
});

describe('address resolution', () => {
    it('returns no_subject when no source resolves', async () => {
        const d = await assertOc(req(), {});
        expect(d.ok).toBe(false);
        expect(d.reason).toBe('no_subject');
    });

    it('reads from an `X-OC-Address` header', async () => {
        vi.mocked(check).mockResolvedValue({ ok: true, sats: 100, days: 30 } as never);
        const d = await assertOc(req({ headers: { 'x-oc-address': 'bc1qabc' } }), {
            address: { from: 'header' },
            trustUnsafeSources: true,
        });
        expect(d.ok).toBe(true);
        expect(d.subject).toBe('bc1qabc');
    });

    it('normalizes bech32 address case when keying the cache', async () => {
        vi.mocked(check).mockResolvedValue({ ok: true, sats: 100, days: 30 } as never);
        const opts: GateOptions = {
            address: { from: 'header' },
            trustUnsafeSources: true,
        };

        // First call — uppercase input.
        await assertOc(req({ headers: { 'x-oc-address': 'BC1QABC' } }), opts);
        expect(vi.mocked(check).mock.calls[0]![0]!.addr).toBe('bc1qabc');

        // Second call — lowercase input; should hit the cache (no new check()).
        await assertOc(req({ headers: { 'x-oc-address': 'bc1qabc' } }), opts);
        expect(vi.mocked(check)).toHaveBeenCalledTimes(1);
    });

    it('rejects oversized subject strings at the boundary', async () => {
        const huge = 'bc1q' + 'x'.repeat(200);
        const d = await assertOc(req({ headers: { 'x-oc-address': huge } }), {
            address: { from: 'header' },
            trustUnsafeSources: true,
        });
        expect(d.reason).toBe('no_subject');
    });

    it('trusts a function-based source without warning', async () => {
        vi.mocked(check).mockResolvedValue({ ok: true, sats: 100, days: 30 } as never);
        const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
        const d = await assertOc(req({ headers: {} }), {
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            address: { from: (_r: any) => 'bc1qfromfn' },
        });
        expect(d.ok).toBe(true);
        expect(warn).not.toHaveBeenCalled();
        warn.mockRestore();
    });
});

describe('lookup timeout', () => {
    it('fails closed when the upstream hangs', async () => {
        // Never resolves — simulates an upstream hang.
        vi.mocked(check).mockImplementation(() => new Promise(() => {}));
        const d = await assertOc(req({ headers: { 'x-oc-address': 'bc1qslow' } }), {
            address: { from: 'header' },
            trustUnsafeSources: true,
            lookupTimeoutMs: 50,
        });
        expect(d.ok).toBe(false);
        expect(d.reason).toBe('lookup_timeout');
    }, 1000);

    it('never fails open on its own deadline, even with failOpen', async () => {
        // A lookup the gate abandoned is not evidence of an outage.
        vi.mocked(check).mockImplementation(() => new Promise(() => {}));
        const d = await assertOc(req({ headers: { 'x-oc-address': 'bc1qhang' } }), {
            address: { from: 'header' },
            trustUnsafeSources: true,
            lookupTimeoutMs: 50,
            failOpen: true,
        });
        expect(d.ok).toBe(false);
        expect(d.reason).toBe('lookup_timeout');
    }, 1000);

    it('waits out a slow chain API by default instead of timing out first', async () => {
        // One Esplora endpoint timing out (5s) before the second answers.
        vi.useFakeTimers();
        vi.mocked(check).mockImplementation(
            () =>
                new Promise((r) =>
                    setTimeout(() => r({ ok: true, sats: 100, days: 30 } as never), 4_000 + 5_000 + 500)
                )
        );
        const pending = assertOc(req({ headers: { 'x-oc-address': 'bc1qslowchain' } }), {
            address: { from: 'header' },
            trustUnsafeSources: true,
            failOpen: true,
        });
        await vi.advanceTimersByTimeAsync(4_000 + 5_000 + 500);
        const d = await pending;
        vi.useRealTimers();
        expect(d).toMatchObject({ ok: true, reason: 'ok' });
        expect(DEFAULT_LOOKUP_TIMEOUT_MS).toBeGreaterThan(2 * 4_000 + 2 * 5_000);
    });
});

describe('failOpen', () => {
    const opts = { address: { from: 'header' }, trustUnsafeSources: true } as const;

    it('lets a request through when the upstream throws, only if opted in', async () => {
        vi.mocked(check).mockRejectedValue(new Error('relays down'));
        const closed = await assertOc(req({ headers: { 'x-oc-address': 'bc1qdown' } }), opts);
        expect(closed).toMatchObject({ ok: false, reason: 'lookup_error' });
        const open = await assertOc(req({ headers: { 'x-oc-address': 'bc1qdown' } }), {
            ...opts,
            failOpen: true,
        });
        expect(open).toMatchObject({ ok: true, reason: 'fail_open' });
    });

    it('treats a verified signature with no chain answer as an outage, not a bad proof', async () => {
        vi.mocked(check).mockResolvedValue({
            ok: false,
            sats: 0,
            days: 0,
            score: 0,
            reasons: ['sig_ok_bip322', 'bad_request', 'below_min_sats'],
        } as never);
        const closed = await assertOc(req({ headers: { 'x-oc-address': 'bc1qnochain' } }), opts);
        expect(closed).toMatchObject({ ok: false, reason: 'lookup_error' });
        const open = await assertOc(req({ headers: { 'x-oc-address': 'bc1qnochain' } }), {
            ...opts,
            failOpen: true,
        });
        expect(open).toMatchObject({ ok: true, reason: 'fail_open' });
        // Not cached: the next request asks again.
        expect(vi.mocked(check)).toHaveBeenCalledTimes(2);
    });

    it('never opens for a signature that did not verify', async () => {
        vi.mocked(check).mockResolvedValue({
            ok: false,
            sats: 0,
            days: 0,
            score: 0,
            reasons: ['sig_invalid'],
        } as never);
        const d = await assertOc(req({ headers: { 'x-oc-address': 'bc1qforged' } }), {
            ...opts,
            failOpen: true,
        });
        expect(d).toMatchObject({ ok: false, reason: 'invalid_proof' });
    });
});

describe('cache TTL clamp', () => {
    it('does not honor a TTL larger than 10 minutes', async () => {
        vi.mocked(check).mockResolvedValue({ ok: true, sats: 100, days: 30 } as never);
        const nowSpy = vi.spyOn(Date, 'now');
        const t = 1_700_000_000_000;
        nowSpy.mockReturnValue(t);

        const opts: GateOptions = {
            address: { from: 'header' },
            trustUnsafeSources: true,
            cacheTtlMs: Number.MAX_SAFE_INTEGER, // caller tries to set forever
        };
        await assertOc(req({ headers: { 'x-oc-address': 'bc1qcache' } }), opts);

        // 11 minutes later — TTL should have been clamped to 10 min, so this
        // misses the cache and calls check() a second time.
        nowSpy.mockReturnValue(t + 11 * 60_000);
        await assertOc(req({ headers: { 'x-oc-address': 'bc1qcache' } }), opts);
        expect(vi.mocked(check)).toHaveBeenCalledTimes(2);

        nowSpy.mockRestore();
    });
});
