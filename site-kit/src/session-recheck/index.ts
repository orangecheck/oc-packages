import { useEffect } from 'react';

/** The window event a page sends when a write came back 401 `several_sessions`. */
export const SESSION_RECHECK_EVENT = 'oc:session-recheck';

/**
 * True for a 401 `several_sessions` answer, and then the page reads its
 * session again: the stray cookies are cleared, and the one left can be
 * another account than the one the page showed. It never sends the write
 * again; the person does, once they see who is signed in.
 */
export function recheckOnSeveralSessions(status: number, body: unknown): boolean {
    const several =
        status === 401 &&
        typeof body === 'object' &&
        body !== null &&
        (body as { reason?: unknown }).reason === 'several_sessions';
    if (several && typeof window !== 'undefined') window.dispatchEvent(new Event(SESSION_RECHECK_EVENT));
    return several;
}

/**
 * Reads the session again each time a write says so. Mount it once inside the
 * session provider, with the provider's refresh:
 * `useSessionRecheck(useOptionalOcSession()?.refresh)`.
 */
export function useSessionRecheck(refresh: (() => unknown) | undefined): void {
    useEffect(() => {
        if (!refresh) return;
        const recheck = () => void refresh();
        window.addEventListener(SESSION_RECHECK_EVENT, recheck);
        return () => window.removeEventListener(SESSION_RECHECK_EVENT, recheck);
    }, [refresh]);
}
