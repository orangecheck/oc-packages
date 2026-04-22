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
}));
import { check } from '@orangecheck/sdk';

import { assertOc } from '../core';
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
        expect(d.reason).toBe('lookup_error');
    }, 1000);

    it('fails open only when explicitly opted in', async () => {
        vi.mocked(check).mockImplementation(() => new Promise(() => {}));
        const d = await assertOc(req({ headers: { 'x-oc-address': 'bc1qhang' } }), {
            address: { from: 'header' },
            trustUnsafeSources: true,
            lookupTimeoutMs: 50,
            failOpen: true,
        });
        expect(d.ok).toBe(true);
        expect(d.reason).toBe('fail_open');
    }, 1000);
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
