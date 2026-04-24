// HTTP client for an OpenTimestamps calendar. Implements the minimal subset
// of the calendar protocol that an OC Stamp implementation needs:
//
//   POST <url>/digest          body = raw digest bytes        -> pending proof bytes
//   GET  <url>/timestamp/<hex>                                -> upgraded proof bytes, or 404
//
// The client is thin by design. It does not parse proof bytes; that is a
// separate concern addressed by whichever OTS proof library the consumer
// plugs in (see verifyOtsAnchor in ./anchor.ts).

import type { CalendarClient } from './types.js';
import { hexEncode } from './base64.js';

export const DEFAULT_CALENDARS: readonly string[] = [
    'https://alice.btc.calendar.opentimestamps.org',
    'https://bob.btc.calendar.opentimestamps.org',
    'https://finney.calendar.eternitywall.com',
];

export interface HttpCalendarOptions {
    /**
     * Custom fetch implementation. Defaults to global `fetch`. Useful in
     * environments that need a specific adapter (Node < 18, Cloudflare
     * Workers, proxies).
     */
    fetch?: typeof fetch;
    /** Request timeout in milliseconds. Default 30_000. */
    timeoutMs?: number;
}

export function createCalendarClient(url: string, opts: HttpCalendarOptions = {}): CalendarClient {
    const fetchImpl = opts.fetch ?? globalThis.fetch;
    if (typeof fetchImpl !== 'function') {
        throw new Error(
            '@orangecheck/stamp-ots: no fetch implementation available. Pass one via { fetch }.'
        );
    }
    const timeoutMs = opts.timeoutMs ?? 30_000;
    const base = url.replace(/\/$/, '');

    return {
        url: base,
        async submit(digest, signal) {
            if (digest.byteLength !== 32) {
                throw new Error('OTS: digest must be exactly 32 bytes');
            }
            const ac = withTimeout(signal, timeoutMs);
            // Uint8Array is a valid fetch body at runtime in Node 18+ and all
            // modern browsers, but TypeScript's DOM typings don't accept it
            // directly under `strict` + `noUncheckedIndexedAccess`. The cast is
            // narrow and intentional.
            const resp = await fetchImpl(`${base}/digest`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/vnd.opentimestamps.v1' },
                body: digest as unknown as BodyInit,
                signal: ac.signal,
            });
            ac.clear();
            if (!resp.ok) {
                throw new Error(`OTS calendar ${base} submit failed: HTTP ${resp.status}`);
            }
            const buf = await resp.arrayBuffer();
            return new Uint8Array(buf);
        },
        async fetchProof(digest, signal) {
            if (digest.byteLength !== 32) {
                throw new Error('OTS: digest must be exactly 32 bytes');
            }
            const ac = withTimeout(signal, timeoutMs);
            const resp = await fetchImpl(`${base}/timestamp/${hexEncode(digest)}`, {
                method: 'GET',
                headers: { Accept: 'application/vnd.opentimestamps.v1' },
                signal: ac.signal,
            });
            ac.clear();
            if (resp.status === 404) return null;
            if (!resp.ok) {
                throw new Error(`OTS calendar ${base} fetchProof failed: HTTP ${resp.status}`);
            }
            const buf = await resp.arrayBuffer();
            return new Uint8Array(buf);
        },
    };
}

function withTimeout(parent: AbortSignal | undefined, ms: number): { signal: AbortSignal; clear: () => void } {
    const ac = new AbortController();
    const onParent = () => ac.abort((parent as AbortSignal & { reason?: unknown }).reason);
    if (parent) {
        if (parent.aborted) ac.abort((parent as AbortSignal & { reason?: unknown }).reason);
        else parent.addEventListener('abort', onParent, { once: true });
    }
    const t = setTimeout(() => ac.abort(new Error(`OTS request timed out after ${ms}ms`)), ms);
    return {
        signal: ac.signal,
        clear: () => {
            clearTimeout(t);
            if (parent) parent.removeEventListener('abort', onParent);
        },
    };
}
