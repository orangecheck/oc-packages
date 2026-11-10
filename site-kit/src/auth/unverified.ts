import type { NextApiRequest, NextApiResponse } from 'next';

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
 * Wraps an API route whose session reader throws `SessionUnverified`: that
 * answers 503 `session_unverified`, for a read as for a write, and the person
 * stays signed in. Anything else thrown passes through, and so does
 * `SessionUnverified` once the route has started its answer.
 */
export function answersUnverified<Req extends NextApiRequest, Res extends NextApiResponse>(
    handler: (req: Req, res: Res) => unknown,
): (req: Req, res: Res) => Promise<unknown> {
    return async function unverifiedAnswered(req, res) {
        try {
            return await handler(req, res);
        } catch (err) {
            if (!(err instanceof SessionUnverified) || res.headersSent) throw err;
            answerSessionUnverified(res);
        }
    };
}
