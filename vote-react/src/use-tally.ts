'use client';

// useTally(pollId) — React hook that fetches + polls /api/tally.
//
// Defaults: fetch once on mount; refetch every 60s (matches the /api/tally
// edge cache TTL so we never get stale data from our own server-side cache
// but don't thrash the relay set either). Pass { refreshMs: 0 } for no
// auto-refresh, or a custom interval.
//
// Consumers that want independent verification should NOT use this hook —
// use @orangecheck/vote-core + @orangecheck/vote-cli with their own
// node/bitcoin source. This hook trusts vote.ochk.io (or whatever baseUrl
// you pass).

import { useCallback, useEffect, useState } from 'react';

import { DEFAULT_API_BASE, POLL_ID_RE } from './types.js';
import type { TallyResponse } from './types.js';

export interface UseTallyOptions {
    baseUrl?: string;
    refreshMs?: number;
    /** If set, provides initial data (SSR hydration). */
    initialData?: TallyResponse;
}

/** A poll's own content: what it asks and when it closes. Not a count, so it
 *  outlives a failed refresh of the same poll. */
export interface PollContent {
    question?: string;
    deadline?: string;
}

export interface UseTallyState {
    data: TallyResponse | null;
    /** The last question and deadline read for this pollId, kept after a failed refresh. */
    poll: PollContent | null;
    error: Error | null;
    loading: boolean;
    refetch: () => void;
}

/** What the hook holds, always for one pollId: nothing of another poll is ever returned. */
interface Entry {
    pollId: string;
    data: TallyResponse | null;
    poll: PollContent | null;
    error: Error | null;
    loading: boolean;
}

function contentOf(d: TallyResponse | null | undefined): PollContent | null {
    if (!d || (d.question === undefined && d.deadline === undefined)) return null;
    return {
        ...(d.question !== undefined ? { question: d.question } : {}),
        ...(d.deadline !== undefined ? { deadline: d.deadline } : {}),
    };
}

export function useTally(
    pollId: string,
    opts: UseTallyOptions = {}
): UseTallyState {
    const baseUrl = opts.baseUrl ?? DEFAULT_API_BASE;
    const refreshMs = opts.refreshMs ?? 60_000;

    const [entry, setEntry] = useState<Entry>(() => ({
        pollId,
        data: opts.initialData ?? null,
        poll: contentOf(opts.initialData),
        error: null,
        loading: !opts.initialData,
    }));

    const fetchOnce = useCallback(async () => {
        // The poll this fetch is for; a later pollId keeps an answer for this one off screen.
        const pid = pollId;
        const kept = (prev: Entry) => (prev.pollId === pid ? prev.poll : null);
        if (!POLL_ID_RE.test(pid)) {
            setEntry({ pollId: pid, data: null, poll: null, error: new Error('pollId must be 64 hex chars'), loading: false });
            return;
        }
        try {
            const res = await fetch(`${baseUrl}/api/tally?poll=${pid}`);
            const body = (await res.json()) as TallyResponse;
            if (!res.ok) throw new Error(body.error ?? `http ${res.status}`);
            setEntry((prev) => ({ pollId: pid, data: body, poll: contentOf(body) ?? kept(prev), error: null, loading: false }));
        } catch (err) {
            // The last tally is no longer the answer: never show it beside the error.
            const error = err instanceof Error ? err : new Error(String(err));
            setEntry((prev) => ({ pollId: pid, data: null, poll: kept(prev), error, loading: false }));
        }
    }, [baseUrl, pollId]);

    useEffect(() => {
        void fetchOnce();
        if (refreshMs <= 0) return;
        const timer = setInterval(() => void fetchOnce(), refreshMs);
        return () => clearInterval(timer);
    }, [fetchOnce, refreshMs]);

    // Until this pollId's first answer, nothing of the last poll shows.
    const mine = entry.pollId === pollId;
    return {
        data: mine ? entry.data : null,
        poll: mine ? entry.poll : null,
        error: mine ? entry.error : null,
        loading: mine ? entry.loading : true,
        refetch: fetchOnce,
    };
}
