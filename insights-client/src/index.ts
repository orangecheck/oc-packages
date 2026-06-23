/**
 * @orangecheck/insights-client
 *
 * Server-side emit API for **oc insights** — the OrangeCheck family's
 * first-party, protocol-aware event lane. It records the things hosted
 * Plausible is structurally blind to: BIP-322 sign success, Connect
 * logins, settlements, attestations, votes, pledges, agent delegations —
 * emitted from each app's own backend at the moment a protocol action
 * commits.
 *
 * Two non-negotiable properties, because `emit()` is called inline of a
 * protocol action and must NEVER break it:
 *   1. Fire-and-forget — it never throws into the caller (every failure
 *      is swallowed; pass `onError` if you want to observe them).
 *   2. Safe-when-unconfigured — with no collector token it is an inert
 *      no-op, so call sites can ship before the collector exists.
 *
 * Quick start:
 *
 *   import { emit } from '@orangecheck/insights-client';
 *
 *   // long-lived server: ignore the promise, it sends in the background
 *   void emit('attest', 'bip322_success', { scheme: 'p2wpkh' });
 *
 *   // serverless (Vercel): await it (or hand it to waitUntil) so the
 *   // function doesn't freeze before the request flushes. `keepalive`
 *   // is set, which also lets a returning function's request survive.
 *   await emit('me', 'settlement', { class: 'B' });
 *
 * Configuration is via env (no setup needed beyond the two vars):
 *   OC_INSIGHTS_INGEST_URL    default https://insights.ochk.io/api/insights/ingest
 *   OC_INSIGHTS_INGEST_TOKEN  bearer token for the collector (required to enable)
 *   OC_INSIGHTS_SOURCE        optional emitting-service id (sent as a header)
 * or explicitly via `configure({...})` / `createInsightsClient({...})`.
 *
 * Privacy: an optional `actor` (a bare Bitcoin address or email) may be
 * attached so per-actor activity can be counted. The client sends it
 * server-to-server over TLS to the trusted first-party collector, which
 * computes a product-scoped, daily-salted hash and discards the raw
 * value — the raw actor is NEVER stored. The client itself never hashes
 * (the rotating salt lives at the collector) and never persists anything.
 *
 * Serverless delivery: emit hands its in-flight POST to Vercel's `waitUntil`
 * so the invocation stays alive until the body flushes — without it a caller's
 * `void emit()` is frozen out on Vercel before the keepalive request lands.
 * No-op outside a Vercel request context (the keepalive fetch is best-effort).
 */

import { waitUntil } from '@vercel/functions';

/** oc-me's billable-event class taxonomy (A/B/C), passed through verbatim. */
export type EventClass = 'A' | 'B' | 'C';

/** A primitive prop value. Objects/arrays are rejected (kept flat + cheap). */
export type PropValue = string | number | boolean | null;

export interface InsightsEvent {
    /** Registry slug of the emitting product: 'me' | 'vault' | 'fleet' | 'attest' | … */
    product: string;
    /** Event name, e.g. 'pageview' (reserved for the beacon lane), 'bip322_success', 'settlement'. */
    name: string;
    /** ISO-8601 timestamp. Omit to let the collector stamp receipt time. */
    ts?: string;
    /** Small flat bag of custom props (capped at 30 keys; non-primitive values dropped). */
    props?: Record<string, PropValue>;
    /**
     * OPTIONAL bare actor id (Bitcoin address / email). The collector
     * salted-hashes it product-scoped and discards the raw value — never
     * stored. Omit for fully anonymous events.
     */
    actor?: string | null;
    /** oc-me A/B/C billable-event class, when applicable. */
    eventClass?: EventClass;
    /** Finer event subtype, e.g. a SUBTYPE_CLASS key like 'stamp_signing'. */
    subtype?: string;
}

export interface InsightsClientConfig {
    /** Collector ingest URL. Default: env OC_INSIGHTS_INGEST_URL ?? the canonical insights.ochk.io route. */
    url?: string;
    /** Bearer token for the collector. Default: env OC_INSIGHTS_INGEST_TOKEN. Without it the client is a no-op. */
    token?: string;
    /** Abort the POST after this many ms. Default 2000. */
    timeoutMs?: number;
    /** Injected fetch (tests / non-global-fetch runtimes). Default: globalThis.fetch. */
    fetch?: typeof fetch;
    /** Optional observability hook for swallowed errors / non-2xx. Never rethrows. */
    onError?: (err: unknown) => void;
    /** Optional emitting-service id, sent as `x-oc-insights-source`. Default: env OC_INSIGHTS_SOURCE. */
    source?: string;
}

export interface InsightsClient {
    /** Convenience: emit(product, name, props). Resolves (never rejects). */
    emit(product: string, name: string, props?: Record<string, PropValue>): Promise<void>;
    /** Emit a fully-specified event. Resolves (never rejects). */
    emitEvent(event: InsightsEvent): Promise<void>;
    /** True when a token + url + fetch are present. When false, emit is an inert no-op. */
    readonly enabled: boolean;
}

const DEFAULT_URL = 'https://insights.ochk.io/api/insights/ingest';
const DEFAULT_TIMEOUT_MS = 2000;
const MAX_PROP_KEYS = 30;
const MAX_NAME_LEN = 64;
const MAX_PRODUCT_LEN = 32;
const MAX_SUBTYPE_LEN = 64;
const MAX_STRING_VALUE_LEN = 512;

/**
 * Build an insights client bound to an explicit config (handy for tests
 * and for services that don't want the env-driven default). Most call
 * sites should just use the top-level `emit` / `emitEvent`.
 */
export function createInsightsClient(config: InsightsClientConfig = {}): InsightsClient {
    const url = config.url ?? readEnv('OC_INSIGHTS_INGEST_URL') ?? DEFAULT_URL;
    const token = config.token ?? readEnv('OC_INSIGHTS_INGEST_TOKEN');
    const timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    const doFetch = config.fetch ?? globalFetch();
    const onError = config.onError;
    const source = config.source ?? readEnv('OC_INSIGHTS_SOURCE');
    const enabled = Boolean(token && url && doFetch);

    async function doEmit(event: InsightsEvent): Promise<void> {
        try {
            if (!enabled || !doFetch) return; // inert no-op when unconfigured
            const product = clip(event.product, MAX_PRODUCT_LEN);
            const name = clip(event.name, MAX_NAME_LEN);
            if (!product || !name) return; // never emit a malformed event

            const payload: Record<string, unknown> = { product, name };
            if (event.ts) payload.ts = String(event.ts);
            const props = clampProps(event.props);
            if (props) payload.props = props;
            if (event.actor != null && event.actor !== '') payload.actor = String(event.actor);
            if (event.eventClass) payload.eventClass = event.eventClass;
            if (event.subtype) payload.subtype = clip(event.subtype, MAX_SUBTYPE_LEN);

            const ctl = new AbortController();
            const timer = setTimeout(() => ctl.abort(), timeoutMs);
            try {
                const headers: Record<string, string> = {
                    // text/plain keeps the POST a CORS "simple request" — identical
                    // wire contract to the browser beacon lane (no preflight).
                    'content-type': 'text/plain',
                    authorization: `Bearer ${token}`,
                };
                if (source) headers['x-oc-insights-source'] = source;
                const res = await doFetch(url, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify(payload),
                    signal: ctl.signal,
                    // survive a serverless function returning before the body flushes
                    keepalive: true,
                });
                if (onError && res && !res.ok) {
                    onError(new Error(`oc-insights ingest HTTP ${res.status}`));
                }
            } finally {
                clearTimeout(timer);
            }
        } catch (err) {
            // NEVER throw into the caller — emit must not break the action.
            if (onError) {
                try {
                    onError(err);
                } catch {
                    /* an onError that throws is not our problem to surface */
                }
            }
        }
    }

    // Public entry: start the POST, then keep the serverless invocation alive
    // until it flushes. Vercel freezes the function after the response, so a
    // bare `void emit()` is otherwise dropped before the keepalive body sends.
    // Returns the same promise so a caller can still `await` it if it wants.
    function emitEvent(event: InsightsEvent): Promise<void> {
        const pending = doEmit(event);
        try {
            waitUntil(pending);
        } catch {
            /* not in a Vercel request context — keepalive fetch is best-effort */
        }
        return pending;
    }

    function emit(
        product: string,
        name: string,
        props?: Record<string, PropValue>
    ): Promise<void> {
        return emitEvent({ product, name, props });
    }

    return {
        emit,
        emitEvent,
        get enabled() {
            return enabled;
        },
    };
}

// ── module-level default client (lazy; env-driven) ──────────────────────

let defaultClient: InsightsClient | null = null;
let overrides: InsightsClientConfig = {};

/**
 * Override the default client's config (e.g. inject a token or fetch).
 * Resets the lazily-built default so the next emit picks up the change.
 */
export function configure(config: InsightsClientConfig): void {
    overrides = { ...config };
    defaultClient = null;
}

function getDefault(): InsightsClient {
    if (!defaultClient) defaultClient = createInsightsClient(overrides);
    return defaultClient;
}

/** Emit an event via the default env-driven client. Resolves (never rejects). */
export function emit(
    product: string,
    name: string,
    props?: Record<string, PropValue>
): Promise<void> {
    return getDefault().emit(product, name, props);
}

/** Emit a fully-specified event via the default client. Resolves (never rejects). */
export function emitEvent(event: InsightsEvent): Promise<void> {
    return getDefault().emitEvent(event);
}

/** Whether the default client is configured (has a token + url + fetch). */
export function isEnabled(): boolean {
    return getDefault().enabled;
}

// ── helpers ─────────────────────────────────────────────────────────────

function readEnv(key: string): string | undefined {
    try {
        if (typeof process !== 'undefined' && process.env) {
            const v = process.env[key];
            if (typeof v === 'string' && v.length > 0) return v;
        }
    } catch {
        /* no process — non-node runtime */
    }
    return undefined;
}

function globalFetch(): typeof fetch | undefined {
    try {
        if (typeof fetch === 'function') return fetch.bind(globalThis);
    } catch {
        /* no global fetch */
    }
    return undefined;
}

function clip(v: unknown, max: number): string {
    if (typeof v !== 'string') return '';
    const t = v.trim();
    return t.length > max ? t.slice(0, max) : t;
}

function clampProps(
    props: Record<string, PropValue> | undefined
): Record<string, PropValue> | undefined {
    if (!props || typeof props !== 'object') return undefined;
    const out: Record<string, PropValue> = {};
    let n = 0;
    for (const key of Object.keys(props)) {
        if (n >= MAX_PROP_KEYS) break;
        const k = clip(key, MAX_NAME_LEN);
        if (!k) continue;
        const raw = props[key];
        if (typeof raw === 'string') {
            out[k] = raw.length > MAX_STRING_VALUE_LEN ? raw.slice(0, MAX_STRING_VALUE_LEN) : raw;
            n++;
        } else if (typeof raw === 'number' && Number.isFinite(raw)) {
            out[k] = raw;
            n++;
        } else if (typeof raw === 'boolean' || raw === null) {
            out[k] = raw;
            n++;
        }
        // objects/arrays/undefined are dropped — keep events flat + cheap
    }
    return n > 0 ? out : undefined;
}
