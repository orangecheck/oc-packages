// Upgrade a pending OTS proof to a confirmed one. See SPEC.md §6.2.
//
// A pending proof ends in calendar attestations, each naming a calendar and
// the commitment (the message at that leaf) the calendar will later anchor.
// Calendars index upgrades by that commitment, not by the submitted digest.
// For each pending leaf we ask its calendar for the continuation, graft it on,
// and report the proof as confirmed once it reaches a Bitcoin attestation
// whose block header checks out.

import { blockHashOf } from './anchor.js';
import { base64Decode, base64Encode, hexDecode } from './base64.js';
import { createCalendarClient } from './calendar.js';
import {
    bitcoinAnchors,
    bytesEqual,
    mergeAt,
    parseProof,
    parseTimestamp,
    pendingCommitments,
    serializeTimestamp,
} from './ots.js';
import type { BlockHeaderSource, OtsProof } from './types.js';

export interface UpgradeOptions {
    /**
     * Header source used to resolve the anchor's block hash and to check that
     * the proof's Merkle root is in that block.
     */
    headerSource?: BlockHeaderSource;
    /**
     * Alternative to `headerSource`: given the merged proof bytes, return the
     * anchor if the proof is confirmed, else null.
     */
    parseAnchor?: (proofBytes: Uint8Array) => Promise<{ blockHeight: number; blockHash: string } | null>;
    /** Optional custom fetch passed through to calendar clients. */
    fetch?: typeof fetch;
    /** Request timeout per calendar. Default 30_000ms. */
    timeoutMs?: number;
    signal?: AbortSignal;
}

const norm = (u: string) => u.replace(/\/+$/, '');

export async function upgradeProof(
    current: OtsProof,
    idHex: string,
    opts: UpgradeOptions
): Promise<OtsProof> {
    if (current.status === 'confirmed') return current; // idempotent
    if (!opts.headerSource && !opts.parseAnchor) {
        throw new Error('upgradeProof: pass headerSource or parseAnchor');
    }

    const before = base64Decode(current.proof);
    const tree = parseProof(before, hexDecode(idHex));

    // Only ask calendars this proof was submitted to.
    const listed = new Set(current.calendars.map(norm));
    const pending = pendingCommitments(tree).filter((p) => listed.has(norm(p.uri)));
    if (pending.length === 0 && bitcoinAnchors(tree).length === 0) {
        throw new Error('upgradeProof: proof has no pending attestation from a listed calendar');
    }

    const answered: string[] = [];
    await Promise.allSettled(
        pending.map(async ({ uri, commitment }) => {
            const client = createCalendarClient(uri, { fetch: opts.fetch, timeoutMs: opts.timeoutMs });
            const bytes = await client.fetchProof(commitment, opts.signal);
            if (!bytes) return;
            if (mergeAt(tree, parseTimestamp(bytes, commitment))) answered.push(norm(uri));
        })
    );

    const merged = serializeTimestamp(tree);
    const anchor = await resolveAnchor(merged, tree, opts);
    const calendars = [...answered, ...current.calendars.filter((c) => !answered.includes(norm(c)))];

    if (anchor) {
        return {
            status: 'confirmed',
            proof: base64Encode(merged),
            calendars,
            blockHeight: anchor.blockHeight,
            blockHash: anchor.blockHash,
            upgradedAt: new Date().toISOString().replace(/\.\d+Z$/, 'Z'),
        };
    }
    if (!bytesEqual(merged, before)) {
        return { ...current, proof: base64Encode(merged), calendars };
    }
    return current;
}

async function resolveAnchor(
    merged: Uint8Array,
    tree: ReturnType<typeof parseTimestamp>,
    opts: UpgradeOptions
): Promise<{ blockHeight: number; blockHash: string } | null> {
    if (opts.parseAnchor) return opts.parseAnchor(merged);
    for (const a of bitcoinAnchors(tree)) {
        const header = await opts.headerSource!.getHeaderAt(a.blockHeight);
        if (header && header.byteLength === 80 && bytesEqual(header.subarray(36, 68), a.merkleRoot)) {
            return { blockHeight: a.blockHeight, blockHash: blockHashOf(header) };
        }
    }
    return null;
}
