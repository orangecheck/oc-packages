// @vitest-environment jsdom
// useTally after a failed refresh: the last tally must not stay on screen
// beside the error, as if it were still the answer.

import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { TallyResponse } from './types.js';
import { useTally } from './use-tally.js';

const PID = 'ab'.repeat(32);
const tally = (yes: number, no: number): TallyResponse => ({
    poll_id: PID,
    state: 'tallied',
    tallies: { yes, no },
    turnout: { voters: yes + no, weight: yes + no },
});
/** What fetch resolves to: the parts of a Response the hook reads. */
const answer = (status: number, body: unknown) => ({ ok: status >= 200 && status < 300, status, json: async () => body });

afterEach(() => vi.unstubAllGlobals());

describe('useTally', () => {
    it('drops the last tally when a refresh is refused, so no old numbers sit beside the error', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(answer(200, tally(3, 1)))
                .mockResolvedValueOnce(answer(503, { poll_id: PID, error: "can't count: too few relays answered" }))
        );
        const { result } = renderHook(() => useTally(PID, { refreshMs: 0 }));
        await waitFor(() => expect(result.current.data).toEqual(tally(3, 1)));

        await act(() => result.current.refetch());
        expect(result.current.error?.message).toBe("can't count: too few relays answered");
        expect(result.current.data).toBeNull();
    });

    it('drops it on a network failure too, and the next good answer shows a tally again', async () => {
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockResolvedValueOnce(answer(200, tally(3, 1)))
                .mockRejectedValueOnce(new TypeError('failed to fetch'))
                .mockResolvedValueOnce(answer(200, tally(5, 1)))
        );
        const { result } = renderHook(() => useTally(PID, { refreshMs: 0 }));
        await waitFor(() => expect(result.current.data).toEqual(tally(3, 1)));

        await act(() => result.current.refetch());
        expect(result.current).toMatchObject({ data: null, error: new TypeError('failed to fetch') });

        await act(() => result.current.refetch());
        expect(result.current).toMatchObject({ data: tally(5, 1), error: null });
    });

    it('drops initial data for a poll id that is not 64 hex chars', async () => {
        vi.stubGlobal('fetch', vi.fn());
        const { result } = renderHook(() => useTally('not-a-poll-id', { refreshMs: 0, initialData: tally(3, 1) }));
        await waitFor(() => expect(result.current.error?.message).toBe('pollId must be 64 hex chars'));
        expect(result.current.data).toBeNull();
    });

    it('drops server-rendered initial data when the first fetch fails', async () => {
        vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(answer(502, { poll_id: PID, error: 'upstream' })));
        const { result } = renderHook(() => useTally(PID, { refreshMs: 0, initialData: tally(3, 1) }));
        await waitFor(() => expect(result.current.error?.message).toBe('upstream'));
        expect(result.current.data).toBeNull();
    });

    it('reads the new poll when pollId changes, and never shows the old one meanwhile', async () => {
        const B = 'ef'.repeat(32);
        const fetchMock = vi
            .fn()
            .mockResolvedValueOnce(answer(200, tally(3, 1)))
            .mockResolvedValueOnce(answer(200, { ...tally(0, 2), poll_id: B }));
        vi.stubGlobal('fetch', fetchMock);
        const { result, rerender } = renderHook(({ id }) => useTally(id, { refreshMs: 0 }), {
            initialProps: { id: PID },
        });
        await waitFor(() => expect(result.current.data).toEqual(tally(3, 1)));
        rerender({ id: B });
        expect(result.current.data).toBeNull();
        await waitFor(() => expect(result.current.data?.poll_id).toBe(B));
        expect(fetchMock).toHaveBeenLastCalledWith(expect.stringContaining(`poll=${B}`));
    });

    it('ignores an answer for the poll before a pollId change, whichever lands last', async () => {
        const B = 'ef'.repeat(32);
        let answerA: (v: unknown) => void = () => {};
        let answerB: (v: unknown) => void = () => {};
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockReturnValueOnce(new Promise((r) => (answerA = r)))
                .mockReturnValueOnce(new Promise((r) => (answerB = r)))
        );
        const { result, rerender } = renderHook(({ id }) => useTally(id, { refreshMs: 0 }), {
            initialProps: { id: PID },
        });
        rerender({ id: B });
        await act(async () => answerB(answer(200, { ...tally(0, 2), poll_id: B })));
        await act(async () => answerA(answer(200, tally(3, 1))));
        expect(result.current.loading).toBe(false);
        expect(result.current.data?.poll_id).toBe(B);
    });

    it('lets a newer refusal stand over an older success that lands after it', async () => {
        let first: (v: unknown) => void = () => {};
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockReturnValueOnce(new Promise((r) => (first = r)))
                .mockResolvedValueOnce(answer(503, { poll_id: PID, error: 'not counted: too few relays' }))
        );
        const { result } = renderHook(() => useTally(PID, { refreshMs: 0 }));
        await act(() => result.current.refetch());
        await act(async () => first(answer(200, tally(9, 0))));
        expect(result.current.error?.message).toBe('not counted: too few relays');
        expect(result.current.data).toBeNull();
    });

    it('lets a newer success stand over an older failure that lands after it', async () => {
        let first: (v: unknown) => void = () => {};
        vi.stubGlobal(
            'fetch',
            vi
                .fn()
                .mockReturnValueOnce(new Promise((r) => (first = r)))
                .mockResolvedValueOnce(answer(200, tally(4, 1)))
        );
        const { result } = renderHook(() => useTally(PID, { refreshMs: 0 }));
        await act(() => result.current.refetch());
        await act(async () => first(answer(503, { poll_id: PID, error: 'an older refusal' })));
        expect(result.current.error).toBeNull();
        expect(result.current.data).toEqual(tally(4, 1));
    });
});
