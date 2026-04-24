// Upgrade a pending OTS proof to a confirmed one. See SPEC.md §6.2.
//
// Upgrade strategy: for each listed calendar, ask whether it has an upgraded
// proof for this digest. If at least one calendar returns a proof longer than
// the current pending one (heuristic for "more commitments included"),
// return an upgraded OtsProof. The caller is responsible for verifying the
// proof chains to a real Bitcoin block header (see anchor.ts).
//
// This package does NOT parse the proof bytes to extract block_height /
// block_hash — that requires a full OTS proof parser. We provide an anchor
// verifier callback pattern instead (see AnchorVerifier in ./types.ts).

import { base64Decode, base64Encode, hexDecode } from './base64.js';
import { createCalendarClient } from './calendar.js';
import type { CalendarClient, OtsProof } from './types.js';

export interface UpgradeOptions {
    /**
     * A parser that, given proof bytes, returns `{blockHeight, blockHash}` if
     * the proof is fully anchored, or null if it's still pending.
     *
     * Callers plug in their own parser (e.g., via the `opentimestamps` npm
     * package). This keeps @orangecheck/stamp-ots free of heavy parser deps.
     */
    parseAnchor: (proofBytes: Uint8Array) => Promise<{ blockHeight: number; blockHash: string } | null>;
    /** Optional custom fetch passed through to calendar clients. */
    fetch?: typeof fetch;
    /** Request timeout per calendar. Default 30_000ms. */
    timeoutMs?: number;
    signal?: AbortSignal;
}

export async function upgradeProof(
    current: OtsProof,
    idHex: string,
    opts: UpgradeOptions
): Promise<OtsProof> {
    if (current.status === 'confirmed') return current; // idempotent

    const digest = hexDecode(idHex);
    const clients: CalendarClient[] = current.calendars.map((url) =>
        createCalendarClient(url, { fetch: opts.fetch, timeoutMs: opts.timeoutMs })
    );
    if (clients.length === 0) {
        throw new Error('upgradeProof: no calendars listed in current proof');
    }

    const attempts = await Promise.allSettled(
        clients.map(async (c) => {
            const proof = await c.fetchProof(digest, opts.signal);
            if (!proof) return null;
            const anchor = await opts.parseAnchor(proof);
            return { url: c.url, proof, anchor };
        })
    );

    // Prefer a fully-confirmed proof from any calendar.
    for (const r of attempts) {
        if (r.status !== 'fulfilled' || r.value === null) continue;
        const { url, proof, anchor } = r.value;
        if (anchor) {
            return {
                status: 'confirmed',
                proof: base64Encode(proof),
                calendars: uniqueFirst(current.calendars, url),
                blockHeight: anchor.blockHeight,
                blockHash: anchor.blockHash,
                upgradedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
            };
        }
    }

    // No confirmation yet. Some calendars may still have returned updated
    // pending bytes (more commitments included). Prefer the longest.
    let longest: { url: string; proof: Uint8Array } | null = null;
    for (const r of attempts) {
        if (r.status !== 'fulfilled' || r.value === null) continue;
        if (!longest || r.value.proof.byteLength > longest.proof.byteLength) {
            longest = { url: r.value.url, proof: r.value.proof };
        }
    }
    if (longest) {
        const currentBytes = base64Decode(current.proof);
        if (longest.proof.byteLength > currentBytes.byteLength) {
            return {
                status: 'pending',
                proof: base64Encode(longest.proof),
                calendars: uniqueFirst(current.calendars, longest.url),
                blockHeight: null,
                blockHash: null,
                upgradedAt: null,
            };
        }
    }
    return current;
}

function uniqueFirst(arr: readonly string[], first: string): string[] {
    const out = [first];
    for (const x of arr) if (x !== first && !out.includes(x)) out.push(x);
    return out;
}
