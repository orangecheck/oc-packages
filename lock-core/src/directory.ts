// OC Chat directory claims (oc-chat-protocol SPEC §8.2, 0.4.0): claim and
// re-point ids, the shape a listing must have before any read, and the
// resolution walk. Pure over a reader: the caller checks event signatures,
// computes anchors (directoryAnchor) and answers binding and coin reads.

import { b64urlEncode, hexEncode, sha256Bytes, utf8Encode } from '@orangecheck/lock-crypto';

import { canonicalBytes } from './canonical.js';
import type { JsonValue } from './canonical.js';

/** The deployment values §8.2.2 (3) and §8.2.5 (5) name, at their RECOMMENDED v0 settings. */
export interface DirectoryParams {
    floorSats: number;
    floorConfs: number;
    repointBlocks: number;
    bounds: { bindingReads: number; coinReads: number; auditBindingReads: number; auditCoinReads: number };
}

export const DIRECTORY_PARAMS: DirectoryParams = {
    floorSats: 1,
    floorConfs: 144,
    repointBlocks: 1008,
    bounds: { bindingReads: 256, coinReads: 64, auditBindingReads: 64, auditCoinReads: 16 },
};

/** Confirmations an anchor needs before it counts (§8.2.1). */
export const ANCHOR_CONFS = 6;
/** Re-points one claim may carry (§8.2.9). */
export const MAX_REPOINTS = 16;

const HANDLE_RE = /^[a-z0-9_]{3,32}$/;
const SLUG_RE = /^[a-z0-9-]{3,48}$/;
const HEX64_RE = /^[0-9a-f]{64}$/;
const OUTPOINT_RE = /^[0-9a-f]{64}:(0|[1-9][0-9]{0,9})$/;

const sha256Hex = (value: JsonValue): string => hexEncode(sha256Bytes(canonicalBytes(value)));

/** claim_id = SHA-256(canonical({v:1, handle: lower(handle), address, outpoint, nonce})) (§8.2.1). */
export function claimId(c: { handle: string; address: string; outpoint: string; nonce: string }): string {
    return sha256Hex({
        v: 1,
        handle: c.handle.toLowerCase(),
        address: c.address,
        outpoint: c.outpoint,
        nonce: c.nonce,
    });
}

/** repoint_id = SHA-256(canonical({v:1, claim: claim_id, prev, outpoint, nonce})) (§8.2.9). */
export function repointId(r: { claim: string; prev: string; outpoint: string; nonce: string }): string {
    return sha256Hex({ v: 1, claim: r.claim, prev: r.prev, outpoint: r.outpoint, nonce: r.nonce });
}

/** listing_id = SHA-256(canonical(content)): what a §8.2.8 legacy claim takes as its nonce. */
export function listingId(content: JsonValue): string {
    return sha256Hex(content);
}

/** A person's listing d-tag (§8.2.1): "oc-lock-chat-dir:" || base64url(SHA-256("oc-lock-chat-dir/v1:" || lower(handle))). */
export function directoryDtag(handle: string): string {
    return 'oc-lock-chat-dir:' + b64urlEncode(sha256Bytes(utf8Encode('oc-lock-chat-dir/v1:' + handle.toLowerCase())));
}

/** A channel listing's d-tag (§8.3.6), the same over "oc-lock-chat-chdir/v1:". */
export function channelDirectoryDtag(handle: string): string {
    return 'oc-lock-chat-chdir:' + b64urlEncode(sha256Bytes(utf8Encode('oc-lock-chat-chdir/v1:' + handle.toLowerCase())));
}

/** A re-point as it rides in a listing. */
export interface DirectoryRepoint {
    prev: string;
    outpoint: string;
    nonce: string;
    ots: string;
}

/** The parts of a v2 listing or tombstone the walk reads, or why the record is dropped. */
export type ParsedDirectoryContent =
    | {
          kind: 'listing';
          address: string;
          inboxPubkey: string;
          createdAt: number;
          claim: { outpoint: string; nonce: string; ots: string; repoints: DirectoryRepoint[] };
          claimId: string;
      }
    | { kind: 'tombstone'; address: string; createdAt: number; ends: string };

const isObj = (v: unknown): v is Record<string, unknown> =>
    typeof v === 'object' && v !== null && !Array.isArray(v);

/** The fields every v2 record shares, under the names a person's listing uses (§8.2.1, §8.3.6). */
interface RecordFields {
    handle: unknown;
    address: unknown;
    inboxPubkey: unknown;
    createdAt: unknown;
    optedIn: unknown;
    ends: unknown;
    claim: unknown;
}

function parseRecord(f: RecordFields, handle: string): ParsedDirectoryContent | null {
    const h = handle.toLowerCase();
    if (!HANDLE_RE.test(h) || f.handle !== h) return null;
    const { address, createdAt } = f;
    if (typeof address !== 'string' || address.length === 0 || address.length > 128 || !canonicalAddress(address)) return null;
    if (typeof createdAt !== 'number' || !Number.isSafeInteger(createdAt) || createdAt < 0) return null;
    if (f.optedIn === false) {
        if (typeof f.ends !== 'string' || !HEX64_RE.test(f.ends)) return null;
        return { kind: 'tombstone', address, createdAt, ends: f.ends };
    }
    if (f.optedIn !== true) return null;
    const inboxPubkey = f.inboxPubkey;
    if (typeof inboxPubkey !== 'string' || !HEX64_RE.test(inboxPubkey)) return null;
    const claim = f.claim;
    if (!isObj(claim)) return null;
    const { outpoint, nonce, ots } = claim;
    if (typeof outpoint !== 'string' || !OUTPOINT_RE.test(outpoint)) return null;
    if (typeof nonce !== 'string' || !HEX64_RE.test(nonce)) return null;
    if (typeof ots !== 'string' || ots.length === 0) return null;
    const raw = claim.repoints ?? [];
    if (!Array.isArray(raw) || raw.length > MAX_REPOINTS) return null;
    const repoints: DirectoryRepoint[] = [];
    let prevCoin = outpoint;
    for (const r of raw) {
        if (!isObj(r)) return null;
        if (typeof r.prev !== 'string' || r.prev !== prevCoin) return null;
        if (typeof r.outpoint !== 'string' || !OUTPOINT_RE.test(r.outpoint)) return null;
        if (r.outpoint === outpoint || repoints.some((x) => x.outpoint === r.outpoint)) return null;
        if (typeof r.nonce !== 'string' || !HEX64_RE.test(r.nonce)) return null;
        if (typeof r.ots !== 'string' || r.ots.length === 0) return null;
        repoints.push({ prev: r.prev, outpoint: r.outpoint, nonce: r.nonce, ots: r.ots });
        prevCoin = r.outpoint;
    }
    return {
        kind: 'listing',
        address,
        inboxPubkey,
        createdAt,
        claim: { outpoint, nonce, ots, repoints },
        claimId: claimId({ handle: h, address, outpoint, nonce }),
    };
}

/**
 * §8.2.5 (1): a record's content, kept only if it is `v: 2` for `handle`, and,
 * for a live listing, carries a claim of the §8.2.1 / §8.2.9 shape whose re-points
 * form one chain from the claim's own coin (at most 16). Null drops it before any read.
 */
export function parseDirectoryContent(content: unknown, handle: string): ParsedDirectoryContent | null {
    if (!isObj(content) || content.v !== 2) return null;
    return parseRecord(
        {
            handle: content.handle,
            address: content.address,
            inboxPubkey: content.inbox_pubkey,
            createdAt: content.created_at,
            optedIn: content.opted_in,
            ends: content.ends,
            claim: content.claim,
        },
        handle
    );
}

/** §8.3.1: channel_id = SHA-256("oc-lock-chat-ch/v1:" || founder_address || ":" || lower(slug)). */
export function channelId(founderAddress: string, slug: string): string {
    return hexEncode(sha256Bytes(utf8Encode('oc-lock-chat-ch/v1:' + founderAddress + ':' + slug.toLowerCase())));
}

/**
 * A channel listing's content (§8.3.6), read as parseDirectoryContent reads a
 * person's: `founder_address` and `founder_inbox_pubkey` stand for `address` and
 * `inbox_pubkey`. A live listing's `channel_id` must derive from its founder and
 * `slug`; a did:oc founder lists nothing. A tombstone is kept whatever its slug says.
 */
export function parseChannelDirectoryContent(content: unknown, handle: string): ParsedDirectoryContent | null {
    if (!isObj(content) || content.v !== 2) return null;
    const founder = content.founder_address;
    if (typeof founder !== 'string' || founder.startsWith('did:oc:')) return null;
    if (content.opted_in === true) {
        const { slug, channel_id: cid } = content;
        if (typeof slug !== 'string' || !SLUG_RE.test(slug) || typeof cid !== 'string') return null;
        if (cid !== channelId(founder, slug)) return null;
    }
    return parseRecord(
        {
            handle: content.handle,
            address: founder,
            inboxPubkey: content.founder_inbox_pubkey,
            createdAt: content.created_at,
            optedIn: content.opted_in,
            ends: content.ends,
            claim: content.claim,
        },
        handle
    );
}

/**
 * An anchor as directoryAnchor answers it: a height, null for none, or the lowest
 * attestation height whose header could not be read. That last one is a read without
 * an answer (§8.2.5 (4)): the walk cannot place or pass over its claim.
 */
export type AnchorAnswer = number | null | { unread: number };

const anchorHeight = (a: AnchorAnswer): number | null => (a === null ? null : typeof a === 'number' ? a : a.unread);

/** An address in its canonical form (§8.2.5 (1)): a bech32 address only in lowercase. */
export function canonicalAddress(a: string): boolean {
    return !/^(bc1|tb1|bcrt1)/i.test(a) || a === a.toLowerCase();
}

/** Whether two addresses are the same: bech32 compares without case, base58 exactly. */
export function sameAddress(a: string, b: string): boolean {
    const bech32 = (x: string) => /^(bc1|tb1|bcrt1)/i.test(x);
    return bech32(a) && bech32(b) ? a.toLowerCase() === b.toLowerCase() : a === b;
}

/** A record as the walk takes it: its signer, its parsed parts, and the anchors already computed. */
export type DirectoryRecord =
    | {
          kind: 'listing';
          address: string;
          /** The key that signed the event (its pubkey). */
          key: string;
          createdAt: number;
          claimId: string;
          /** The claim's own coin. */
          outpoint: string;
          /** The claim's anchor (directoryAnchor). */
          anchor: AnchorAnswer;
          /** In list order, each with its own anchor. */
          repoints: Array<{ repointId: string; prev: string; outpoint: string; anchor: AnchorAnswer }>;
          source: 'directory' | 'public';
      }
    | {
          kind: 'tombstone';
          address: string;
          key: string;
          createdAt: number;
          ends: string;
          source: 'directory' | 'public';
      };

/** What a coin read answers (§8.2.2 (3)): a confirmed spend's height, or null while unspent or unconfirmed. */
export interface CoinFacts {
    /** Height the output confirmed at, or null while unconfirmed. */
    confirmedAt: number | null;
    value: number;
    /** The address the output pays to. */
    paysTo: string;
    spendHeight: number | null;
}

/** The reads the walk makes. 'no-answer' is a read that did not answer: never a failure (§8.2.5 (4)). */
export interface DirectoryReader {
    /** The keys a kind-30078 device record binds to `address` (§8.2.2 (2)). */
    boundKeys(address: string): Promise<string[] | 'no-answer'>;
    coin(outpoint: string): Promise<CoinFacts | 'no-answer'>;
}

export type DirectoryResolution =
    | { result: 'holds'; holder: string; claimId: string; /** The claim's current coin (§8.2.9). */ coin: string; reads: string[] }
    | { result: 'E_DIR_UNRESOLVED' | 'E_DIR_REVOKED' | 'E_DIR_UNVERIFIED'; holder: null; reads: string[] };

const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
const isHeight = (v: unknown): v is number | null => v === null || isCount(v);

function isCoinFacts(c: unknown): c is CoinFacts {
    if (!isObj(c)) return false;
    return isHeight(c.confirmedAt) && isCount(c.value) && typeof c.paysTo === 'string' && isHeight(c.spendHeight);
}

/** Refuse params that are not exactly DirectoryParams' shape, with whole non-negative numbers. */
function checkParams(p: DirectoryParams): void {
    const exact = (o: unknown, keys: string[], what: string): Record<string, unknown> => {
        if (!isObj(o)) throw new TypeError(`${what} must be an object`);
        for (const k of Object.keys(o)) if (!keys.includes(k)) throw new TypeError(`${what} has no option "${k}"`);
        for (const k of keys) if (!(k in o)) throw new TypeError(`${what} needs "${k}"`);
        return o;
    };
    const top = exact(p, ['floorSats', 'floorConfs', 'repointBlocks', 'bounds'], 'directory params');
    const b = exact(top.bounds, ['bindingReads', 'coinReads', 'auditBindingReads', 'auditCoinReads'], 'directory params bounds');
    for (const v of [top.floorSats, top.floorConfs, top.repointBlocks, ...Object.values(b)]) {
        if (!isCount(v)) throw new TypeError('directory params must be whole non-negative numbers');
    }
}

/**
 * The walk of §8.2.5–§8.2.6 and §8.2.9. Live listings are walked in (anchor,
 * claim_id) order; an address's bound keys are read once, the first time the walk
 * meets it; its state is its freshest record signed by a bound key; a claim the
 * state carries and no bound tombstone ends has its coins read, and the first that
 * stands holds the handle. A read without an answer before the holder ends the walk
 * E_DIR_UNRESOLVED, as does a bound; for a record found only on public relays it
 * ends the audit instead. `reads` lists every read in order.
 */
export async function resolveDirectory(
    all: readonly DirectoryRecord[],
    tip: number,
    reader: DirectoryReader,
    params: DirectoryParams = DIRECTORY_PARAMS
): Promise<DirectoryResolution> {
    checkParams(params);
    // §8.2.5 (1): a canonical address, and re-points at most 16, one chain from the claim's own coin, no coin twice.
    const records = all.filter(
        (r) =>
            canonicalAddress(r.address) &&
            (r.kind !== 'listing' ||
                (r.repoints.length <= MAX_REPOINTS &&
                    new Set([r.outpoint, ...r.repoints.map((p) => p.outpoint)]).size === r.repoints.length + 1 &&
                    r.repoints.every((p, i) => p.prev === (i === 0 ? r.outpoint : r.repoints[i - 1]!.outpoint))))
    );
    // A reader that throws, or answers out of shape, has not answered (§8.2.5 (4)).
    const boundKeysOf = async (address: string): Promise<string[] | 'no-answer'> => {
        try {
            const keys = await reader.boundKeys(address);
            return Array.isArray(keys) && keys.every((k) => typeof k === 'string') ? keys : 'no-answer';
        } catch {
            return 'no-answer';
        }
    };
    const coinOf = async (outpoint: string): Promise<CoinFacts | 'no-answer'> => {
        try {
            const c = await reader.coin(outpoint);
            return isCoinFacts(c) ? c : 'no-answer';
        } catch {
            return 'no-answer';
        }
    };
    const reads: string[] = [];
    const anchored = (a: AnchorAnswer): boolean => {
        const h = anchorHeight(a);
        return h !== null && tip - h + 1 >= ANCHOR_CONFS;
    };
    const onDirectory = new Set(
        records.filter((r) => r.source === 'directory' && r.kind === 'listing').map((r) => (r as { claimId: string }).claimId)
    );
    const live = records
        .filter((r): r is Extract<DirectoryRecord, { kind: 'listing' }> => r.kind === 'listing' && anchored(r.anchor))
        .sort(
            (a, b) =>
                (anchorHeight(a.anchor) as number) - (anchorHeight(b.anchor) as number) ||
                (a.claimId < b.claimId ? -1 : a.claimId > b.claimId ? 1 : 0)
        );
    const bound = new Map<string, string[]>();
    const walked = new Set<string>();
    const n = { binding: 0, coin: 0, auBinding: 0, auCoin: 0 };
    let auditOn = true;
    const { bounds } = params;

    // An audit claim's reads count against the audit's bounds alone (§8.2.5 (5), §8.2.6).
    const takeCoinRead = (audit: boolean): boolean => {
        if (audit ? n.auCoin >= bounds.auditCoinReads : n.coin >= bounds.coinReads) return false;
        if (audit) n.auCoin++;
        else n.coin++;
        return true;
    };
    const clears = (c: CoinFacts, anchor: number, address: string): boolean =>
        c.confirmedAt !== null &&
        c.confirmedAt <= anchor - params.floorConfs &&
        c.value >= params.floorSats &&
        sameAddress(c.paysTo, address);
    const stateOf = (address: string, keys: readonly string[]): DirectoryRecord | null =>
        records
            .filter((x) => x.address === address && keys.includes(x.key))
            .reduce<DirectoryRecord | null>((best, x) => (!best || x.createdAt > best.createdAt ? x : best), null);

    // §8.2.2 (3) and §8.2.9: the current coin it stands on, 'fail', or 'stop' (a read without an answer, or a bound).
    const stands = async (
        rec: Extract<DirectoryRecord, { kind: 'listing' }>,
        state: Extract<DirectoryRecord, { kind: 'listing' }>,
        audit: boolean
    ): Promise<{ pass: string } | 'fail' | 'stop'> => {
        // An anchor whose header could not be read: this claim can be neither placed nor passed over.
        if (typeof rec.anchor !== 'number') return 'stop';
        const anchor = rec.anchor;
        if (!takeCoinRead(audit)) return 'stop';
        reads.push('coin ' + rec.claimId.slice(0, 12));
        const own = await coinOf(rec.outpoint);
        if (own === 'no-answer') return 'stop';
        if (!clears(own, anchor, rec.address)) return 'fail';
        // One chain in list order; the first link that is not valid ends it where it stands.
        let current = own;
        let coin = rec.outpoint;
        for (const r of state.repoints) {
            if (r.prev !== coin || !anchored(r.anchor)) break;
            if (typeof r.anchor !== 'number') return 'stop';
            if (current.spendHeight !== null && r.anchor > current.spendHeight + params.repointBlocks) break;
            if (!takeCoinRead(audit)) return 'stop';
            reads.push('repoint ' + r.repointId.slice(0, 12));
            const next = await coinOf(r.outpoint);
            if (next === 'no-answer') return 'stop';
            if (!clears(next, r.anchor, rec.address)) break;
            current = next;
            coin = r.outpoint;
        }
        return current.spendHeight !== null && tip - current.spendHeight + 1 >= params.repointBlocks + ANCHOR_CONFS
            ? 'fail'
            : { pass: coin };
    };

    const unresolved = (): DirectoryResolution => ({ result: 'E_DIR_UNRESOLVED', holder: null, reads });
    for (const rec of live) {
        const audit = !onDirectory.has(rec.claimId);
        if (audit && !auditOn) continue;
        if (!bound.has(rec.address)) {
            if (audit ? n.auBinding >= bounds.auditBindingReads : n.binding >= bounds.bindingReads) {
                if (audit) {
                    auditOn = false;
                    continue;
                }
                return unresolved();
            }
            if (audit) n.auBinding++;
            else n.binding++;
            reads.push('binding ' + rec.address);
            const keys = await boundKeysOf(rec.address);
            if (keys === 'no-answer') {
                if (audit) {
                    auditOn = false;
                    continue;
                }
                return unresolved();
            }
            bound.set(rec.address, keys);
        }
        const keys = bound.get(rec.address) as string[];
        const state = stateOf(rec.address, keys);
        const ended = records.some(
            (x) => x.kind === 'tombstone' && x.address === rec.address && keys.includes(x.key) && x.ends === rec.claimId
        );
        if (!state || state.kind !== 'listing' || state.claimId !== rec.claimId || ended) continue;
        // A claim carried by two listings is walked once, at its first.
        if (walked.has(rec.claimId)) continue;
        walked.add(rec.claimId);
        const verdict = await stands(rec, state, audit);
        if (verdict === 'stop') {
            if (audit) {
                auditOn = false;
                continue;
            }
            return unresolved();
        }
        if (verdict !== 'fail') return { result: 'holds', holder: rec.address, claimId: rec.claimId, coin: verdict.pass, reads };
    }
    const revoked = [...bound.entries()].some(([address, keys]) => stateOf(address, keys)?.kind === 'tombstone');
    return { result: revoked ? 'E_DIR_REVOKED' : 'E_DIR_UNVERIFIED', holder: null, reads };
}
