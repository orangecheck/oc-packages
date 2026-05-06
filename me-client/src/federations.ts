/**
 * Federation directory · runtime discovery for the SDK.
 *
 * Consumes /api/federations from the configured origin (defaults to
 * me.ochk.io; override via `setOrigin()` for staging or self-hosted).
 * Multi-federation routing reads from this directory; v1 has one live
 * entry, but the SDK's shape is already plural so federation #2 is a
 * directory write rather than an SDK release.
 */

import { api } from './transport';
import type { Federation } from './types';

interface ListResponse {
    ok: boolean;
    federations: Federation[];
}

/** List every federation in the directory — recruiting, forming,
 *  binding, and live. Consumers filter by status as needed. */
async function list(): Promise<Federation[]> {
    const res = await api<ListResponse>('/api/federations');
    return res.federations ?? [];
}

/** Return only federations currently accepting bindings — i.e.
 *  status === 'live' with a non-null invite. The set the consumer
 *  wallet provider can route a user wallet to. */
async function live(): Promise<Federation[]> {
    const all = await list();
    return all.filter((f) => f.status === 'live' && typeof f.invite === 'string' && f.invite.length > 0);
}

/** Look up a single federation by slug. Returns null if the slug
 *  isn't in the directory. */
async function get(slug: string): Promise<Federation | null> {
    const all = await list();
    return all.find((f) => f.slug === slug) ?? null;
}

/** Default federation a fresh user/integrator should bind to when no
 *  explicit policy exists yet. v1: the first live federation in the
 *  directory; falls back to null if none live yet. v2+: routing
 *  policy (geography, capacity, explicit choice) consults the
 *  directory directly. */
async function defaultLive(): Promise<Federation | null> {
    const all = await live();
    return all[0] ?? null;
}

export const federations = { list, live, get, defaultLive };
