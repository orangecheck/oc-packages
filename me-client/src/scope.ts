/**
 * `oc.scope` — privacy-preserving scope grants.
 *
 * Background:
 *   Signing in gives your site the person's orangecheck id (`did_oc`),
 *   which is the same on every site, and events carry a per-project
 *   subject (`sub`). Their Bitcoin address and email stay private. To read
 *   additional fields (their email, their Bitcoin address, or one of the
 *   counts below), you must explicitly request the matching scope and the
 *   user must explicitly consent.
 *
 *   Guide: https://ochk.io/docs/me/sdk
 *
 * Two functions:
 *
 *   oc.scope.granted(options) — read what a person has already granted
 *   your project. Returns sub + per-scope values they've consented to.
 *   Call it from your backend, naming the person and signing with your
 *   project's secret:
 *
 *     const { sub, scopes } = await oc.scope.granted({
 *       project_key: 'pk_live_yourcompany',
 *       accountId: session.did_oc,
 *       signingSecret: process.env.OC_SIGNING_SECRET,
 *     });
 *     console.log(sub);            // "sub_3K7xQ2mN1pYwB8tRvE…"
 *     console.log(scopes.email);   // "user@example.com" or undefined
 *
 *   oc.scope.request(scopes, opts) — send the user to ochk.app's
 *   consent page. After they grant or deny, browser returns to
 *   return_to. Subsequent oc.scope.granted() calls reflect their
 *   decisions.
 *
 *     await oc.scope.request(['email', 'bitcoin_address'], {
 *       project_key: 'pk_live_yourcompany',
 *       return_to: window.location.href,
 *     });
 */

import { isDidOc } from '@orangecheck/auth-core/identifiers';

import { signBody } from './event';
import { api } from './transport';

/** Where people decide what to share. The API stays on me.ochk.io; its
 *  pages moved to ochk.app, so setOrigin() does not move this. */
const CONSENT_ORIGIN = 'https://ochk.app';

/** Every scope me.ochk.io knows: the same ids, in the same order, as SCOPE_IDS
 *  in oc-me-web/src/lib/privacy/scopes.ts, whose test fails when the two
 *  differ. `oc.scope.request` refuses any other id. Every value arrives as a
 *  string. The quoted words are what ochk.app's consent page tells the person.
 *
 *  cross_integrator_event_count · per OCHK-V2-PLAN §7 · low-info
 *    sybil signal aggregating event count across every integrator.
 *  cross_integrator_human_event_count · per OCHK-V3-PLAN §7 · same
 *    aggregate filtered to is_agent !== true (human-fired only).
 *    Use when you want to gate on real human activity rather than
 *    bot-padded counts.
 *  cross_integrator_lifetime_sats · "your total earned": "one number: the sats
 *    apps have paid you, added up across every app. Not which apps paid, how
 *    much each, or when."
 *  cross_integrator_distinct_count · "how many apps you use": "one number: how
 *    many different apps have recorded events for you. No names."
 *  cross_integrator_oldest_event_at · "how long you have been active": "the
 *    date and time of your first recorded event in any app. Not which app, and
 *    nothing else." An ISO 8601 time, or "" before the first event.
 *  cross_integrator_active_days · "how often you are active": "one number: on
 *    how many different days you have done something in any app. Not which
 *    days or which apps."
 *  trust_attestation_count · per OCHK-V3-PLAN §6 phase-2 · four-int
 *    selective-disclosure quad summarizing reputation-graph attestations.
 *    Use parseTrustAttestationCount() to decode the wire-format string.
 *  trust_attestations_bundle · "your statements": "the statements other apps
 *    have made about you, each one in full: which app made it, what it says
 *    and when it ends. You choose which ones in Apps." A JSON array of
 *    envelope ids: fetch each from /api/envelope/<id> and verify it.
 *
 *  attest_tier · deprecated: "backing (old form)". ochk.app no longer asks
 *    for it, so a request for it asks the person nothing; a backed account
 *    tells your site what backs it at sign-in. Old grants still resolve.
 *  display_name · deprecated: it shares nothing, and signing in gives your
 *    site no name either. ochk.app no longer offers it; asking for it still
 *    works, and it never appears in `scopes`. */
export const SCOPE_IDS = Object.freeze([
    'bitcoin_address',
    'email',
    'attest_tier',
    'display_name',
    'cross_integrator_event_count',
    'cross_integrator_human_event_count',
    'cross_integrator_lifetime_sats',
    'cross_integrator_distinct_count',
    'cross_integrator_oldest_event_at',
    'cross_integrator_active_days',
    'trust_attestation_count',
    'trust_attestations_bundle',
] as const);

export type Scope = (typeof SCOPE_IDS)[number];

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
    /** Who to ask about: their did:oc, as `event.fire`'s `accountId`. Needs
     *  `signingSecret`. Without both, the call reads the session the request
     *  carries, which only ochk.app's own pages have: a browser on your site
     *  sends no session me.ochk.io accepts. */
    accountId?: string;
    /** The project's signing secret, which signs the question so it is your
     *  project asking. SERVER-SIDE ONLY: never ship it to a browser. */
    signingSecret?: string;
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
    const { accountId, signingSecret } = options;
    if (accountId !== undefined && !signingSecret) {
        throw new Error('oc.scope.granted: accountId names the person, so it requires signingSecret');
    }
    if (signingSecret && accountId === undefined) {
        throw new Error('oc.scope.granted: signingSecret signs a question about one person, so it requires accountId');
    }
    if (accountId !== undefined && !isDidOc(accountId)) {
        throw new Error('oc.scope.granted: accountId must be a did:oc exactly as issued (did:oc: and 32 lowercase hex)');
    }
    let path = `/api/integrator/scopes/${encodeURIComponent(options.project_key)}`;
    const headers: Record<string, string> = {};
    if (accountId !== undefined && signingSecret) {
        path += `?user=${encodeURIComponent(accountId)}`;
        // The route signs these two values in this order, not the URL.
        headers['x-oc-signature'] = await signBody(
            signingSecret,
            `project_key=${options.project_key}&user=${accountId}`
        );
    }
    const r = await api<{ ok: boolean; sub: string; scopes_granted: Scope[]; scopes: Partial<Record<Scope, string>> }>(
        path,
        { method: 'GET', signal: options.signal, headers }
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
     *  An https URL on your project's domain, or a subdomain of it once
     *  the domain is verified. Anything else lands the user on ochk.app,
     *  so the consent page cannot send people somewhere you don't own. */
    return_to: string;
    /** Override the consent page's origin (staging only). Defaults to
     *  https://ochk.app. */
    origin?: string;
}

/** Redirect the user to ochk.app's consent page. After they decide,
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
 *    2. Browser navigates to ochk.app/me/scope-grant?…
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
        if (!SCOPE_IDS.includes(s)) {
            throw new Error(
                `oc.scope.request: unknown scope "${s}" · valid: ${SCOPE_IDS.join(', ')}`
            );
        }
    }
    if (typeof window === 'undefined') {
        throw new Error('oc.scope.request: must be called in a browser environment');
    }
    const origin = options.origin ?? CONSENT_ORIGIN;
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
