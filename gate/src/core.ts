import type { GateDecision, GateOptions, MinimalReq, MinimalRes, SubjectSource } from './types';

import { check } from '@orangecheck/sdk';

import { TtlLru } from './cache';

const caches = new WeakMap<GateOptions, TtlLru>();

/** Hard ceiling on per-entry TTL. Callers can't ask for a permanent grant
 * by passing a huge number — the cache isn't a session store. */
const MAX_CACHE_TTL_MS = 10 * 60_000; // 10 minutes
const DEFAULT_CACHE_TTL_MS = 60_000;
const DEFAULT_LOOKUP_TIMEOUT_MS = 5_000;

/** Subject strings > this length are almost certainly garbage — reject at
 * the gate instead of building a 10 KB cache key. */
const MAX_SUBJECT_LEN = 128;

function cacheFor(opts: GateOptions): TtlLru {
    let c = caches.get(opts);
    if (!c) {
        const ttl = Math.min(opts.cacheTtlMs ?? DEFAULT_CACHE_TTL_MS, MAX_CACHE_TTL_MS);
        c = new TtlLru(opts.cacheMax ?? 1_000, Math.max(0, ttl));
        caches.set(opts, c);
    }
    return c;
}

/**
 * Normalize a subject so that `bc1Q…` / `bc1q…` / ` bc1q… ` can't cache-key
 * to three separate rows against the same on-chain address. For bech32
 * (segwit) and attestation IDs, lowercase is correct; for legacy base58
 * addresses the case is significant, so only lowercase bc1/tb1.
 */
function normalizeSubject(kind: GateDecision['subjectKind'], raw: string): string {
    const trimmed = raw.trim();
    if (kind === 'attestation_id') return trimmed.toLowerCase();
    if (kind === 'address') {
        const low = trimmed.toLowerCase();
        if (low.startsWith('bc1') || low.startsWith('tb1') || low.startsWith('bcrt1')) return low;
        return trimmed; // base58 — keep case
    }
    // identity: `protocol:identifier` — lowercase protocol only
    const colon = trimmed.indexOf(':');
    if (colon === -1) return trimmed;
    return trimmed.slice(0, colon).toLowerCase() + ':' + trimmed.slice(colon + 1);
}

/** Track untrusted-source warnings we've already logged so we don't spam
 * the console on every request. */
const warnedUntrusted = new WeakSet<GateOptions>();

function warnUntrustedOnce(opts: GateOptions, src: SubjectSource): void {
    if (opts.trustUnsafeSources || warnedUntrusted.has(opts)) return;
    if (typeof src.from === 'function') return;
    if (src.from === 'header' || src.from === 'query' || src.from === 'cookie' || src.from === 'body') {
        warnedUntrusted.add(opts);
        // eslint-disable-next-line no-console
        console.warn(
            `[orangecheck/gate] subject source "${src.from}" is caller-supplied — any client can set it. ` +
                `For real auth, resolve the address from a signed session (e.g., { from: (req) => req.session.verifiedAddress }) ` +
                `or pass { trustUnsafeSources: true } to silence this warning.`
        );
    }
}

function readHeader(req: MinimalReq, name: string): string | undefined {
    const raw = req.headers?.[name.toLowerCase()];
    if (Array.isArray(raw)) return raw[0];
    return raw;
}

function readCookie(req: MinimalReq, name: string): string | undefined {
    // Prefer an already-parsed cookies jar (Express w/ cookie-parser, Next API).
    if (req.cookies && name in req.cookies) return req.cookies[name];
    // Fallback: parse the raw Cookie header.
    const raw = readHeader(req, 'cookie');
    if (!raw) return undefined;
    for (const part of raw.split(';')) {
        const eq = part.indexOf('=');
        if (eq === -1) continue;
        const k = part.slice(0, eq).trim();
        if (k === name) return decodeURIComponent(part.slice(eq + 1).trim());
    }
    return undefined;
}

function readQuery(req: MinimalReq, name: string): string | undefined {
    const raw = req.query?.[name];
    if (Array.isArray(raw)) return raw[0];
    return raw;
}

function readBodyPath(req: MinimalReq, path: string): string | undefined {
    if (!req.body || typeof req.body !== 'object') return undefined;
    const parts = path.split('.');
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let cur: any = req.body;
    for (const p of parts) {
        if (cur == null) return undefined;
        cur = cur[p];
    }
    return typeof cur === 'string' ? cur : undefined;
}

function resolve(src: SubjectSource | undefined, req: MinimalReq): string | undefined {
    if (!src) return undefined;
    if (typeof src.from === 'function') return src.from(req);
    switch (src.from) {
        case 'header':
            return readHeader(req, src.name ?? 'x-oc-address');
        case 'cookie':
            return readCookie(req, src.name ?? 'oc_addr');
        case 'query':
            return readQuery(req, src.name ?? 'ocAddr');
        case 'body':
            return readBodyPath(req, src.path ?? 'address');
        default:
            return undefined;
    }
}

/**
 * Run the OrangeCheck lookup + threshold comparison for a request, without
 * touching the response. Framework-agnostic. Use this directly in Fastify,
 * Hono, Workers, or anywhere Express middleware doesn't fit.
 *
 *   const decision = await assertOc(req, { minSats: 100_000, address: { from: 'header' } });
 *   if (!decision.ok) return res.status(403).json({ error: decision.reason });
 */
export async function assertOc(req: MinimalReq, opts: GateOptions): Promise<GateDecision> {
    const sources = [
        ['attestation_id', opts.attestationId] as const,
        ['address', opts.address] as const,
        ['identity', opts.identity] as const,
    ];

    let subject: string | undefined;
    let subjectKind: GateDecision['subjectKind'];
    for (const [kind, src] of sources) {
        if (!src) continue;
        warnUntrustedOnce(opts, src);
        const v = resolve(src, req);
        if (v) {
            subject = v;
            subjectKind = kind;
            break;
        }
    }

    if (!subject || !subjectKind) {
        return { ok: false, reason: 'no_subject' };
    }

    // Clamp obviously-junk subjects before they hit the cache or the network.
    if (subject.length > MAX_SUBJECT_LEN) {
        return { ok: false, reason: 'no_subject' };
    }
    subject = normalizeSubject(subjectKind, subject);

    const cache = cacheFor(opts);
    const cacheKey = `${subjectKind}:${subject}:${opts.minSats ?? 0}:${opts.minDays ?? 0}`;
    const cached = cache.get(cacheKey);
    if (cached) return { ...cached, subject, subjectKind };

    try {
        const params: Parameters<typeof check>[0] = {
            minSats: opts.minSats,
            minDays: opts.minDays,
            ...(opts.relays ? { relays: opts.relays } : {}),
        };
        if (subjectKind === 'attestation_id') params.id = subject;
        else if (subjectKind === 'address') params.addr = subject;
        else if (subjectKind === 'identity') {
            const idx = subject.indexOf(':');
            if (idx === -1) {
                const d: GateDecision = {
                    ok: false,
                    reason: 'no_subject',
                    subject,
                    subjectKind,
                };
                cache.set(cacheKey, d);
                return d;
            }
            params.identity = {
                protocol: subject.slice(0, idx),
                identifier: subject.slice(idx + 1),
            };
        }

        // Hard deadline. `check()` may call out to a relay/Esplora, and we
        // do not want the gate to hang a request indefinitely.
        const timeoutMs = opts.lookupTimeoutMs ?? DEFAULT_LOOKUP_TIMEOUT_MS;
        const result = await Promise.race([
            check(params),
            new Promise<never>((_, reject) =>
                setTimeout(() => reject(new Error('lookup_timeout')), timeoutMs)
            ),
        ]);

        let reason: GateDecision['reason'];
        if (result.ok) reason = 'ok';
        else if (result.reasons?.includes('not_found')) reason = 'not_found';
        else if (result.reasons?.some((r) => r === 'below_min_sats' || r === 'below_min_days'))
            reason = 'below_threshold';
        else reason = 'invalid_proof';

        const decision: GateDecision = {
            ok: result.ok,
            reason,
            check: result,
            subject,
            subjectKind,
        };
        cache.set(cacheKey, decision);
        return decision;
    } catch (err) {
        const decision: GateDecision = {
            ok: Boolean(opts.failOpen),
            reason: opts.failOpen ? 'fail_open' : 'lookup_error',
            subject,
            subjectKind,
        };
        // Do not cache errors — we want the next request to try again.
        if (opts.onDecision) opts.onDecision(req, decision);
        // Surface only the message, not the full stack, to avoid leaking
        // internals into caller-visible logs. Callers wanting stack traces
        // should wire `onDecision` and log `err` themselves.
        // eslint-disable-next-line no-console
        console.warn(
            '[orangecheck/gate] lookup failed:',
            err instanceof Error ? err.message : String(err)
        );
        return decision;
    }
}

/**
 * Default 403 body writer. Extracted so express.ts and next.ts don't drift.
 * Respects `opts.exposeSubject` so a cookie-sourced address never leaks back
 * into a response body that might be seen by a different caller.
 */
export function sendBlockedDefault(
    res: MinimalRes,
    decision: GateDecision,
    opts: GateOptions
): void {
    res.setHeader('Content-Type', 'application/json');
    res.status(decision.reason === 'no_subject' ? 401 : 403);
    const body: Record<string, unknown> = {
        error: 'orangecheck_gate_blocked',
        reason: decision.reason,
    };
    if (opts.exposeSubject && decision.subject) {
        body.subject = decision.subject;
        body.subjectKind = decision.subjectKind;
    }
    if (decision.check?.reasons) body.reasons = decision.check.reasons;
    res.json(body);
}
