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

import { useCallback, useEffect, useRef, useState } from 'react';

import { DEFAULT_API_BASE, POLL_ID_RE } from './types.js';
import type { TallyResponse } from './types.js';

export interface UseTallyOptions {
    baseUrl?: string;
    refreshMs?: number;
    /** If set, provides initial data (SSR hydration). */
    initialData?: TallyResponse;
}

export interface UseTallyState {
    data: TallyResponse | null;
    error: Error | null;
    loading: boolean;
    refetch: () => void;
}

export function useTally(
    pollId: string,
    opts: UseTallyOptions = {}
): UseTallyState {
    const baseUrl = opts.baseUrl ?? DEFAULT_API_BASE;
    const refreshMs = opts.refreshMs ?? 60_000;

    const [data, setData] = useState<TallyResponse | null>(opts.initialData ?? null);
    const [error, setError] = useState<Error | null>(null);
    const [loading, setLoading] = useState(!opts.initialData);
    const pollIdRef = useRef(pollId);
    pollIdRef.current = pollId;

    const fetchOnce = useCallback(async () => {
        const pid = pollIdRef.current;
        if (!POLL_ID_RE.test(pid)) {
            setError(new Error('pollId must be 64 hex chars'));
            setLoading(false);
            return;
        }
        try {
            const res = await fetch(`${baseUrl}/api/tally?poll=${pid}`);
            const body = (await res.json()) as TallyResponse;
            if (!res.ok) throw new Error(body.error ?? `http ${res.status}`);
            setData(body);
            setError(null);
        } catch (err) {
            setError(err instanceof Error ? err : new Error(String(err)));
        } finally {
            setLoading(false);
        }
    }, [baseUrl]);

    useEffect(() => {
        void fetchOnce();
        if (refreshMs <= 0) return;
        const timer = setInterval(() => void fetchOnce(), refreshMs);
        return () => clearInterval(timer);
    }, [fetchOnce, refreshMs]);

    return { data, error, loading, refetch: fetchOnce };
}
