import type { GateDecision, GateOptions, MinimalReq, SubjectSource } from './types';

import { check } from '@orangecheck/sdk';

import { TtlLru } from './cache';

const caches = new WeakMap<GateOptions, TtlLru>();

function cacheFor(opts: GateOptions): TtlLru {
    let c = caches.get(opts);
    if (!c) {
        c = new TtlLru(opts.cacheMax ?? 1_000, opts.cacheTtlMs ?? 60_000);
        caches.set(opts, c);
    }
    return c;
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

        const result = await check(params);

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
        // Surface the error for the caller's logs.
        console.warn('[orangecheck/gate] lookup failed:', err);
        return decision;
    }
}
