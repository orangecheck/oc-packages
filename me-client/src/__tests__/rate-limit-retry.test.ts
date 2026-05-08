import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { MeClientError, withRateLimitRetry } from '../transport';

beforeEach(() => {
    vi.useFakeTimers();
});

afterEach(() => {
    vi.restoreAllMocks();
});

describe('MeClientError', () => {
    it('isRateLimited true on 429, false otherwise', () => {
        expect(new MeClientError('x', 429).isRateLimited).toBe(true);
        expect(new MeClientError('x', 503).isRateLimited).toBe(false);
        expect(new MeClientError('x', 200).isRateLimited).toBe(false);
    });

    it('preserves errorCode + retryAfterSeconds', () => {
        const e = new MeClientError('over', 429, {
            errorCode: 'project_rate_limit_exceeded',
            retryAfterSeconds: 1,
        });
        expect(e.errorCode).toBe('project_rate_limit_exceeded');
        expect(e.retryAfterSeconds).toBe(1);
    });
});

describe('withRateLimitRetry', () => {
    it('returns the result without retry on success', async () => {
        const fn = vi.fn().mockResolvedValue({ ok: true });
        const result = await withRateLimitRetry(fn);
        expect(result).toEqual({ ok: true });
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('rethrows immediately on non-429 errors', async () => {
        const fn = vi.fn().mockRejectedValue(new MeClientError('not found', 404));
        await expect(withRateLimitRetry(fn)).rejects.toThrow('not found');
        expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on 429 honoring Retry-After, then succeeds', async () => {
        let calls = 0;
        const fn = vi.fn(async () => {
            calls++;
            if (calls === 1) {
                throw new MeClientError('rl', 429, { retryAfterSeconds: 1 });
            }
            return { ok: true };
        });
        const promise = withRateLimitRetry(fn);
        // First call rejects synchronously inside the loop body.
        await vi.advanceTimersByTimeAsync(1000);
        const result = await promise;
        expect(result).toEqual({ ok: true });
        expect(fn).toHaveBeenCalledTimes(2);
    });

    it('uses exponential backoff when no Retry-After provided', async () => {
        let calls = 0;
        const fn = vi.fn(async () => {
            calls++;
            if (calls < 3) throw new MeClientError('rl', 429);
            return 'done';
        });
        const promise = withRateLimitRetry(fn, { baseBackoffMs: 100 });
        // attempt 0 → wait 100ms → attempt 1 → wait 200ms → attempt 2 succeeds
        await vi.advanceTimersByTimeAsync(100);
        await vi.advanceTimersByTimeAsync(200);
        const result = await promise;
        expect(result).toBe('done');
        expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws after maxRetries 429 attempts', async () => {
        const fn = vi.fn(async () => {
            throw new MeClientError('rl', 429, { retryAfterSeconds: 1 });
        });
        const promise = withRateLimitRetry(fn, { maxRetries: 2 });
        const captured = promise.catch((e: Error) => e);
        await vi.advanceTimersByTimeAsync(1000);
        await vi.advanceTimersByTimeAsync(1000);
        const err = (await captured) as MeClientError;
        expect(err).toBeInstanceOf(MeClientError);
        expect(err.status).toBe(429);
        expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
    });

    it('rethrows when Retry-After exceeds the cap', async () => {
        const fn = vi.fn(async () => {
            throw new MeClientError('rl', 429, { retryAfterSeconds: 600 });
        });
        await expect(
            withRateLimitRetry(fn, { maxRetryAfterSeconds: 30 })
        ).rejects.toThrow('rl');
        expect(fn).toHaveBeenCalledTimes(1);
    });
});
