// oc-vote's Nostr layer: @orangecheck/nostr-core for transport (which checks
// each event's id, signature and filter match), plus vote-shaped queries.

import {
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
export function fetchBallotEvents(pollId: string, relays?: readonly string[]) {
    return query({ kinds: [30081], '#t': [pollId] }, relays);
}

/** Every event under the poll's reveal d-tag; same reasoning as `fetchPollEvents`. */
export function fetchRevealEvents(pollId: string, relays?: readonly string[]) {
    return query({ kinds: [30082], '#d': [`oc-vote:reveal:${pollId}`] }, relays);
}

// `oc-vote-poll` marker: kind 30080 is shared with other Nostr applications.
export function fetchRecentPolls(limit = 30, relays?: readonly string[]) {
    return query({ kinds: [30080], '#t': ['oc-vote-poll'], limit }, relays);
}
