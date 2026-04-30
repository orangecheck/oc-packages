import type { Session, SessionPolicy, SignInOptions, TelemetryEvent } from './types';

import { api } from './transport';

const DEFAULT_POLICY: SessionPolicy = {
    duration_seconds: 7 * 24 * 60 * 60, // 7 days, standard SaaS shape
    refresh: 'sliding',
    sensitive_actions: 're-auth',
};

const telemetrySubscribers = new Set<(e: TelemetryEvent) => void>();

/** Subscribe to non-billable developer telemetry events. Call the returned
 *  function to unsubscribe. */
export function onTelemetry(listener: (e: TelemetryEvent) => void): () => void {
    telemetrySubscribers.add(listener);
    return () => {
        telemetrySubscribers.delete(listener);
    };
}

function emitTelemetry(code: TelemetryEvent['code'], session_id?: string): void {
    const e: TelemetryEvent = {
        code,
        timestamp: new Date().toISOString(),
        ...(session_id ? { session_id } : {}),
    };
    for (const fn of telemetrySubscribers) {
        try {
            fn(e);
        } catch {
            /* listener errors must not break the session flow */
        }
    }
}

/**
 * Open a sign-in flow at me.ochk.io. Returns the resulting Session once
 * the user consents (Class C billable event for the integrating site,
 * cashback for the user). Internally this opens the OC consent UI in a
 * popup; v1 implementations may also redirect.
 */
async function create(opts: SignInOptions): Promise<Session> {
    const policy: SessionPolicy = { ...DEFAULT_POLICY, ...(opts.sessionPolicy ?? {}) };
    return api<Session>('/api/session/create', {
        method: 'POST',
        body: {
            scope: opts.scope,
            policy,
            return_to: opts.returnTo ?? (typeof window !== 'undefined' ? window.location.href : undefined),
        },
    });
}

/**
 * Refresh a still-valid session inside its policy window. Free for the
 * integrating site (does NOT instantiate a billable event); emits a
 * `session.token_refresh` telemetry record.
 */
async function refresh(sessionId: string): Promise<Session> {
    emitTelemetry('session.token_refresh', sessionId);
    return api<Session>('/api/session/refresh', {
        method: 'POST',
        body: { session_id: sessionId },
    });
}

/** Invalidate a session. Free, telemetry-only. */
async function invalidate(sessionId: string): Promise<void> {
    emitTelemetry('session.intra_signin', sessionId);
    await api<{ ok: true }>('/api/session/invalidate', {
        method: 'POST',
        body: { session_id: sessionId },
    });
}

export const session = { create, refresh, invalidate };
