/**
 * `oc.scope` — privacy-preserving scope grants.
 *
 * Background:
 *   By default, signing into your site via OC reveals only an anonymous
 *   per-integrator subject (`sub`). The user's master identity (BIP-322
 *   address or email) stays private; you cannot correlate users across
 *   sites via OC. To read additional fields (their email, attest tier,
 *   bitcoin address, display name), you must explicitly request the
 *   matching scope and the user must explicitly consent.
 *
 *   Full architecture: https://github.com/orangecheck/oc-me-web/blob/main/PRIVACY-ARCHITECTURE.md
 *
 * Two functions:
 *
 *   oc.scope.granted(project_key) — read what the currently-signed-in
 *   user has already granted. Returns sub + per-scope values they've
 *   consented to.
 *
 *     const { sub, scopes } = await oc.scope.granted({ project_key: 'pk_live_yourcompany' });
 *     console.log(sub);            // "sub_3K7xQ2mN1pYwB8tRvE…"
 *     console.log(scopes.email);   // "user@example.com" or undefined
 *
 *   oc.scope.request(scopes, opts) — redirect the user to me.ochk.io's
 *   consent prompt. After they grant or deny, browser returns to
 *   return_to. Subsequent oc.scope.granted() calls reflect their
 *   decisions.
 *
 *     await oc.scope.request(['email', 'attest_tier'], {
 *       project_key: 'pk_live_yourcompany',
 *       return_to: window.location.href,
 *     });
 */

import { api, getOrigin } from './transport';

/** Catalog of valid scopes · keep in sync with SCOPE_IDS in
 *  oc-me-web/src/lib/privacy/scopes.ts.
 *
 *  cross_integrator_event_count · per OCHK-V2-PLAN §7 · low-info
 *    sybil signal aggregating event count across every integrator.
 *  cross_integrator_human_event_count · per OCHK-V3-PLAN §7 · same
 *    aggregate filtered to is_agent !== true (human-fired only).
 *    Use when you want to gate on real human activity rather than
 *    bot-padded counts.
 *  trust_attestation_count · per OCHK-V3-PLAN §6 phase-2 · four-int
 *    selective-disclosure quad summarizing reputation-graph attestations.
 *    Use parseTrustAttestationCount() to decode the wire-format string. */
export type Scope =
    | 'bitcoin_address'
    | 'email'
    | 'attest_tier'
    | 'display_name'
    | 'cross_integrator_event_count'
    | 'cross_integrator_human_event_count'
    | 'trust_attestation_count';

const VALID_SCOPES: ReadonlyArray<Scope> = [
    'bitcoin_address',
    'email',
    'attest_tier',
    'display_name',
    'cross_integrator_event_count',
    'cross_integrator_human_event_count',
    'trust_attestation_count',
];

/** Decoded shape of the `trust_attestation_count` scope value. The wire
 *  format is a comma-separated quad: total,good,distinct_good_issuers,caution.
 *  Block-status counts are intentionally omitted from the disclosure
 *  surface — block flags belong to the pseudonymous-issuer side, not
 *  the subject's public score. */
export interface TrustAttestationCount {
    total: number;
    good: number;
    distinct_good_issuers: number;
    caution: number;
}

/** Decode the `trust_attestation_count` scope's wire-format string into
 *  a typed quad. Returns null if the input is malformed (defensive ·
 *  the resolver always emits well-formed strings, but third-party
 *  consumers may hand us anything). */
export function parseTrustAttestationCount(value: string): TrustAttestationCount | null {
    const parts = value.split(',');
    if (parts.length !== 4) return null;
    const ints = parts.map((p) => Number.parseInt(p, 10));
    if (ints.some((n) => !Number.isInteger(n) || n < 0)) return null;
    return {
        total: ints[0]!,
        good: ints[1]!,
        distinct_good_issuers: ints[2]!,
        caution: ints[3]!,
    };
}

export interface GrantedOptions {
    /** Your project_key. Required. */
    project_key: string;
    signal?: AbortSignal;
}

export interface GrantedResult {
    /** Per-integrator stable subject for the currently-signed-in user.
     *  This is what your backend should key user records on (NOT the
     *  master addr · which OC doesn't reveal). */
    sub: string;
    /** Scopes the user has actively granted to this project. Subset of
     *  the requested scopes, filtered for not-revoked + not-expired. */
    scopes_granted: Scope[];
    /** Resolved values for the granted scopes. Only fields whose scope
     *  is in `scopes_granted` are present. */
    scopes: Partial<Record<Scope, string>>;
}

async function granted(options: GrantedOptions): Promise<GrantedResult> {
    if (!options.project_key) {
        throw new Error('oc.scope.granted: project_key is required');
    }
    const r = await api<{ ok: boolean; sub: string; scopes_granted: Scope[]; scopes: Partial<Record<Scope, string>> }>(
        `/api/integrator/scopes/${encodeURIComponent(options.project_key)}`,
        { method: 'GET', signal: options.signal }
    );
    return {
        sub: r.sub,
        scopes_granted: r.scopes_granted,
        scopes: r.scopes,
    };
}

export interface RequestOptions {
    /** Your project_key. Required. */
    project_key: string;
    /** Where to bounce the user after they decide. Required.
     *  Same-origin only — me.ochk.io rejects cross-origin redirects to
     *  prevent the consent prompt from being weaponized in phishing. */
    return_to: string;
    /** Override the OC origin (only useful for staging deployments;
     *  defaults to https://me.ochk.io via getOrigin()). */
    origin?: string;
}

/** Redirect the user to me.ochk.io's consent prompt. After they decide,
 *  browser returns to `return_to`. The scope grants are persisted
 *  server-side; subsequent calls to oc.scope.granted() reflect their
 *  decisions.
 *
 *  This function does NOT return a promise that resolves to the user's
 *  decisions. The redirect leaves your page; the user lands back at
 *  return_to and your code re-reads granted state on mount.
 *
 *  Consent flow:
 *    1. Your code: oc.scope.request(['email'], { ... })
 *    2. Browser navigates to me.ochk.io/me/scope-grant?…
 *    3. User decides per-scope (grant once / always / deny)
 *    4. Browser redirects back to return_to
 *    5. Your code re-runs oc.scope.granted(...) on mount
 *
 *  Throws synchronously if the inputs are invalid (so the redirect is
 *  never issued with malformed params). */
export function request(scopes: Scope[], options: RequestOptions): never {
    if (!options.project_key) {
        throw new Error('oc.scope.request: project_key is required');
    }
    if (!options.return_to) {
        throw new Error('oc.scope.request: return_to is required');
    }
    if (!Array.isArray(scopes) || scopes.length === 0) {
        throw new Error('oc.scope.request: scopes must be a non-empty array');
    }
    for (const s of scopes) {
        if (!VALID_SCOPES.includes(s)) {
            throw new Error(
                `oc.scope.request: unknown scope "${s}" · valid: ${VALID_SCOPES.join(', ')}`
            );
        }
    }
    if (typeof window === 'undefined') {
        throw new Error('oc.scope.request: must be called in a browser environment');
    }
    const origin = options.origin ?? getOrigin();
    const url = new URL('/me/scope-grant', origin);
    url.searchParams.set('project_key', options.project_key);
    url.searchParams.set('scopes', scopes.join(','));
    url.searchParams.set('return_to', options.return_to);
    window.location.assign(url.toString());
    // assign() doesn't return synchronously in a way TS can encode, but
    // by the time anything else runs, navigation is in flight. Throw to
    // make the never-returning behavior explicit.
    throw new Error('oc.scope.request: redirected to consent prompt');
}

export const scope = { granted, request, parseTrustAttestationCount };
