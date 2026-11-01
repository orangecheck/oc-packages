/**
 * Every event a relay holds for one filter, paged with `until`, the way
 * oc-lock-web's pagedRead and the sdk's readSubject read a subject. Anyone can
 * publish under an attestation's tags, and relays answer newest first up to
 * their cap (500 on strfry), so one read shows only the newest events: a flood
 * dated after an attestation pushes it out of the answer.
 */

/** Events per page, and pages per relay: 2,000 events. */
const PAGE_LIMIT = 500;
const MAX_PAGES = 4;
/** One deadline per relay, for the whole paged read. */
const READ_DEADLINE_MS = 6_000;
/** Relays a write is in effect on (OC Chat SPEC §8.7), for the read floor. */
const WRITE_QUORUM = 2;

/**
 * How one relay's read ended. complete: its last page came back short.
 * cut_off: a full page that added nothing (stuck on one second), the page
 * bound, or a stop (deadline, CLOSED, error, drop) after events arrived.
 * no_answer: nothing arrived.
 */
export type ReadState = 'complete' | 'cut_off' | 'no_answer';

interface WireEvent {
    id?: string;
    created_at?: number;
}

export function readRelay(
    url: string,
    filter: Record<string, unknown>,
    deadlineMs = READ_DEADLINE_MS
): Promise<{ events: unknown[]; state: ReadState }> {
    return new Promise((resolve) => {
        const events: unknown[] = [];
        const seen = new Set<string>();
        let sent = 0;
        let page = 0;
        let inPage = 0;
        let fresh = 0;
        let until: number | undefined;
        let sub = '';
        let settled = false;
        let ws: WebSocket;
        const finish = (state: ReadState) => {
            if (settled) return;
            settled = true;
            clearTimeout(timer);
            try {
                ws.close();
            } catch {
                // already closed
            }
            resolve({ events, state });
        };
        const stop = () => finish(sent > 0 ? 'cut_off' : 'no_answer');
        const timer = setTimeout(stop, deadlineMs);
        const ask = () => {
            page++;
            inPage = 0;
            fresh = 0;
            sub = `oc-index-${page}-${Math.random().toString(36).slice(2, 8)}`;
            ws.send(JSON.stringify(['REQ', sub, { ...filter, limit: PAGE_LIMIT, ...(until !== undefined ? { until } : {}) }]));
        };
        try {
            ws = new WebSocket(url);
        } catch {
            clearTimeout(timer);
            resolve({ events, state: 'no_answer' });
            return;
        }
        ws.onopen = () => {
            try {
                ask();
            } catch {
                stop();
            }
        };
        ws.onmessage = (m: MessageEvent) => {
            try {
                const frame = JSON.parse(String(m.data));
                if (!Array.isArray(frame) || frame[1] !== sub) return;
                if (frame[0] === 'EVENT' && frame[2] && typeof frame[2] === 'object') {
                    const ev = frame[2] as WireEvent;
                    inPage++;
                    sent++;
                    const key = typeof ev.id === 'string' ? ev.id : JSON.stringify(ev);
                    if (!seen.has(key)) {
                        seen.add(key);
                        fresh++;
                        events.push(frame[2]);
                    }
                    if (typeof ev.created_at === 'number') until = Math.min(until ?? Infinity, ev.created_at);
                } else if (frame[0] === 'CLOSED') {
                    // Refused or ended: not an answer, whatever it sent.
                    stop();
                } else if (frame[0] === 'EOSE') {
                    try {
                        ws.send(JSON.stringify(['CLOSE', sub]));
                    } catch {
                        // closing anyway
                    }
                    if (inPage < PAGE_LIMIT) return finish('complete');
                    if (fresh === 0 || page >= MAX_PAGES) return finish('cut_off');
                    ask();
                }
            } catch {
                // ignore malformed frames
            }
        };
        ws.onerror = () => stop();
        ws.onclose = () => stop();
    });
}

/**
 * The filter on every relay. `complete` only when the read floor of relays
 * asked (those asked, less the write quorum, plus one) finished with a short
 * page and none was cut off: only then does what it did not find count as not there.
 */
export async function readSubject(
    filter: Record<string, unknown>,
    relays: readonly string[]
): Promise<{ events: unknown[]; complete: boolean }> {
    const reads = await Promise.all(relays.map((url) => readRelay(url, filter)));
    const floor = Math.max(1, relays.length - WRITE_QUORUM + 1);
    const finished = reads.filter((r) => r.state === 'complete').length;
    return {
        events: reads.flatMap((r) => r.events),
        complete: finished >= floor && !reads.some((r) => r.state === 'cut_off'),
    };
}
