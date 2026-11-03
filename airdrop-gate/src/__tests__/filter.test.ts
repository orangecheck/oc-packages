/**
 * filterAllowlist tests.
 *
 * Pins the audit-addressed behaviors:
 *  - concurrency-bounded parallelism (no unbounded fan-out)
 *  - de-dupe with order preservation
 *  - an unread candidate (chain or relays silent, or a lookup that threw) is
 *    retried, then listed in `unread`: never in `ok`, and never in `rejected`
 *    as if it fell short (chain-read-failures PK2)
 *  - rejectOnError=false throws AirdropUnreadError when one stays unread
 *  - progress callback fires once per decided candidate
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/sdk', () => ({ check: vi.fn() }));
import { check } from '@orangecheck/sdk';

import { AirdropUnreadError, filterAllowlist } from '../index';

beforeEach(() => {
    vi.mocked(check).mockReset();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('filterAllowlist — basic decisions', () => {
    it('partitions passes from fails and preserves input order in `ok`', async () => {
        vi.mocked(check).mockImplementation(async ({ addr }) => {
            // bc1qgood pass, bc1qbad fail.
            const ok = addr === 'bc1qgood';
            return {
                ok,
                sats: ok ? 100_000 : 0,
                days: ok ? 30 : 0,
                score: ok ? 23 : 0,
                reasons: ok ? [] : ['below_min_sats'],
            };
        });

        const result = await filterAllowlist(
            ['bc1qgood', 'bc1qbad', 'bc1qalsogood'],
            { minSats: 100_000 }
        );

        expect(result.ok).toEqual(['bc1qgood']);
        expect(result.rejected).toHaveLength(2);
        expect(result.all).toHaveLength(3);
        expect(result.rejected[0]!.address).toBe('bc1qbad');
        expect(result.rejected[0]!.reasons).toContain('below_min_sats');
    });

    it('also treats bc1qalsogood as passing when both pass', async () => {
        vi.mocked(check).mockResolvedValue({
            ok: true,
            sats: 100_000,
            days: 30,
            score: 23,
        });

        const result = await filterAllowlist(['bc1qalsogood', 'bc1qgood']);
        // Input-order preserved in `ok`.
        expect(result.ok).toEqual(['bc1qalsogood', 'bc1qgood']);
    });
});

describe('de-duplication', () => {
    it('drops exact duplicates before checking', async () => {
        vi.mocked(check).mockResolvedValue({
            ok: true,
            sats: 1,
            days: 1,
            score: 1,
        });

        const result = await filterAllowlist([
            'bc1q1',
            'bc1q1', // exact dup
            '  bc1q2  ', // whitespace-trimmed dup path
            'bc1q2',
            'bc1q3',
        ]);

        // 3 unique addresses, so check() called 3 times.
        expect(vi.mocked(check)).toHaveBeenCalledTimes(3);
        expect(result.ok).toEqual(['bc1q1', 'bc1q2', 'bc1q3']);
    });

    it('drops empty/whitespace-only lines entirely', async () => {
        vi.mocked(check).mockResolvedValue({
            ok: true,
            sats: 1,
            days: 1,
            score: 1,
        });

        const result = await filterAllowlist(['', '   ', 'bc1qonly']);
        expect(result.ok).toEqual(['bc1qonly']);
        expect(vi.mocked(check)).toHaveBeenCalledTimes(1);
    });
});

describe('unread candidates are retried, then listed, never dropped as short (PK2)', () => {
    const fast = { retryDelayMs: 0 };
    const res = (reasons: string[]) => ({ ok: false, sats: 0, days: 0, score: 0, reasons });

    it('a lookup that throws is unread, asked twice more, and left off ok', async () => {
        vi.mocked(check).mockImplementation(async ({ addr }) => {
            if (addr === 'bc1qflaky') throw new Error('upstream timeout');
            return { ok: true, sats: 1, days: 1, score: 1 };
        });

        const result = await filterAllowlist(['bc1qflaky', 'bc1qgood'], fast);

        expect(result.ok).toEqual(['bc1qgood']);
        expect(result.rejected).toEqual([]);
        expect(result.unread).toHaveLength(1);
        expect(result.unread[0]).toMatchObject({ address: 'bc1qflaky', unread: 'lookup_error' });
        expect(result.unread[0]!.reasons[1]).toMatch(/upstream timeout/);
        expect(vi.mocked(check).mock.calls.filter(([p]) => p.addr === 'bc1qflaky')).toHaveLength(3);
    });

    it.each([
        ['an sdk before 1.21.0 (bad_request beside the signature)', ['sig_ok_bip322', 'bad_request', 'below_min_sats', 'below_min_days']],
        ['sdk 1.21.0 chain_unread', ['sig_ok_bip322', 'bad_request', 'chain_unread']],
    ])('a chain that did not answer, from %s, is unread, never below_min_sats', async (_w, reasons) => {
        vi.mocked(check).mockResolvedValue(res(reasons));
        const result = await filterAllowlist(['bc1qbonded'], { ...fast, minSats: 100_000 });
        expect(result.ok).toEqual([]);
        expect(result.rejected).toEqual([]);
        expect(result.unread).toMatchObject([{ address: 'bc1qbonded', unread: 'chain_unread' }]);
    });

    it('a candidate the retry reads is decided by that read', async () => {
        vi.mocked(check)
            .mockResolvedValueOnce(res(['sig_ok_bip322', 'bad_request', 'chain_unread']))
            .mockResolvedValueOnce({ ok: true, sats: 500_000, days: 90, score: 9 });
        const result = await filterAllowlist(['bc1qlate'], fast);
        expect(result.ok).toEqual(['bc1qlate']);
        expect(result.unread).toEqual([]);
    });

    it.each(['utxo_cap_unread', 'provider_refused_unread'])('%s is unread and not asked again', async (code) => {
        vi.mocked(check).mockResolvedValue(res([code]));
        const result = await filterAllowlist(['bc1qdusted'], fast);
        expect(result.unread).toMatchObject([{ address: 'bc1qdusted', unread: code }]);
        expect(vi.mocked(check)).toHaveBeenCalledTimes(1);
    });

    it('a candidate whose coins were read and fall short is rejected', async () => {
        vi.mocked(check).mockResolvedValue({ ok: false, sats: 10, days: 1, score: 0, reasons: ['below_min_sats'] });
        const result = await filterAllowlist(['bc1qthin'], { ...fast, minSats: 100_000 });
        expect(result.rejected).toMatchObject([{ address: 'bc1qthin', reasons: ['below_min_sats'] }]);
        expect(result.unread).toEqual([]);
    });

    it('rejectOnError=false throws AirdropUnreadError, carrying the whole result', async () => {
        vi.mocked(check).mockRejectedValue(new Error('boom'));
        const err = await filterAllowlist(['bc1qflaky'], { ...fast, rejectOnError: false }).catch((e: unknown) => e);
        expect(err).toBeInstanceOf(AirdropUnreadError);
        expect((err as AirdropUnreadError).result.unread[0]!.reasons[1]).toMatch(/boom/);
        expect((err as AirdropUnreadError).message).toContain('bc1qflaky (lookup_error)');
    });
});

describe('concurrency bound', () => {
    it('never runs more than `concurrency` check() calls in flight at once', async () => {
        let active = 0;
        let peak = 0;
        vi.mocked(check).mockImplementation(async () => {
            active++;
            peak = Math.max(peak, active);
            await new Promise((r) => setTimeout(r, 5));
            active--;
            return { ok: true, sats: 1, days: 1, score: 1 };
        });

        const addresses = Array.from({ length: 20 }, (_, i) => `bc1q${i}`);
        await filterAllowlist(addresses, { concurrency: 3 });

        expect(peak).toBeLessThanOrEqual(3);
        expect(peak).toBeGreaterThan(1); // confirm parallelism actually happens
    });
});

describe('onProgress callback', () => {
    it('fires exactly once per decided candidate with monotonically-increasing done counter', async () => {
        vi.mocked(check).mockResolvedValue({
            ok: true,
            sats: 1,
            days: 1,
            score: 1,
        });

        const progress: Array<{ done: number; total: number }> = [];
        const addresses = ['bc1qa', 'bc1qb', 'bc1qc'];
        await filterAllowlist(addresses, {
            onProgress: (done, total) => {
                progress.push({ done, total });
            },
        });

        expect(progress.map((p) => p.done).sort()).toEqual([1, 2, 3]);
        expect(progress.every((p) => p.total === 3)).toBe(true);
    });
});
