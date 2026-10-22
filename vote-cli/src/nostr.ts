// oc-vote's Nostr layer: @orangecheck/nostr-core for transport (which checks
// each event's id, signature and filter match), plus vote-shaped queries.

import {
    DEFAULT_RELAYS,
    queryEvents,
    type Filter,
    type NostrEvent,
    type QueryResult,
} from '@orangecheck/nostr-core';

export { DEFAULT_RELAYS, publishEvent } from '@orangecheck/nostr-core';
export type { NostrEvent, PublishResult } from '@orangecheck/nostr-core';

const QUERY_TIMEOUT_MS = 8000;

export interface EventsFetch {
    events: NostrEvent[];
    /** At least one relay reached EOSE. Without that, an empty or short
     *  result says nothing about what exists. */
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
 * Every event under the poll's d-tag, newest first. Not `limit: 1`: anyone
 * can publish under any d-tag with any created_at, so callers choose by
 * content and signature (see select.ts).
 */
export function fetchPollEvents(pollId: string, relays?: readonly string[]) {
    return query({ kinds: [30080], '#d': [`oc-vote:poll:${pollId}`] }, relays);
}

/**
 * Every ballot in a poll, by the indexed `t` tag (relays index single-letter
 * tags only). Callers must still check each parsed ballot's `poll_id`: `t` is
 * shared by poll id, family marker and voter address.
 */
export function fetchBallotEvents(pollId: string, relays?: readonly string[], queryFn?: QueryFn) {
    return queryPaged({ kinds: [30081], '#t': [pollId] }, relays, queryFn);
}

// A relay answers a REQ with at most its own cap of events, newest first, so
// junk under a tag can push older events out of an answer. Reads a count
// depends on page each relay with `until` until a short page.

/** Events per page: below every reference relay's cap, so a short page means the end. */
export const PAGE_SIZE = 100;
/** Pages per relay before the read is reported as cut short. */
export const MAX_PAGES = 20;

export interface RelayRead {
    relay: string;
    /** Sent EOSE for every page. */
    answered: boolean;
    /** Answered, but more events exist than were paged through. */
    truncated: boolean;
}

export interface PagedFetch extends EventsFetch {
    relays: RelayRead[];
}

export type QueryFn = (filter: Filter, relays: readonly string[], timeoutMs?: number) => Promise<QueryResult>;

async function pageRelay(filter: Filter, relay: string, queryFn: QueryFn) {
    const byId = new Map<string, NostrEvent>();
    const done = (answered: boolean, truncated = false) => ({
        events: [...byId.values()],
        read: { relay, answered, truncated },
    });
    let until: number | undefined;
    for (let page = 0; page < MAX_PAGES; page++) {
        const { events, relayStatus } = await queryFn(
            { ...filter, limit: PAGE_SIZE, ...(until !== undefined ? { until } : {}) },
            [relay],
            QUERY_TIMEOUT_MS
        );
        const status = relayStatus.find((s) => s.relay === relay) ?? relayStatus[0];
        if (!status?.eose) return done(false);
        for (const e of events) byId.set(e.id, e);
        if (events.length < PAGE_SIZE) return done(true);
        const oldest = Math.min(...events.map((e) => e.created_at));
        // A whole page from one second cannot be paged past with `until`.
        if (events.every((e) => e.created_at === oldest)) return done(true, true);
        // Inclusive: the boundary second is read again, so none of it is skipped.
        until = oldest;
    }
    return done(true, true);
}

/** Every event each relay holds for `filter`, paged per relay; `complete` when any relay answered. */
export async function queryPaged(
    filter: Filter,
    relays: readonly string[] = DEFAULT_RELAYS,
    queryFn: QueryFn = queryEvents
): Promise<PagedFetch> {
    const results = await Promise.all(relays.map((r) => pageRelay(filter, r, queryFn)));
    const byId = new Map<string, NostrEvent>();
    for (const r of results) for (const e of r.events) byId.set(e.id, e);
    return {
        events: [...byId.values()].sort((a, b) => b.created_at - a.created_at),
        complete: results.some((r) => r.read.answered),
        relays: results.map((r) => r.read),
    };
}

/** Every event under the poll's reveal d-tag; same reasoning as `fetchPollEvents`. */
export function fetchRevealEvents(pollId: string, relays?: readonly string[]) {
    return query({ kinds: [30082], '#d': [`oc-vote:reveal:${pollId}`] }, relays);
}

// `oc-vote-poll` marker: kind 30080 is shared with other Nostr applications.
export function fetchRecentPolls(limit = 30, relays?: readonly string[]) {
    return query({ kinds: [30080], '#t': ['oc-vote-poll'], limit }, relays);
}
