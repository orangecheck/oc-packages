// A signed object (poll, ballot, reveal, stamp) is in only once two relays, each
// asked alone, serve it back: the write quorum the readers' floor assumes
// (`readFloor`: a count may go without any one relay, so an object only one
// relay holds is lost whenever that relay is the one it went without). An OK
// from a relay is not enough: some say OK and keep nothing. OC Vote SPEC §3.4;
// oc-vote-web reads ballots back the same way, and OC Agent SPEC §9.4 sets the
// rule for a revocation.

import { matchFilter, publishEvent, queryEvents, verifyEvent, type Filter } from '@orangecheck/nostr-core';
import { parseStamp, verify as stampVerify, type StampEnvelope } from '@orangecheck/stamp-core';
import {
    ballotId,
    pollId,
    revealId,
    verifyBallot,
    verifyPoll,
    verifyReveal,
    type Ballot,
    type Poll,
    type Reveal,
    type SignatureVerifier,
} from '@orangecheck/vote-core';

import { STAMP_KIND } from './anchors.js';
import { bip322Verify } from './bip322.js';
import { DEFAULT_RELAYS, pageRelay, WRITE_QUORUM, type NostrEvent, type PublishResult, type QueryFn } from './nostr.js';

/** min(2, asked): a single relay asked must serve it itself. Never 0, so no relays is never "in". */
export function writeQuorum(asked: number): number {
    return Math.max(1, Math.min(WRITE_QUORUM, asked));
}

/** In once `serving` of the `asked` relays serve it back, each asked alone. */
export function isIn(serving: number, asked: number): boolean {
    return serving >= writeQuorum(asked);
}

/** The object of `kind` that `content` holds, or null when it holds none. */
function parsed<T>(content: string, kind: string): T | null {
    try {
        const o = JSON.parse(content) as { kind?: unknown } | null;
        return o && typeof o === 'object' && o.kind === kind ? (o as T) : null;
    } catch {
        return null;
    }
}

/** The ballot an event carries, or null when its content is not one. */
export function ballotOf(ev: NostrEvent): Ballot | null {
    return parsed<Ballot>(ev.content, 'oc-vote/ballot');
}

/** The poll an event carries, or null when its content is not one. */
export function pollOf(ev: NostrEvent): Poll | null {
    return parsed<Poll>(ev.content, 'oc-vote/poll');
}

/** The reveal an event carries, or null when its content is not one. */
export function revealOf(ev: NostrEvent): Reveal | null {
    return parsed<Reveal>(ev.content, 'oc-vote/reveal');
}

/** The OC Stamp `content` holds, or null when it holds none. */
function stampIn(content: string): StampEnvelope | null {
    try {
        return parseStamp(JSON.parse(content));
    } catch {
        return null;
    }
}

/** The OC Stamp an event carries, or null when its content is not one. */
export function stampOf(ev: NostrEvent): StampEnvelope | null {
    return stampIn(ev.content);
}

/** `id(x)`, or null where it throws (content too deep or malformed to hash). */
function safely<T>(id: (x: T) => string, x: T): string | null {
    try {
        return id(x);
    } catch {
        return null;
    }
}

export interface ReadBackOptions {
    relays?: readonly string[];
    query?: QueryFn;
    verify?: SignatureVerifier;
}

/**
 * The relays that serve back a copy `accept` takes. Each relay is asked alone
 * and paged under its own deadline (`pageRelay`), so one relay's answer never
 * speaks for another and a slow one holds up only itself. A copy is judged only
 * if its Nostr id and signature hold and it matches `filter`, the query a
 * reader makes: a relay can send anything. `accept` judges the content alone,
 * so each distinct content is judged once, however many relays serve it.
 */
export async function relaysServing(
    filter: Filter,
    accept: (content: string) => Promise<boolean>,
    opts: ReadBackOptions = {}
): Promise<string[]> {
    const relays = opts.relays ?? DEFAULT_RELAYS;
    const query = opts.query ?? queryEvents;
    const checked = new Map<string, Promise<boolean>>();
    const valid = (ev: NostrEvent): Promise<boolean> => {
        if (!verifyEvent(ev) || !matchFilter(ev, filter)) return Promise.resolve(false);
        let check = checked.get(ev.content);
        if (!check) {
            check = accept(ev.content).catch(() => false);
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

/**
 * The relays that serve a valid copy of `ballot` back, asked the way a count
 * asks (kind 30081 under the poll's `t`), narrowed to this voter's d-tag. A copy
 * counts when it carries this ballot's ballot_id and its own ballot signature
 * verifies. ballot_id leaves out sig.value, so a copy under the same id with a
 * junk signature does not count.
 */
export function relaysServingBallot(ballot: Ballot, opts: ReadBackOptions = {}): Promise<string[]> {
    const id = ballotId(ballot);
    const verify = opts.verify ?? bip322Verify;
    const filter: Filter = { kinds: [30081], '#d': [`oc-vote:ballot:${ballot.poll_id}:${ballot.voter}`], '#t': [ballot.poll_id] };
    return relaysServing(
        filter,
        async (content) => {
            const copy = parsed<Ballot>(content, 'oc-vote/ballot');
            return !!copy && safely(ballotId, copy) === id && (await verifyBallot(copy, verify)).ok;
        },
        opts
    );
}

/**
 * The relays that serve a valid copy of `poll` back, asked the way the poll
 * lookup asks (kind 30080 under its d-tag). A copy counts when it hashes to this
 * poll id and the creator's signature verifies.
 */
export function relaysServingPoll(poll: Poll, opts: ReadBackOptions = {}): Promise<string[]> {
    const id = pollId(poll);
    const verify = opts.verify ?? bip322Verify;
    return relaysServing(
        { kinds: [30080], '#d': [`oc-vote:poll:${id}`] },
        async (content) => {
            const copy = parsed<Poll>(content, 'oc-vote/poll');
            return !!copy && safely(pollId, copy) === id && (await verifyPoll(copy, verify)).ok;
        },
        opts
    );
}

/** What a count needs to accept a reveal of an anchored poll (vote-core `verifyReveal`). */
export type RevealChain = { tipHeight: number; closeHeight: number | null };

/**
 * The relays that serve a valid copy of `reveal` back, asked the way a count
 * asks (kind 30082 under the poll's reveal d-tag). A copy counts when it carries
 * this reveal's id and verifies against `poll` the way a count checks it now
 * (signature, timing, and for an anchored poll the chain).
 */
export function relaysServingReveal(
    reveal: Reveal,
    poll: Poll,
    opts: ReadBackOptions & { chain?: RevealChain } = {}
): Promise<string[]> {
    const id = revealId(reveal);
    const verify = opts.verify ?? bip322Verify;
    return relaysServing(
        { kinds: [30082], '#d': [`oc-vote:reveal:${reveal.poll_id}`] },
        async (content) => {
            const copy = parsed<Reveal>(content, 'oc-vote/reveal');
            return (
                !!copy && safely(revealId, copy) === id && (await verifyReveal(copy, poll, verify, Date.now(), opts.chain)).ok
            );
        },
        opts
    );
}

/** BIP-322 in stamp-core's argument order. */
const stampSigVerifier = (verify: SignatureVerifier) => (message: string, signature: string, address: string) =>
    Promise.resolve(verify({ address, message, signature }));

/**
 * The relays that serve back this stamp (kind 30083 under its own d-tag). A
 * final count of an anchored poll reads ballots' stamps at the read floor, so a
 * stamp only one relay holds can be missed with that relay. A copy counts when
 * it is this envelope (its id covers the content hash) and its signature
 * verifies.
 */
export function relaysServingStamp(env: StampEnvelope, opts: ReadBackOptions = {}): Promise<string[]> {
    const verify = opts.verify ?? bip322Verify;
    return relaysServing(
        { kinds: [STAMP_KIND], '#d': [`oc-stamp:${env.id}`] },
        async (content) => {
            const copy = stampIn(content);
            if (!copy || copy.id !== env.id) return false;
            return (await stampVerify({ envelope: copy, verifyBip322: stampSigVerifier(verify) })).ok;
        },
        opts
    );
}

export interface CastOptions {
    relays?: readonly string[];
    publish?: (event: NostrEvent, relays: readonly string[]) => Promise<PublishResult[]>;
}

/**
 * One try at getting a signed event in: publish `event` to the relays that did
 * not serve it back last time (`serving`), then `readBack`, which asks every
 * relay alone again. `event` is signed once and sent as it is on every try, so
 * publishing it again needs no new signature.
 *
 * Returns the relays that serve a valid copy now. Tries that land on different
 * relays add up while the earlier relays still serve it; one that has dropped
 * it no longer counts, so this errs towards "not in yet", never "in".
 */
export async function castEvent(
    event: NostrEvent,
    serving: readonly string[],
    readBack: () => Promise<string[]>,
    opts: CastOptions = {}
): Promise<string[]> {
    const relays = opts.relays ?? DEFAULT_RELAYS;
    const missing = relays.filter((r) => !serving.includes(r));
    if (missing.length > 0) await (opts.publish ?? publishEvent)(event, missing);
    return readBack();
}

/** `castEvent` for a ballot, read back with `relaysServingBallot`. */
export function castBallot(
    event: NostrEvent,
    ballot: Ballot,
    serving: readonly string[],
    opts: CastOptions & ReadBackOptions = {}
): Promise<string[]> {
    return castEvent(event, serving, () => relaysServingBallot(ballot, opts), opts);
}
