// A directory world for tests: relays, block headers, coins and bindings in memory,
// with claims whose bare proofs commit their id as a block's Merkle root.
import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { channelClaimId, claimId, directoryDtag } from '@orangecheck/lock-core/directory';
import { hexDecode, hexEncode, utf8Encode } from '@orangecheck/lock-crypto';
import type { NostrEvent } from '@orangecheck/lock-device';
import { verifyEvent } from '@orangecheck/nostr-core';
import { base64Encode, serializeTimestamp } from '@orangecheck/stamp-ots';

import type { WalkDeps } from '../directory';

export const TIP = 930_000;
export const sk = (n: number) => hexEncode(new Uint8Array(32).fill(n));
export const pk = (n: number) => hexEncode(schnorr.getPublicKey(hexDecode(sk(n))));
export const h = (s: string) => hexEncode(sha256(utf8Encode(s)));

export function sign(
    n: number,
    content: Record<string, unknown>,
    d: string,
    createdAt = 1_790_000_000
): NostrEvent {
    const unsigned = {
        pubkey: pk(n),
        created_at: createdAt,
        kind: 30114,
        tags: [['d', d]],
        content: JSON.stringify(content),
    };
    const id = hexEncode(
        sha256(
            utf8Encode(
                JSON.stringify([
                    0,
                    unsigned.pubkey,
                    unsigned.created_at,
                    unsigned.kind,
                    unsigned.tags,
                    unsigned.content,
                ])
            )
        )
    );
    return { ...unsigned, id, sig: hexEncode(schnorr.sign(hexDecode(id), hexDecode(sk(n)))) };
}

/** A bare OTS proof that commits `idHex` as the Merkle root of the block at `height`. */
export function bareProof(idHex: string, height: number): string {
    return base64Encode(
        serializeTimestamp({
            msg: hexDecode(idHex),
            attestations: [{ kind: 'bitcoin', height }],
            ops: [],
        })
    );
}

/** A claim whose proof is anchored at `height` once the world knows its root. */
export function claim(
    handle: string,
    address: string,
    height: number,
    tag = handle,
    ns: 'people' | 'channel' = 'people'
) {
    const outpoint = `${h('coin ' + tag)}:0`;
    const nonce = h('nonce ' + tag);
    const id = (ns === 'people' ? claimId : channelClaimId)({ handle, address, outpoint, nonce });
    return { id, height, claim: { outpoint, nonce, ots: bareProof(id, height) } };
}

export type Claim = ReturnType<typeof claim>;

export function listing(
    n: number,
    handle: string,
    address: string,
    c: Claim,
    extra: Record<string, unknown> = {},
    at?: number
) {
    return sign(
        n,
        {
            v: 2,
            handle,
            address,
            inbox_pubkey: pk(n),
            claim: c.claim,
            opted_in: true,
            created_at: at ?? 1_790_000_000,
            ...extra,
        },
        directoryDtag(handle),
        at
    );
}

/** Relays, chain and bindings for one test. */
export function world() {
    const w = {
        relays: new Map<string, NostrEvent[]>(),
        incomplete: new Set<string>(),
        roots: new Map<number, string>(),
        coins: new Map<
            string,
            { confirmedAt: number; value: number; paysTo: string; spendHeight: number | null }
        >(),
        bound: new Map<string, string[]>(),
        headerReads: 0,
    };
    const header = (rootHex: string) => {
        const b = new Uint8Array(80);
        b.set(hexDecode(rootHex), 36);
        return b;
    };
    const deps: WalkDeps = {
        page: async (relay, filter) => {
            if (w.incomplete.has(relay)) return { events: [], complete: false };
            const all = (w.relays.get(relay) ?? [])
                .filter((e) => e.tags.some((t) => t[0] === 'd' && t[1] === filter['#d'][0]))
                .filter((e) => filter.until === undefined || e.created_at <= filter.until)
                .sort((a, b) => b.created_at - a.created_at);
            return { events: all.slice(0, filter.limit), complete: true };
        },
        tip: async () => TIP,
        headers: {
            getHeaderAt: async (height) => {
                w.headerReads++;
                const r = w.roots.get(height);
                return r ? header(r) : null;
            },
        },
        coin: async (o) => w.coins.get(o) ?? 'no-answer',
        boundKeys: async (a) => w.bound.get(a) ?? [],
        verifyEvent: (ev) => verifyEvent(ev),
    };
    /** Anchor a claim's proof and give it a coin of `address` aged 500 blocks at the anchor. */
    const anchorAt = (c: Claim, address: string) => {
        w.roots.set(c.height, c.id);
        w.coins.set(c.claim.outpoint, {
            confirmedAt: c.height - 500,
            value: 5000,
            paysTo: address,
            spendHeight: null,
        });
    };
    /** Put events on the directory relay. */
    const publish = (...events: NostrEvent[]) =>
        w.relays.set('wss://relay.ochk.io', [
            ...(w.relays.get('wss://relay.ochk.io') ?? []),
            ...events,
        ]);
    return { w, deps, anchorAt, header, publish };
}
