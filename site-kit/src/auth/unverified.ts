import type { NextApiRequest, NextApiResponse } from 'next';

import { answerSeveralSessions, SeveralSessions } from './several';

/** How long to wait before asking again: one refresh of the auth host's list of ended sessions. */
export const SESSION_UNVERIFIED_RETRY_AFTER_SECONDS = 60;

/**
 * A site's session reader throws this when the auth host's list of ended
 * sessions can't vouch for the caller's session, so the route answers 503
 * through `answersUnverified` rather than reading the caller as signed out.
 */
export class SessionUnverified extends Error {
    constructor() {
        super('session_unverified');
        this.name = 'SessionUnverified';
    }
}

/** 503 `{ ok: false, error: 'session_unverified' }`, `Retry-After: 60`, never cached. */
export function answerSessionUnverified(res: NextApiResponse): void {
    res.setHeader('Retry-After', String(SESSION_UNVERIFIED_RETRY_AFTER_SECONDS));
    res.setHeader('Cache-Control', 'no-store, private');
    res.status(503).json({ ok: false, error: 'session_unverified' });
}

/**
 * Wraps an API route whose session reader throws `SessionUnverified` or
 * `SeveralSessions`. The first answers 503 `session_unverified`, for a read as
 * for a write, and the person stays signed in. The second answers 401
 * `several_sessions` and clears the stray cookies (`answerSeveralSessions`).
 * Anything else thrown passes through, and so does either once the route has
 * started its answer.
 */
export function answersUnverified<Req extends NextApiRequest, Res extends NextApiResponse, R>(
    handler: (req: Req, res: Res) => R | Promise<R>,
): (req: Req, res: Res) => Promise<R | undefined> {
    return async function unverifiedAnswered(req, res) {
        try {
            return await handler(req, res);
        } catch (err) {
            if (res.headersSent) throw err;
            if (err instanceof SessionUnverified) answerSessionUnverified(res);
            else if (err instanceof SeveralSessions) answerSeveralSessions(req, res);
            else throw err;
            return undefined;
        }
    };
}
