// Types for @orangecheck/stamp-ots.

import type { StampOts } from '@orangecheck/stamp-core';

export type OtsProofStatus = 'pending' | 'confirmed';

export interface OtsProof {
    status: OtsProofStatus;
    /** Raw proof bytes as base64. Opaque at this layer; parsers plug in. */
    proof: string;
    /** Calendar URLs that contain this proof, in submission order. */
    calendars: string[];
    /** Bitcoin block height at which this proof is anchored (null if pending). */
    blockHeight: number | null;
    /** Bitcoin block hash (hex, lowercase) at the anchor block (null if pending). */
    blockHash: string | null;
    /** ISO 8601 UTC of the upgrade (null if pending). */
    upgradedAt: string | null;
}

export interface CalendarClient {
    /** Base URL of the calendar, e.g. "https://alice.btc.calendar.opentimestamps.org". */
    readonly url: string;

    /**
     * Submit a 32-byte digest to the calendar for aggregation. Returns the raw
     * pending proof bytes.
     *
     * OTS calendar HTTP API: POST <url>/digest with the raw bytes as the body,
     * Content-Type: application/vnd.opentimestamps.v1, returns the proof bytes
     * as the response body.
     */
    submit(digest: Uint8Array, signal?: AbortSignal): Promise<Uint8Array>;

    /**
     * Fetch the current (possibly upgraded) proof for a previously-submitted
     * digest. Returns null if the calendar has no proof for this digest yet.
     *
     * OTS calendar HTTP API: GET <url>/timestamp/<hex(digest)>, returns the
     * proof bytes or 404.
     */
    fetchProof(digest: Uint8Array, signal?: AbortSignal): Promise<Uint8Array | null>;
}

export interface AnchorVerificationInput {
    /** Raw OTS proof bytes (base64-decoded by the caller). */
    proofBytes: Uint8Array;
    /** 32-byte digest that the proof commits to. */
    digest: Uint8Array;
    /** Declared block height from the envelope. */
    blockHeight: number;
    /** Declared block hash (hex) from the envelope. */
    blockHash: string;
    /**
     * Optional block header source. If provided, the verifier uses this to
     * fetch the header at `blockHeight` and compare its Merkle root to the
     * one derived from walking the proof.
     *
     * If omitted, the verifier MAY still parse the proof and report
     * structural validity but CANNOT report a bound anchor.
     */
    headerSource?: BlockHeaderSource;
}

export interface BlockHeaderSource {
    /** Return the 80-byte raw block header at the given height, or null if unknown. */
    getHeaderAt(height: number): Promise<Uint8Array | null>;
}

export type AnchorVerifier = (input: AnchorVerificationInput) => Promise<AnchorVerificationResult>;

export type AnchorVerificationResult =
    | { ok: true; merkleRoot: string }
    | { ok: false; reason: string };

/**
 * Convert an OtsProof (library type) to the StampOts field shape that the
 * envelope carries. The two are isomorphic; this function exists to keep
 * stamp-core's type surface narrow.
 */
export function toStampOts(p: OtsProof): StampOts {
    return {
        status: p.status,
        proof: p.proof,
        calendars: p.calendars,
        block_height: p.blockHeight,
        block_hash: p.blockHash,
        upgraded_at: p.upgradedAt,
    };
}

export function fromStampOts(s: StampOts): OtsProof {
    return {
        status: s.status,
        proof: s.proof,
        calendars: s.calendars,
        blockHeight: s.block_height,
        blockHash: s.block_hash,
        upgradedAt: s.upgraded_at,
    };
}
