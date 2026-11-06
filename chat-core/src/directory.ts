// Who holds a handle under OC Chat 0.4 (SPEC §8.2.5–§8.2.6): the directory relays read
// completely, public relays read as a bounded audit, and the walk itself from
// @orangecheck/lock-core/directory, so every client and the directory relay decide alike.
// Relays, the chain and the bindings are read through WalkDeps.

import {
    ANCHOR_CONFS,
    channelDirectoryDtag,
    directoryAnchor,
    directoryDtag,
    DIRECTORY_PARAMS,
    listingId,
    parseChannelDirectoryContent,
    parseDirectoryContent,
    repointId,
    resolveDirectory,
    sameAddress,
    type AnchorAnswer,
    type CoinFacts,
    type DirectoryRecord,
    type ParsedDirectoryContent,
} from '@orangecheck/lock-core/directory';
import { hexDecode } from '@orangecheck/lock-crypto';
import type { NostrEvent } from '@orangecheck/lock-device';
import { readPages, type Filter, type PageQuery } from '@orangecheck/nostr-core';
import {
    base64Decode,
    bitcoinAnchors,
    parseProof,
    type BlockHeaderSource,
} from '@orangecheck/stamp-ots';

import referenceLegacy from './directory-legacy.json';

export type DirectoryNamespace = 'people' | 'channel';

/** The reference deployment's directory relay (§8.2.6), a named availability anchor. */
export const DIRECTORY_RELAYS: readonly string[] = ['wss://relay.ochk.io'];
/** Public relays the reference deployment reads as the audit (§8.2.6). */
export const AUDIT_RELAYS: readonly string[] = [
    'wss://relay.damus.io',
    'wss://nos.lol',
    'wss://relay.primal.net',
];

const PAGE = 200;
/** A directory relay answering more pages than this has not been read completely. */
const MAX_DIRECTORY_PAGES = 25;
const AUDIT_PAGES = 2;
/** Distinct header reads one resolution may make; past this a header is unread. */
const HEADER_BUDGET = 128;

/**
 * One page from one relay: its events, whether the relay finished answering
 * (EOSE), and `sent`, how many events the relay sent, the ones the reader dropped
 * (a bad signature) included. A page is full by what the relay sent, not by what
 * was kept: a relay that pads a page with junk has more behind it. Without
 * `sent`, the events kept are the count. Send the filter as given, `since`
 * included.
 */
export type PageRead = (
    relay: string,
    filter: { kinds: number[]; '#d': string[]; limit: number; until?: number; since?: number }
) => Promise<{ events: NostrEvent[]; complete: boolean; sent?: number }>;

/**
 * One relay's REQs as the pager asks them, with what it sent and the reader
 * dropped. Every REQ stays under the d tag, so a relay whose read stepped past
 * its oldest second is cut off: what it sends a page is not asked of other tags.
 * A REQ that throws is one the relay did not answer.
 */
const onRelay =
    (page: PageRead, relay: string, d: string): PageQuery =>
    async (filter) => {
        let got: Awaited<ReturnType<PageRead>>;
        try {
            got = await page(relay, { ...filter, '#d': [d] } as Parameters<PageRead>[1]);
        } catch {
            return { events: [], relayStatus: [{ relay, eose: false, events: 0, rejected: 0 }] };
        }
        const events = got.events as Awaited<ReturnType<PageQuery>>['events'];
        const rejected = Math.max(0, (got.sent ?? 0) - got.events.length);
        return { events, relayStatus: [{ relay, eose: got.complete, events: events.length, rejected }] };
    };

export interface WalkDeps {
    page: PageRead;
    tip(): Promise<number>;
    headers: BlockHeaderSource;
    coin(outpoint: string): Promise<CoinFacts | 'no-answer'>;
    /** The keys a kind-30078 device record binds to `address`, or 'no-answer'. */
    boundKeys(address: string): Promise<string[] | 'no-answer'>;
    /** NIP-01 id and signature. */
    verifyEvent(ev: NostrEvent): boolean;
    /** The deployment's directory relays; the reference deployment's by default. */
    directoryRelays?: readonly string[];
    /** The public relays read as the audit; the reference deployment's by default. */
    auditRelays?: readonly string[];
    /** §8.2.8 claims a deployment anchored for v1 listings; the reference deployment's by default. */
    legacy?: readonly LegacyClaim[];
    /** The page size a relay's NIP-11 document declares (nostr-core relayMaxLimit). A directory
     *  relay declaring one under 100 that sent anything is not read completely. Not asked when absent. */
    maxLimit?: (relay: string) => Promise<number | undefined>;
}

/** A claim as a listing carries it (§8.2.1, §8.2.9). */
export interface CarriedClaim {
    outpoint: string;
    nonce: string;
    ots: string;
    repoints: { prev: string; outpoint: string; nonce: string; ots: string }[];
}

/** A record the walk took, with the event it came from. */
export interface WalkRecord {
    record: DirectoryRecord;
    event: NostrEvent;
    content: Record<string, unknown>;
    /** A listing's claim; for the §8.2.8 legacy listing, the shipped one. */
    claim: CarriedClaim | null;
}

export type HandleAnswer =
    | {
          result: 'holds';
          holder: string;
          claimId: string;
          coin: string;
          /** The holder's state: its freshest listing signed by a bound key. */
          listing: { event: NostrEvent; content: Record<string, unknown> };
          /** The claim that state carries, re-points included. */
          claim: CarriedClaim;
          anchor: number;
          tip: number;
      }
    | { result: 'E_DIR_UNRESOLVED' | 'E_DIR_REVOKED' | 'E_DIR_UNVERIFIED' | 'not_found' };

/** A claim a deployment anchored for one v1 listing (§8.2.8). */
export interface LegacyClaim {
    listing_event_id: string;
    handle: string;
    address: string;
    outpoint: string;
    nonce: string;
    claim_id: string;
    ots: string;
    /** orangecheck's own listing, which the reference client lets carry a name it reserves. */
    orangecheck?: true;
}
/** The reference deployment's §8.2.8 claims. */
export const REFERENCE_LEGACY_CLAIMS: readonly LegacyClaim[] = referenceLegacy as LegacyClaim[];

const legacyIndex = (entries: readonly LegacyClaim[]) =>
    new Map(entries.map((e) => [e.listing_event_id, e]));

/** The kind-30114 events under one d tag, `PAGE` asked a page. */
const underTag = (d: string): Filter => ({ kinds: [30114], '#d': [d] });

/**
 * Every event a relay holds under one d tag, paged to its end (nostr-core
 * readPages), or how its read ended short: cut off, when it answered and could
 * not be read to its end, or no answer, when it sent nothing.
 */
async function readAll(
    page: PageRead,
    relay: string,
    d: string,
    maxPages: number,
    maxLimit?: (relay: string) => Promise<number | undefined>
): Promise<NostrEvent[] | 'cut_off' | 'no_answer'> {
    const read = await readPages(onRelay(page, relay, d), underTag(d), {
        limit: PAGE,
        maxPages,
        maxEvents: PAGE * maxPages,
        ...(maxLimit ? { maxLimit } : {}),
    });
    const state = read.relayStatus?.[0]?.state ?? 'no_answer';
    return state === 'complete' ? (read.events as NostrEvent[]) : state;
}

/** Up to `pages` REQs of what an audit relay holds; whatever it answered, or nothing. */
async function readSome(
    page: PageRead,
    relay: string,
    d: string,
    pages: number
): Promise<NostrEvent[]> {
    const read = await readPages(onRelay(page, relay, d), underTag(d), {
        limit: PAGE,
        maxPages: pages,
        maxEvents: PAGE * pages,
    });
    return read.events as NostrEvent[];
}

/** A header source that reads each height once and stops reading past the budget (a read without an answer). */
function budgetedHeaders(source: BlockHeaderSource): BlockHeaderSource {
    const memo = new Map<number, Promise<Uint8Array | null>>();
    return {
        getHeaderAt(height) {
            const hit = memo.get(height);
            if (hit) return hit;
            if (memo.size >= HEADER_BUDGET) return Promise.reject(new Error('header budget spent'));
            const p = source.getHeaderAt(height);
            memo.set(height, p);
            return p;
        },
    };
}

/** Events by the lowest Bitcoin attestation their claim's proof names, read without a header; then by id. */
function byClaimedAnchor(
    handle: string,
    ns: DirectoryNamespace,
    legacy: ReadonlyMap<string, LegacyClaim>
) {
    const keyOf = new Map<string, number>();
    const claimed = (ev: NostrEvent) => {
        let k = keyOf.get(ev.id);
        if (k === undefined) {
            k = Infinity;
            try {
                const p = parseEvent(ev, handle, ns, legacy);
                if (p?.parsed.kind === 'listing' && p.ots) {
                    const heights = bitcoinAnchors(
                        parseProof(base64Decode(p.ots), hexDecode(p.parsed.claimId))
                    ).map((a) => a.blockHeight);
                    if (heights.length) k = Math.min(...heights);
                }
            } catch {
                /* an unreadable proof goes last */
            }
            keyOf.set(ev.id, k);
        }
        return k;
    };
    return (a: NostrEvent, b: NostrEvent) =>
        claimed(a) - claimed(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** The parsed record of one event, the §8.2.8 legacy entry included; null drops it in step 1. */
function parseEvent(
    ev: NostrEvent,
    handle: string,
    ns: DirectoryNamespace,
    legacy: ReadonlyMap<string, LegacyClaim>
): { parsed: ParsedDirectoryContent; content: Record<string, unknown>; ots: string | null } | null {
    let content: unknown;
    try {
        content = JSON.parse(ev.content);
    } catch {
        return null;
    }
    if (!content || typeof content !== 'object' || Array.isArray(content)) return null;
    const c = content as Record<string, unknown>;
    const legacyEntry = ns === 'people' ? legacy.get(ev.id) : undefined;
    if (legacyEntry && c.v === 1) {
        // Exactly this v1 listing carries the shipped claim, and only while its bytes are the ones anchored.
        if (listingId(c as never) !== legacyEntry.nonce || c.opted_in !== true) return null;
        if (c.handle !== handle.toLowerCase() || c.address !== legacyEntry.address) return null;
        if (typeof c.inbox_pubkey !== 'string') return null;
        return {
            parsed: {
                kind: 'listing',
                address: legacyEntry.address,
                inboxPubkey: c.inbox_pubkey,
                createdAt: typeof c.created_at === 'number' ? c.created_at : 0,
                claim: {
                    outpoint: legacyEntry.outpoint,
                    nonce: legacyEntry.nonce,
                    ots: legacyEntry.ots,
                    repoints: [],
                },
                claimId: legacyEntry.claim_id,
            },
            content: c,
            ots: legacyEntry.ots,
        };
    }
    const parsed =
        ns === 'people'
            ? parseDirectoryContent(c, handle)
            : parseChannelDirectoryContent(c, handle);
    if (!parsed) return null;
    return { parsed, content: c, ots: parsed.kind === 'listing' ? parsed.claim.ots : null };
}

/** The records one d tag holds, anchors computed, each tagged with where it was found. */
async function collect(
    handle: string,
    ns: DirectoryNamespace,
    deps: WalkDeps
): Promise<{
    records: WalkRecord[];
    directoryAnswered: boolean;
    tip: number;
    seen: number;
} | null> {
    const d = ns === 'people' ? directoryDtag(handle) : channelDirectoryDtag(handle);
    const [directoryReads, auditReads, tip] = await Promise.all([
        Promise.all(
            (deps.directoryRelays ?? DIRECTORY_RELAYS).map((r) =>
                readAll(deps.page, r, d, MAX_DIRECTORY_PAGES, deps.maxLimit)
            )
        ),
        Promise.all(
            (deps.auditRelays ?? AUDIT_RELAYS).map((r) => readSome(deps.page, r, d, AUDIT_PAGES))
        ),
        deps.tip().catch(() => null),
    ]);
    if (tip === null) return null;
    // A directory relay that answered and was cut off may hold an earlier claim past
    // the cut: neither what it sent nor the audit settles the handle without it.
    if (directoryReads.includes('cut_off')) return null;
    const directory = directoryReads.filter((r): r is NostrEvent[] => Array.isArray(r)).flat();
    const directoryAnswered = directoryReads.some((r) => Array.isArray(r));
    const onDirectory = new Set(directory.map((e) => e.id));
    const all = new Map<string, NostrEvent>();
    for (const ev of [...directory, ...auditReads.flat()]) all.set(ev.id, ev);

    const headers = budgetedHeaders(deps.headers);
    const out: WalkRecord[] = [];
    // The header budget goes to the directory relay's records first, so public records
    // never turn its answer into E_DIR_UNRESOLVED (§8.2.6); then lowest claimed anchor
    // first, so no relay's answer order decides which claims are read.
    const legacy = legacyIndex(deps.legacy ?? REFERENCE_LEGACY_CLAIMS);
    const byAnchor = byClaimedAnchor(handle, ns, legacy);
    const order = (a: NostrEvent, b: NostrEvent) =>
        Number(!onDirectory.has(a.id)) - Number(!onDirectory.has(b.id)) || byAnchor(a, b);
    for (const ev of [...all.values()].sort(order)) {
        if (ev.kind !== 30114 || !deps.verifyEvent(ev)) continue;
        const p = parseEvent(ev, handle, ns, legacy);
        if (!p) continue;
        const { parsed, content } = p;
        // With no directory relay answering, the public read is the walk itself (§8.2.6).
        const source = !directoryAnswered || onDirectory.has(ev.id) ? 'directory' : 'public';
        if (parsed.kind === 'tombstone') {
            out.push({
                record: {
                    kind: 'tombstone',
                    address: parsed.address,
                    key: ev.pubkey,
                    createdAt: parsed.createdAt,
                    ends: parsed.ends,
                    source,
                },
                event: ev,
                content,
                claim: null,
            });
            continue;
        }
        // A listing is signed by its inbox key (§8.2.2 (1)).
        if (ev.pubkey !== parsed.inboxPubkey) continue;
        const anchor: AnchorAnswer = await directoryAnchor(
            parsed.claim.ots,
            parsed.claimId,
            headers
        );
        const repoints = [];
        for (const r of parsed.claim.repoints) {
            const id = repointId({
                claim: parsed.claimId,
                prev: r.prev,
                outpoint: r.outpoint,
                nonce: r.nonce,
            });
            repoints.push({
                repointId: id,
                prev: r.prev,
                outpoint: r.outpoint,
                anchor: await directoryAnchor(r.ots, id, headers),
            });
        }
        out.push({
            record: {
                kind: 'listing',
                address: parsed.address,
                key: ev.pubkey,
                createdAt: parsed.createdAt,
                claimId: parsed.claimId,
                outpoint: parsed.claim.outpoint,
                anchor,
                repoints,
                source,
            },
            event: ev,
            content,
            claim: parsed.claim,
        });
    }
    return { records: out, directoryAnswered, tip, seen: all.size };
}

/** A listing whose anchor has 6 confirmations at `tip`: only these, and tombstones, are states (§8.2.5 (3)). */
function keptAt(tip: number) {
    return (r: WalkRecord) => {
        if (r.record.kind === 'tombstone') return true;
        const a = r.record.anchor;
        const h = a === null ? null : typeof a === 'number' ? a : a.unread;
        return h !== null && tip - h + 1 >= ANCHOR_CONFS;
    };
}

/** The freshest of `records` by `created_at`. */
function freshest(records: readonly WalkRecord[]): WalkRecord | null {
    return records.reduce<WalkRecord | null>(
        (best, r) => (!best || r.record.createdAt > best.record.createdAt ? r : best),
        null
    );
}

export type AddressState =
    | {
          kind: 'listing';
          event: NostrEvent;
          content: Record<string, unknown>;
          claimId: string;
          claim: CarriedClaim;
      }
    | { kind: 'tombstone'; event: NostrEvent; ends: string }
    | { kind: 'none' }
    | { kind: 'unresolved' };

type Collected = NonNullable<Awaited<ReturnType<typeof collect>>>;

/** One address's state among collected records: its freshest kept record signed by a bound key. */
async function stateOf(got: Collected, address: string, deps: WalkDeps): Promise<AddressState> {
    const mine = got.records.filter((r) => sameAddress(r.record.address, address));
    if (mine.length === 0) return got.directoryAnswered ? { kind: 'none' } : { kind: 'unresolved' };
    const keys = await deps.boundKeys(address);
    if (keys === 'no-answer') return { kind: 'unresolved' };
    const state = freshest(mine.filter((r) => keys.includes(r.record.key)).filter(keptAt(got.tip)));
    if (!state) return got.directoryAnswered ? { kind: 'none' } : { kind: 'unresolved' };
    if (state.record.kind === 'tombstone')
        return { kind: 'tombstone', event: state.event, ends: state.record.ends };
    if (!state.claim) return { kind: 'unresolved' };
    return {
        kind: 'listing',
        event: state.event,
        content: state.content,
        claimId: state.record.claimId,
        claim: state.claim,
    };
}

/**
 * One address's own state under `handle` (§8.2.5 (3)): its freshest record signed by a
 * key bound to it, among the records step 1 keeps. A client reads this before it
 * publishes for the address, so it carries the claim's re-points (§8.2.7).
 */
export async function readAddressState(
    handle: string,
    ns: DirectoryNamespace,
    address: string,
    deps: WalkDeps
): Promise<AddressState> {
    try {
        const got = await collect(handle, ns, deps);
        return got ? await stateOf(got, address, deps) : { kind: 'unresolved' };
    } catch {
        return { kind: 'unresolved' };
    }
}

/** Who holds `handle`, and `address`'s own state under it, from one read of the relays. */
export async function resolveWithState(
    handle: string,
    ns: DirectoryNamespace,
    address: string,
    deps: WalkDeps
): Promise<{ answer: HandleAnswer; state: AddressState }> {
    const unresolved = {
        answer: { result: 'E_DIR_UNRESOLVED' as const },
        state: { kind: 'unresolved' as const },
    };
    try {
        const got = await collect(handle, ns, deps);
        if (!got) return unresolved;
        const memo = new Map<string, Promise<string[] | 'no-answer'>>();
        const once: WalkDeps = {
            ...deps,
            boundKeys: (a) => {
                if (!memo.has(a)) memo.set(a, deps.boundKeys(a));
                return memo.get(a)!;
            },
        };
        return { answer: await walkCollected(got, once), state: await stateOf(got, address, once) };
    } catch {
        return unresolved;
    }
}

/** Who holds `handle` in namespace `ns`, by the 0.4 walk. Never throws. */
export async function resolveDirectoryHandle(
    handle: string,
    ns: DirectoryNamespace,
    deps: WalkDeps
): Promise<HandleAnswer> {
    try {
        const got = await collect(handle, ns, deps);
        return got ? await walkCollected(got, deps) : { result: 'E_DIR_UNRESOLVED' };
    } catch {
        return { result: 'E_DIR_UNRESOLVED' };
    }
}

async function walkCollected(got: Collected, deps: WalkDeps): Promise<HandleAnswer> {
    const { records, directoryAnswered, tip, seen } = got;
    // Nothing at all under the d tag is "not listed", but only when the directory relay answered in full.
    if (seen === 0)
        return directoryAnswered ? { result: 'not_found' } : { result: 'E_DIR_UNRESOLVED' };

    const bound = new Map<string, string[]>();
    const params = directoryAnswered
        ? DIRECTORY_PARAMS
        : {
              ...DIRECTORY_PARAMS,
              // §8.2.6: with no directory relay answering, the audit's bounds bound the walk.
              bounds: {
                  bindingReads: DIRECTORY_PARAMS.bounds.auditBindingReads,
                  coinReads: DIRECTORY_PARAMS.bounds.auditCoinReads,
                  auditBindingReads: DIRECTORY_PARAMS.bounds.auditBindingReads,
                  auditCoinReads: DIRECTORY_PARAMS.bounds.auditCoinReads,
              },
          };
    const out = await resolveDirectory(
        records.map((r) => r.record),
        tip,
        {
            boundKeys: async (address) => {
                const keys = await deps.boundKeys(address);
                if (keys !== 'no-answer') bound.set(address, keys);
                return keys;
            },
            coin: (outpoint) => deps.coin(outpoint),
        },
        params
    );
    if (out.result !== 'holds') return { result: out.result };
    // The holder's state: its freshest listing signed by a bound key that the walk kept (§8.2.5 (3)).
    const keys = bound.get(out.holder) ?? [];
    const carrying = records.filter(
        (r) =>
            r.record.kind === 'listing' &&
            r.record.address === out.holder &&
            r.record.claimId === out.claimId &&
            keptAt(tip)(r)
    );
    const state = freshest(carrying.filter((r) => keys.includes(r.record.key)));
    // The claim's place is its lowest anchor among the copies, as the walk ordered it.
    const anchors = carrying
        .map((r) => (r.record.kind === 'listing' ? r.record.anchor : null))
        .filter((a): a is number => typeof a === 'number');
    if (!state || !state.claim || anchors.length === 0) return { result: 'E_DIR_UNRESOLVED' };
    const anchor = Math.min(...anchors);
    return {
        result: 'holds',
        holder: out.holder,
        claimId: out.claimId,
        coin: out.coin,
        listing: { event: state.event, content: state.content },
        claim: state.claim,
        anchor,
        tip,
    };
}

const HANDLE_RE = /^[a-z0-9_]{3,32}$/;

/** A handle's shape (§8.2.1): 3 to 32 of a-z, 0-9 and _. */
export function isValidHandle(h: string): boolean {
    return HANDLE_RE.test(h);
}

const AVATAR_MAX_CHARS = 24 * 1024;
const AVATAR_DATA_URL_RE = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=]+$/;

/** A listing's avatar is safe to render iff it is a bounded raster data URL (§8.2.1):
 *  never an svg, html or script data URL, and never huge. */
export function safeAvatar(s: unknown): s is string {
    return typeof s === 'string' && s.length <= AVATAR_MAX_CHARS && AVATAR_DATA_URL_RE.test(s);
}
