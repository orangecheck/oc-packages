// Anchored polls (OC Vote SPEC §4.6): a ballot is in time when a Bitcoin block
// anchors it. This reads every OC Stamp copy over each ballot from the relays,
// rebuilds each stamp's id, and walks its proof to block headers this CLI
// fetches itself. It also stamps a ballot this CLI publishes.

import { randomBytes } from '@noble/hashes/utils';
import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { canonicalizeEnvelope, computeEnvelopeId, parseStamp, stamp } from '@orangecheck/stamp-core';
import type { StampEnvelope } from '@orangecheck/stamp-core';
import { mempoolHeaderSource, submitToCalendars, toStampOts, verifiedAnchor } from '@orangecheck/stamp-ots';
import type { BlockHeaderSource } from '@orangecheck/stamp-ots';
import {
    anchorHeightFromStamps,
    ballotStampContent,
    isAnchoredPoll,
    mempoolBlockTimeSource,
    resolveCloseBlock,
} from '@orangecheck/vote-core';
import type { Ballot, BlockTimeSource, Poll } from '@orangecheck/vote-core';

import { query, type EventsFetch } from './nostr.js';

export const STAMP_KIND = 30083;
const IDS_PER_QUERY = 50;

export interface AnchoredChain {
    tipHeight: number;
    /** `H_close`, null while no block's median_time_past has passed the deadline. */
    closeHeight: number | null;
    anchorHeight: (ballotId: string) => number | null;
}

/** Header lookups shared across one run; a failed lookup is retried, never remembered as "no header". */
export function cachedHeaders(inner: BlockHeaderSource): BlockHeaderSource {
    const seen = new Map<number, Promise<Uint8Array | null>>();
    return {
        getHeaderAt(height) {
            let p = seen.get(height);
            if (!p) {
                p = inner.getHeaderAt(height);
                p.catch(() => seen.delete(height));
                seen.set(height, p);
            }
            return p;
        },
    };
}

/**
 * The block a stamp anchors its own id in, or null. The id is rebuilt from the
 * envelope's fields and must equal the one it declares; the proof is walked
 * from that id to headers from `headers`. What the stamp declares about its
 * anchor is not read. Throws when a header cannot be read.
 */
export function stampAnchorVerifier(headers: BlockHeaderSource) {
    return async (raw: unknown): Promise<number | null> => {
        let env: StampEnvelope;
        let id: string;
        try {
            env = parseStamp(raw);
            id = computeEnvelopeId({
                address: env.signer.address,
                content_hash: env.content.hash,
                content_length: env.content.length,
                content_mime: env.content.mime,
                signed_at: env.signed_at,
            });
        } catch {
            return null;
        }
        if (id !== env.id || !env.ots?.proof) return null;
        return (await verifiedAnchor(env.ots.proof, id, headers))?.blockHeight ?? null;
    };
}

/** Every stamp copy over each ballot id, never collapsed; `complete` is false when a query reached no EOSE. */
export async function fetchBallotStamps(
    ballotIds: readonly string[],
    fetch: (ids: string[]) => Promise<EventsFetch>
): Promise<{ stamps: Map<string, unknown[]>; complete: boolean }> {
    const ids = [...new Set(ballotIds)];
    const stamps = new Map<string, unknown[]>(ids.map((id) => [id, []]));
    let complete = true;
    for (let i = 0; i < ids.length; i += IDS_PER_QUERY) {
        const r = await fetch(ids.slice(i, i + IDS_PER_QUERY));
        if (!r.complete) complete = false;
        for (const e of r.events) {
            let content: unknown;
            try {
                content = JSON.parse(e.content);
            } catch {
                continue;
            }
            const hash = (content as { content?: { hash?: unknown } } | null)?.content?.hash;
            if (typeof hash === 'string' && hash.startsWith('sha256:')) stamps.get(hash.slice(7))?.push(content);
        }
    }
    return { stamps, complete };
}

/**
 * What the tally needs for an anchored poll: the tip, `H_close`, and each
 * ballot's anchor height. Null for a clock-dated poll. Throws when the chain
 * or the relays cannot be read.
 */
export async function anchoredChain(
    poll: Poll,
    ballotIds: readonly string[],
    opts: {
        relays?: readonly string[];
        blockTimes?: BlockTimeSource;
        headers?: BlockHeaderSource;
        mempoolBase?: string;
        fetchStamps?: (ids: string[]) => Promise<EventsFetch>;
    } = {}
): Promise<AnchoredChain | null> {
    if (!isAnchoredPoll(poll)) return null;
    const close = await resolveCloseBlock(
        poll.deadline,
        opts.blockTimes ?? mempoolBlockTimeSource(opts.mempoolBase ? { base: opts.mempoolBase } : {})
    );
    if (!close.ok) throw new Error(`the block at the deadline could not be read (${close.code}): ${close.reason}`);
    const fetchStamps =
        opts.fetchStamps ??
        ((ids: string[]) => query({ kinds: [STAMP_KIND], '#t': ids.map((id) => `sha256:${id}`) }, opts.relays));
    const { stamps, complete } = await fetchBallotStamps(ballotIds, fetchStamps);
    if (!complete) throw new Error('no relay finished answering the stamp query; try again');
    const headers =
        opts.headers ?? cachedHeaders(mempoolHeaderSource(opts.mempoolBase ? { baseUrl: opts.mempoolBase } : {}));
    const verify = stampAnchorVerifier(headers);
    const heights = new Map<string, number | null>();
    for (const [id, copies] of stamps) heights.set(id, await anchorHeightFromStamps(id, copies, (s) => verify(s)));
    return { tipHeight: close.tip, closeHeight: close.height, anchorHeight: (id) => heights.get(id) ?? null };
}

/**
 * An OC Stamp over a ballot (SPEC §4.6), signed by a fresh key: who signs a
 * stamp carries no authority. Its id is submitted to the calendars.
 */
export async function stampBallot(ballot: Ballot, fetchImpl?: typeof fetch): Promise<StampEnvelope> {
    const key = randomBytes(32);
    const address = addressFromPrivateKey(key, 'p2wpkh');
    const content = ballotStampContent(ballot);
    const env = await stamp({
        content: { hash: content.hash, length: content.length },
        mime: content.mime,
        signer: { address, signMessage: async (m) => signMessage(address, m, key) },
    });
    const proof = await submitToCalendars(env.id, fetchImpl ? { fetch: fetchImpl } : {});
    return { ...env, ots: toStampOts(proof) };
}

/** The kind-30083 tags and content that publish a stamp (OC Stamp §7). */
export function stampEventParts(env: StampEnvelope): { tags: string[][]; content: string } {
    return {
        tags: [
            ['d', `oc-stamp:${env.id}`],
            ['t', env.signer.address],
            ['t', env.content.hash],
            ['t', 'oc-stamp'],
        ],
        content: canonicalizeEnvelope(env),
    };
}
