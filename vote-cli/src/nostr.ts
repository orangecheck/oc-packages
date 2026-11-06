// oc-vote's Nostr layer: @orangecheck/nostr-core for transport (which checks
// each event's id, signature and filter match), plus vote-shaped queries.

import {
    DEFAULT_RELAYS,
    queryEvents,
    readPages,
    type Filter,
    type NostrEvent,
    type QueryResult,
} from '@orangecheck/nostr-core';

export { DEFAULT_RELAYS, publishEvent, relayMaxLimit } from '@orangecheck/nostr-core';
export type { NostrEvent, PublishResult } from '@orangecheck/nostr-core';

const QUERY_TIMEOUT_MS = 8000;
/** The whole of one relay's paged read, every page together. */
const PAGED_READ_DEADLINE_MS = 2 * QUERY_TIMEOUT_MS;

export interface EventsFetch {
    events: NostrEvent[];
    /** The result stands for what exists. For `query`, a relay reached EOSE:
     *  without that, an empty or short result says nothing. For `queryPaged`,
     *  see `readShortfall`. */
    complete: boolean;
}

/** A relay finished answering only if it sent EOSE; `ok` alone also covers
 *  a relay that timed out or closed after sending some events. */
export function reachedEose(relayStatus: QueryResult['relayStatus']): boolean {
    return relayStatus.some((r) => r.eose);
}

export async function query(filter: Filter, relays?: readonly string[]): Promise<EventsFetch> {
    const { events, relayStatus } = await queryEvents(filter, relays, QUERY_TIMEOUT_MS);
    return { events, complete: reachedEose(relayStatus) };
}

/**
 * Every event under the poll's d-tag, newest first, paged per relay like the
 * ballots (`queryPaged`). Not `limit: 1`: anyone can publish under any d-tag
 * with any created_at, so callers choose by content and signature (see
 * select.ts). `complete` when a relay read to its end and none was cut off:
 * what a cut-off relay did not send may be the poll.
 */
export async function fetchPollEvents(
    pollId: string,
    relays?: readonly string[],
    queryFn?: QueryFn,
    maxLimit?: MaxLimit
): Promise<PagedFetch> {
    const read = await queryPaged({ kinds: [30080], '#d': [`oc-vote:poll:${pollId}`] }, relays, queryFn, maxLimit);
    return {
        ...read,
        complete: !read.relays.some((r) => r.truncated) && read.relays.some((r) => r.answered),
    };
}

/**
 * Every ballot in a poll, by the indexed `t` tag (relays index single-letter
 * tags only). Callers must still check each parsed ballot's `poll_id`: `t` is
 * shared by poll id, family marker and voter address.
 */
export function fetchBallotEvents(
    pollId: string,
    relays?: readonly string[],
    queryFn?: QueryFn,
    maxLimit?: MaxLimit
) {
    return queryPaged({ kinds: [30081], '#t': [pollId] }, relays, queryFn, maxLimit);
}

// A relay answers a REQ with at most its own cap of events, newest first, so
// junk under a tag can push older events out of an answer. Reads a count
// depends on page each relay alone with nostr-core's `readPages`, to the end
// of what it holds; a relay that may hold more is cut off, never answered. A
// page wholly at one second is stepped past, so what lies below it is read,
// while that relay stays cut off.

/** Events per page: a page shorter than this (nostr-core's MIN_PAGE) ends a relay's read. */
export const PAGE_SIZE = 100;
/** REQs per relay before the read is cut off. */
export const MAX_PAGES = 20;

/**
 * Relays a ballot must reach for every read at the floor to hear it: the
 * family's rule (chat-core `readFloor`, OC Chat SPEC §8.7), the one the lock,
 * vault and ochk.io device and revocation reads use.
 */
export const WRITE_QUORUM = 2;

/**
 * How many of `asked` relays must finish a read in full before a count rests
 * on it: `asked - WRITE_QUORUM + 1`, at least 1. Five asked (DEFAULT_RELAYS):
 * four. The floor plus the quorum exceeds the relays asked, so a ballot two of
 * them hold is in every read that meets the floor.
 */
export function readFloor(asked: number): number {
    return Math.max(1, asked - WRITE_QUORUM + 1);
}

export interface RelayRead {
    relay: string;
    /** Finished: EOSE for every page, down to a short page. */
    answered: boolean;
    /** Cut off: it sent events but may hold more (a full page from one second,
     *  MAX_PAGES, a NIP-11 page under 100, or it stopped answering). Not an answer. */
    truncated: boolean;
}

/**
 * Why a paged read does not stand for everything the relays hold, or null when
 * it does. A relay that was cut off holds the count: what it did not send may
 * be what decides it. Below the floor, a ballot only the silent relays hold
 * may be missing.
 */
export function readShortfall(reads: readonly RelayRead[]): string | null {
    const cut = reads.filter((r) => r.truncated).map((r) => r.relay);
    if (cut.length) return `was cut short on ${cut.join(', ')}`;
    const finished = reads.filter((r) => r.answered).length;
    const floor = readFloor(reads.length);
    return finished < floor
        ? `finished on ${finished} of ${reads.length} relays, fewer than the ${floor} a count needs`
        : null;
}

export interface PagedFetch extends EventsFetch {
    relays: RelayRead[];
}

export type QueryFn = (filter: Filter, relays: readonly string[], timeoutMs?: number) => Promise<QueryResult>;

/** The page a relay's NIP-11 document declares (nostr-core `relayMaxLimit`). */
export type MaxLimit = (relay: string) => Promise<number | undefined>;

/**
 * Every event one relay holds for `filter`, that relay asked alone, paged by
 * nostr-core's `readPages` under one deadline for the whole read. With
 * `maxLimit`, a relay that declares a page under 100 and sent anything is cut off.
 */
export async function pageRelay(filter: Filter, relay: string, queryFn: QueryFn, maxLimit?: MaxLimit) {
    // One deadline for the whole read, not a fresh timeout per page: a relay that
    // answers every page slowly would otherwise hold the read for MAX_PAGES of them.
    const deadlineAt = Date.now() + PAGED_READ_DEADLINE_MS;
    const read = await readPages(
        async (f) => {
            const budget = Math.min(QUERY_TIMEOUT_MS, deadlineAt - Date.now());
            // Out of time: cut off once it has sent anything.
            if (budget <= 0) return { events: [], relayStatus: [{ relay, eose: false }] };
            const { events, relayStatus } = await queryFn(f, [relay], budget);
            const status = relayStatus.find((s) => s.relay === relay) ?? relayStatus[0];
            // Everything the relay sent on this page, what nostr-core rejected included.
            const sent = (status?.events ?? 0) + (status?.rejected ?? 0);
            const rejected = Math.max(0, sent - events.length);
            return { events, relayStatus: [{ relay, eose: !!status?.eose, events: events.length, rejected }] };
        },
        filter,
        { limit: PAGE_SIZE, maxPages: MAX_PAGES, ...(maxLimit ? { maxLimit } : {}) }
    );
    const state = read.relayStatus?.[0]?.state ?? 'no_answer';
    return { events: read.events, read: { relay, answered: state === 'complete', truncated: state === 'cut_off' } };
}

/**
 * Every event each relay holds for `filter`, paged per relay. `complete` when
 * no relay was cut off and at least the floor finished (`readShortfall`).
 */
export async function queryPaged(
    filter: Filter,
    relays: readonly string[] = DEFAULT_RELAYS,
    queryFn: QueryFn = queryEvents,
    maxLimit?: MaxLimit
): Promise<PagedFetch> {
    const results = await Promise.all(relays.map((r) => pageRelay(filter, r, queryFn, maxLimit)));
    const byId = new Map<string, NostrEvent>();
    for (const r of results) for (const e of r.events) byId.set(e.id, e);
    return {
        events: [...byId.values()].sort((a, b) => b.created_at - a.created_at),
        complete: readShortfall(results.map((r) => r.read)) === null,
        relays: results.map((r) => r.read),
    };
}

/**
 * Every event under the poll's reveal d-tag, paged per relay like the ballot
 * read. Anyone can publish under that d-tag from fresh keys, so a flood dated
 * after the reveal pushes it out of a single read; "no reveal" stands only on
 * a read that is `complete` (`readShortfall`).
 */
export function fetchRevealEvents(
    pollId: string,
    relays?: readonly string[],
    queryFn?: QueryFn,
    maxLimit?: MaxLimit
) {
    return queryPaged({ kinds: [30082], '#d': [`oc-vote:reveal:${pollId}`] }, relays, queryFn, maxLimit);
}

// `oc-vote-poll` marker: kind 30080 is shared with other Nostr applications.
export function fetchRecentPolls(limit = 30, relays?: readonly string[]) {
    return query({ kinds: [30080], '#t': ['oc-vote-poll'], limit }, relays);
}
