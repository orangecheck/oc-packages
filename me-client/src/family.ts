/**
 * `oc.family` — cross-family scope grants.
 *
 * Per OCHK-V3-PLAN §10 phase-1. The OrangeCheck family is one auth host
 * (ochk.io) and a set of sibling products (vote.ochk.io, stamp.ochk.io,
 * agent.ochk.io, attest.ochk.io, lock.ochk.io). When a user grants a
 * cross-family scope to a sibling, that grant is stored on me.ochk.io
 * under a reserved `family:<verb>` project_key.
 *
 * Sibling-side surfaces use `oc.family.scopes('oc-vote')` to consult
 * the active grants the user has issued for their product. The helper
 * is structurally identical to `oc.scope.granted({ project_key })`
 * except that the project_key is implied from the verb.
 *
 *   const { sub, scopes } = await oc.family.scopes('oc-vote');
 *   if (scopes.cross_integrator_human_event_count) {
 *     gateBallot(parseInt(scopes.cross_integrator_human_event_count, 10));
 *   }
 *
 * Auth: the user's `oc_session` cookie (Domain=.ochk.io) carries
 * authenticate-once-anywhere across the family. The fetch goes against
 * the me.ochk.io origin with credentials.
 *
 * Same auto-renew behavior as the integrator-side `oc.scope.granted`:
 * a sibling consulting cross-family scopes counts as use, so a granting
 * user who interacts with a sibling regularly won't see their grant
 * expire from under them (per V3-PLAN §5).
 */

import type { Scope } from './scope';

export type FamilyVerb = 'oc-vote' | 'oc-stamp' | 'oc-agent' | 'oc-attest' | 'oc-lock';

const VALID_VERBS: ReadonlyArray<FamilyVerb> = [
    'oc-vote',
    'oc-stamp',
    'oc-agent',
    'oc-attest',
    'oc-lock',
];

export interface FamilyScopesOptions {
    /** Override the OC family origin · only useful for staging.
     *  Defaults to https://me.ochk.io · the family-side scope reads
     *  always go to me.ochk regardless of which sibling is calling. */
    origin?: string;
    signal?: AbortSignal;
}

export interface FamilyScopesResult {
    /** Per-sibling stable subject for the currently-signed-in user.
     *  Anonymous · derived from master_addr + the family:<verb>
     *  project_key. Sibling backends key on this. */
    sub: string;
    /** Sibling product the grants are scoped to (echoed for logging /
     *  debug). */
    family_product: {
        verb: FamilyVerb;
        name: string;
        origin: string;
    };
    /** Scopes the user has actively granted to this sibling. Subset of
     *  the requested set, filtered for not-revoked + not-expired. */
    scopes_granted: Scope[];
    /** Resolved values for the granted scopes. Only fields whose scope
     *  is in `scopes_granted` are present. */
    scopes: Partial<Record<Scope, string>>;
}

/**
 * Read the cross-family scope grants the user has issued to the named
 * sibling product. Browser-side · uses cookie credentials.
 *
 * Errors thrown:
 *   - `unknown_family_verb` if `verb` is not in the family allowlist
 *   - `sign in required` (401) if no oc_session cookie present
 *   - `unknown_family_verb` (404) if me.ochk doesn't recognize the verb
 *
 * If you need to drive a consent prompt for a verb the user hasn't
 * granted yet, use `oc.scope.request(scopes, { project_key:
 * 'family:<verb>', return_to })` — the consent prompt page detects the
 * `family:` prefix and renders the sibling-product chrome.
 */
async function scopes(verb: FamilyVerb, options?: FamilyScopesOptions): Promise<FamilyScopesResult> {
    if (!VALID_VERBS.includes(verb)) {
        throw new Error(
            `oc.family.scopes: unknown verb "${verb}" · valid: ${VALID_VERBS.join(', ')}`
        );
    }
    const origin = options?.origin ?? 'https://me.ochk.io';
    const url = `${origin}/api/family/scopes/${encodeURIComponent(verb)}`;
    const res = await fetch(url, {
        method: 'GET',
        credentials: 'include',
        signal: options?.signal,
    });
    if (!res.ok) {
        const txt = await res.text().catch(() => '');
        throw new Error(`oc.family.scopes: ${res.status} ${txt || res.statusText}`);
    }
    const json = (await res.json()) as FamilyScopesResult & { ok?: boolean };
    return {
        sub: json.sub,
        family_product: json.family_product,
        scopes_granted: json.scopes_granted,
        scopes: json.scopes,
    };
}

export const family = { scopes };
