/**
 * filterEvent() unit tests + TtlLru behavior.
 *
 * Covers the audit fixes explicitly so they can't silently regress:
 *   - allow-kinds + allow-pubkeys bypass paths
 *   - fail-closed by default on lookup errors
 *   - fail-open when opted-in
 *   - lookup errors get cached with a short TTL (circuit breaker)
 *   - LRU actually LRU on access (the post-audit "touch on get" fix)
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/sdk', () => ({ check: vi.fn() }));
import { check } from '@orangecheck/sdk';

import { TtlLru } from '../cache';
import { __clearFilterCachesForTests, filterEvent } from '../filter';
import type { FilterOptions, MinimalNostrEvent } from '../types';

const PUBKEY_HEX = 'a'.repeat(64);

function evt(partial: Partial<MinimalNostrEvent> = {}): MinimalNostrEvent {
    return {
        id: 'b'.repeat(64),
        pubkey: PUBKEY_HEX,
        kind: 1,
        ...partial,
    };
}

beforeEach(() => {
    vi.mocked(check).mockReset();
    // The filter keeps a process-wide cache keyed by options-signature. Drop
    // every cache entry between tests so a prior test's decision can't satisfy
    // the current test's first filterEvent() call.
    __clearFilterCachesForTests();
    // Ensure console.warn from the lookup-error path doesn't spam test output.
    vi.spyOn(console, 'warn').mockImplementation(() => {});
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('bypass paths', () => {
    it('allows kind-0 (profile metadata) by default without calling check()', async () => {
        const decision = await filterEvent(evt({ kind: 0 }), {});
        expect(decision.action).toBe('accept');
        expect(decision.reason).toBe('allowed_kind');
        expect(vi.mocked(check)).not.toHaveBeenCalled();
    });

    it('allows pubkeys listed in allowPubkeys', async () => {
        const decision = await filterEvent(evt(), { allowPubkeys: [PUBKEY_HEX] });
        expect(decision.action).toBe('accept');
        expect(decision.reason).toBe('allowed_pubkey');
        expect(vi.mocked(check)).not.toHaveBeenCalled();
    });

    it('allowKinds replaces the default set, does not extend it', async () => {
        // Empty allowKinds = no kind bypass. Kind 0 should NOT be allowed now.
        vi.mocked(check).mockResolvedValue({ ok: true, sats: 1, days: 1, score: 1 } as never);
        const decision = await filterEvent(evt({ kind: 0 }), { allowKinds: [] });
        expect(vi.mocked(check)).toHaveBeenCalledOnce();
        expect(decision.action).toBe('accept');
    });
});

describe('threshold decisions', () => {
    it('accepts when check() returns ok', async () => {
        vi.mocked(check).mockResolvedValue({
            ok: true,
            sats: 100_000,
            days: 30,
            score: 23,
        } as never);
        const decision = await filterEvent(evt(), { minSats: 100_000 });
        expect(decision.action).toBe('accept');
        expect(decision.reason).toBe('ok');
    });

    it('rejects with no_attestation when SDK reports not_found', async () => {
        vi.mocked(check).mockResolvedValue({
            ok: false,
            sats: 0,
            days: 0,
            score: 0,
            reasons: ['not_found'],
        } as never);
        const decision = await filterEvent(evt(), {});
        expect(decision.action).toBe('reject');
        expect(decision.reason).toBe('no_attestation');
        expect(decision.message).toMatch(/orangecheck/i);
    });

    it('rejects with below_threshold when reasons include below_min_sats', async () => {
        vi.mocked(check).mockResolvedValue({
            ok: false,
            sats: 50,
            days: 5,
            score: 1,
            reasons: ['below_min_sats'],
        } as never);
        const decision = await filterEvent(evt(), { minSats: 100_000 });
        expect(decision.reason).toBe('below_threshold');
    });
});

describe('lookup error handling — fail-closed default, fail-open opt-in', () => {
    it('rejects (fail-closed) when check() throws, by default', async () => {
        vi.mocked(check).mockRejectedValue(new Error('network down'));
        const decision = await filterEvent(evt(), {});
        expect(decision.action).toBe('reject');
        expect(decision.reason).toBe('lookup_error');
    });

    it('accepts when failOpen: true is explicitly set', async () => {
        vi.mocked(check).mockRejectedValue(new Error('network down'));
        const decision = await filterEvent(evt(), { failOpen: true });
        expect(decision.action).toBe('accept');
        expect(decision.reason).toBe('fail_open');
    });
});

describe('caching', () => {
    it('reuses a cached positive decision for the same pubkey + thresholds', async () => {
        vi.mocked(check).mockResolvedValue({ ok: true, sats: 1, days: 1, score: 1 } as never);
        // Reuse options so the filter's config signature matches across calls.
        const options: FilterOptions = { minSats: 100_000 };

        await filterEvent(evt(), options);
        await filterEvent(evt(), options);

        expect(vi.mocked(check)).toHaveBeenCalledOnce();
    });

    it('caches lookup errors with a short TTL to prevent thundering herd', async () => {
        vi.mocked(check).mockRejectedValue(new Error('network down'));
        const options: FilterOptions = { minSats: 100_000 };

        const first = await filterEvent(evt(), options);
        const second = await filterEvent(evt(), options);

        expect(first.reason).toBe('lookup_error');
        expect(second.reason).toBe('lookup_error');
        // Audit fix: error decisions are cached so a burst of traffic during
        // an outage doesn't all pile onto the upstream.
        expect(vi.mocked(check)).toHaveBeenCalledOnce();
    });
});

describe('TtlLru (real LRU on access, not FIFO)', () => {
    it('touching a key on get() prevents it from being evicted', () => {
        const cache = new TtlLru(2, 60_000);
        cache.set('a', { action: 'accept', reason: 'ok' });
        cache.set('b', { action: 'accept', reason: 'ok' });
        // Touch 'a' — this should move it to the end of the LRU list so
        // 'b' becomes the oldest, not 'a'.
        cache.get('a');
        // Insert 'c' — capacity is 2, so oldest (now 'b') gets evicted.
        cache.set('c', { action: 'accept', reason: 'ok' });

        expect(cache.get('a')).toBeDefined(); // 'a' survived thanks to the touch
        expect(cache.get('b')).toBeUndefined(); // 'b' was evicted
        expect(cache.get('c')).toBeDefined();
    });

    it('honors per-call TTL override', () => {
        const cache = new TtlLru(10, 60_000);
        // Insert with a short TTL.
        cache.set('a', { action: 'accept', reason: 'ok' }, 10);
        // Immediately present…
        expect(cache.get('a')).toBeDefined();
        // …but expired after the TTL.
        return new Promise<void>((resolve) => {
            setTimeout(() => {
                expect(cache.get('a')).toBeUndefined();
                resolve();
            }, 30);
        });
    });
});
