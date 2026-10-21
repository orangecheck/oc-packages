// Submit an envelope id to one or more OTS calendars. Returns a pending proof.
// See SPEC.md §6.1.
//
// The submission strategy: try each calendar in parallel, take the first
// success, report which calendar produced it. A stamp that only reaches one
// calendar is a single point of failure for upgrade; the reference app
// submits to at least two calendars for redundancy.

import { base64Encode, hexDecode } from './base64.js';
import { createCalendarClient, DEFAULT_CALENDARS } from './calendar.js';
import { mergeAt, parseTimestamp, serializeTimestamp, type OtsTimestamp } from './ots.js';
import type { CalendarClient, OtsProof } from './types.js';

export interface SubmitOptions {
    /**
     * Calendars to submit to. Defaults to DEFAULT_CALENDARS. Can be strings
     * (URLs) or pre-built CalendarClient instances.
     */
    calendars?: readonly (string | CalendarClient)[];
    /**
     * Minimum number of calendars that must succeed. Defaults to 1.
     * If fewer than `minSuccesses` calendars respond with a proof,
     * submit() throws an aggregate error.
     */
    minSuccesses?: number;
    /** Optional custom fetch passed through to calendar clients. */
    fetch?: typeof fetch;
    /** Request timeout per calendar. Default 30_000ms. */
    timeoutMs?: number;
    signal?: AbortSignal;
}

/**
 * Submit the envelope `id` (64-hex) to OTS calendars and return an OtsProof in
 * pending state. The caller merges this into the envelope's `ots` field.
 *
 * Each calendar answers with its own pending timestamp for the digest. They are
 * merged into one proof, so upgrade (see upgrade.ts) can ask any calendar that
 * answered. A calendar whose answer does not parse counts as a failure.
 */
export async function submitToCalendars(idHex: string, opts: SubmitOptions = {}): Promise<OtsProof> {
    const digest = hexDecode(idHex);
    if (digest.byteLength !== 32) {
        throw new Error('submitToCalendars: idHex must be 32 bytes (64 hex chars)');
    }

    const clients = (opts.calendars ?? DEFAULT_CALENDARS).map((c) =>
        typeof c === 'string'
            ? createCalendarClient(c, { fetch: opts.fetch, timeoutMs: opts.timeoutMs })
            : c
    );
    if (clients.length === 0) {
        throw new Error('submitToCalendars: at least one calendar is required');
    }
    const minSuccesses = Math.max(1, opts.minSuccesses ?? 1);

    const settled = await Promise.allSettled(
        clients.map(async (c) => {
            const proof = await c.submit(digest, opts.signal);
            return { url: c.url, proof };
        })
    );
    const successes = settled
        .filter((r): r is PromiseFulfilledResult<{ url: string; proof: Uint8Array }> => r.status === 'fulfilled')
        .map((r) => r.value);
    const failures = settled
        .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
        .map((r) => (r.reason instanceof Error ? r.reason.message : String(r.reason)));

    if (successes.length < minSuccesses) {
        // AggregateError would be nicer but targets ES2021; Error keeps us at ES2020.
        const msg = `OTS submission did not reach ${minSuccesses} calendar(s). Errors: ${failures.join('; ')}`;
        const err = new Error(msg) as Error & { errors: string[] };
        err.errors = failures;
        throw err;
    }

    // Keep every calendar's receipt in one proof, so any of them can upgrade it.
    let tree: OtsTimestamp | null = null;
    const merged: string[] = [];
    for (const s of successes) {
        let receipt: OtsTimestamp;
        try {
            receipt = parseTimestamp(s.proof, digest);
        } catch (e) {
            failures.push(`${s.url}: unreadable proof (${e instanceof Error ? e.message : String(e)})`);
            continue;
        }
        if (tree) mergeAt(tree, receipt);
        else tree = receipt;
        merged.push(s.url);
    }
    if (!tree || merged.length < minSuccesses) {
        const msg = `OTS submission did not reach ${minSuccesses} calendar(s). Errors: ${failures.join('; ')}`;
        const err = new Error(msg) as Error & { errors: string[] };
        err.errors = failures;
        throw err;
    }
    return {
        status: 'pending',
        proof: base64Encode(serializeTimestamp(tree)),
        calendars: merged,
        blockHeight: null,
        blockHash: null,
        upgradedAt: null,
    };
}
