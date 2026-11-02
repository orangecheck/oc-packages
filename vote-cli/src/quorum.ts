// A ballot is in only once two relays, each asked alone, serve it back: the
// write quorum the count's read floor assumes (`readFloor`: a count may go
// without any one relay, so a ballot only one relay holds is lost whenever that
// relay is the one it went without). An OK from a relay is not enough: some say
// OK and keep nothing. The same rule as oc-vote-web's ballot read-back; OC Agent
// SPEC §9.4 sets it for a revocation.

import { matchFilter, publishEvent, queryEvents, verifyEvent, type Filter } from '@orangecheck/nostr-core';
import { ballotId, verifyBallot, type Ballot, type SignatureVerifier } from '@orangecheck/vote-core';

import { bip322Verify } from './bip322.js';
import { DEFAULT_RELAYS, pageRelay, WRITE_QUORUM, type NostrEvent, type PublishResult, type QueryFn } from './nostr.js';

/** min(2, asked): a single relay asked must serve it itself. Never 0, so no relays is never "in". */
export function writeQuorum(asked: number): number {
    return Math.max(1, Math.min(WRITE_QUORUM, asked));
}

/** In once `serving` of the `asked` relays serve it back, each asked alone. */
export function ballotIsIn(serving: number, asked: number): boolean {
    return serving >= writeQuorum(asked);
}

/** The ballot an event carries, or null when its content is not one. */
export function ballotOf(ev: NostrEvent): Ballot | null {
    try {
        const b = JSON.parse(ev.content) as Ballot;
        return b && typeof b === 'object' && b.kind === 'oc-vote/ballot' ? b : null;
    } catch {
        return null;
    }
}

function idOf(b: Ballot): string | null {
    try {
        return ballotId(b);
    } catch {
        return null;
    }
}

/** What a count asks for (kind 30081 under the poll's `t`), narrowed to this voter's d-tag. */
function ballotFilter(b: Ballot): Filter {
    return { kinds: [30081], '#d': [`oc-vote:ballot:${b.poll_id}:${b.voter}`], '#t': [b.poll_id] };
}

export interface ReadBackOptions {
    relays?: readonly string[];
    query?: QueryFn;
    verify?: SignatureVerifier;
}

/**
 * The relays that serve a valid copy of `ballot` back. Each relay is asked alone
 * and paged under its own deadline (`pageRelay`), so one relay's answer never
 * speaks for another and a slow one holds up only itself.
 *
 * A copy counts when its Nostr id and signature hold, it matches the query a
 * count makes, it carries this ballot's ballot_id, and its own ballot signature
 * verifies. ballot_id leaves out sig.value, so a copy under the same id with a
 * junk signature does not count.
 */
export async function relaysServingBallot(ballot: Ballot, opts: ReadBackOptions = {}): Promise<string[]> {
    const relays = opts.relays ?? DEFAULT_RELAYS;
    const query = opts.query ?? queryEvents;
    const verify = opts.verify ?? bip322Verify;
    const id = ballotId(ballot);
    const filter = ballotFilter(ballot);
    // One check per distinct content, however many relays serve it.
    const checked = new Map<string, Promise<boolean>>();
    const valid = (ev: NostrEvent): Promise<boolean> => {
        if (!verifyEvent(ev) || !matchFilter(ev, filter)) return Promise.resolve(false);
        let check = checked.get(ev.content);
        if (!check) {
            const copy = ballotOf(ev);
            check =
                copy && idOf(copy) === id
                    ? verifyBallot(copy, verify).then(
                          (r) => r.ok,
                          () => false
                      )
                    : Promise.resolve(false);
            checked.set(ev.content, check);
        }
        return check;
    };

    const held = await Promise.all(
        relays.map(async (url) => {
            const read = await pageRelay(filter, url, query).catch(() => null);
            for (const ev of read?.events ?? []) if (await valid(ev)) return url;
            return null;
        })
    );
    return held.filter((u): u is string => u !== null);
}

export interface CastOptions extends ReadBackOptions {
    publish?: (event: NostrEvent, relays: readonly string[]) => Promise<PublishResult[]>;
}

/**
 * One try at getting a signed ballot in: publish `event` to the relays that did
 * not serve it back last time (`serving`), then ask every relay alone for it
 * again. `event` is signed once and sent as it is on every try, so publishing it
 * again needs no new signature.
 *
 * Returns the relays that serve a valid copy now. Tries that land on different
 * relays add up while the earlier relays still serve it; one that has dropped
 * it no longer counts, so this errs towards "not in yet", never "in".
 */
export async function castBallot(
    event: NostrEvent,
    ballot: Ballot,
    serving: readonly string[],
    opts: CastOptions = {}
): Promise<string[]> {
    const relays = opts.relays ?? DEFAULT_RELAYS;
    const missing = relays.filter((r) => !serving.includes(r));
    if (missing.length > 0) await (opts.publish ?? publishEvent)(event, missing);
    return relaysServingBallot(ballot, { ...opts, relays });
}
