import { hasPrivateScopes } from './private-scope.js';
import { isSubScope, parseScope } from './scope.js';
import type { ScopesEncryptedEnvelope } from './types.js';

/**
 * The minimum an adapter needs to make the authorization decision. Kept
 * structural rather than importing `Delegation` so `stampX` helpers can accept
 * the narrower shapes they already declare.
 */
export interface ScopeBearingDelegation {
    scopes?: string[];
    scopes_encrypted?: ScopesEncryptedEnvelope;
}

/** Distinguishes the three reasons a stamp can be refused. */
export class ScopeNotGrantedError extends Error {
    readonly reason: 'not_subscope' | 'scopes_encrypted' | 'no_scopes';
    constructor(reason: ScopeNotGrantedError['reason'], message: string) {
        super(message);
        this.name = 'ScopeNotGrantedError';
        this.reason = reason;
    }
}

/**
 * Refuse unless `scopeExercised` is a sub-scope of something the delegation
 * actually grants. Every `agent-*` adapter's pre-flight check routes here.
 *
 * The check itself is unchanged and still fails closed. What this adds is
 * telling the caller WHICH of three things went wrong, because the five
 * adapters each open-coded `(delegation.scopes ?? []).map(parseScope)` and so
 * reported all three as the same thing:
 *
 * - **not_subscope** — scopes are readable and this one is not among them.
 *   The integrator's own mistake, and the only case the old message fit.
 * - **scopes_encrypted** — v1.2 private mode. `scopes` is absent *because it
 *   is sealed to a device key*, so the adapter cannot evaluate the request at
 *   all. `?? []` collapsed this into "not a sub-scope of any granted scope",
 *   which sends the integrator to audit a scope string that may well be
 *   correct, when what they need is `decryptPrivateScopes` and to pass the
 *   recovered list. Refusing is right; misnaming why is not.
 * - **no_scopes** — neither field present. A delegation granting nothing.
 *
 * Fail-closed is not a judgement call here: an over-broad stamp is a signed,
 * content-addressed authorization artifact that a verifier will accept.
 */
export function assertScopeGranted(
    delegation: ScopeBearingDelegation,
    scopeExercised: string,
    fnName: string
): void {
    if (hasPrivateScopes(delegation)) {
        throw new ScopeNotGrantedError(
            'scopes_encrypted',
            `${fnName}: this delegation uses v1.2 private scopes — \`scopes_encrypted\` is ` +
                `set and \`scopes\` is absent, so the granted set cannot be read here. ` +
                `Decrypt it with decryptPrivateScopes() using a matching device key and pass ` +
                `the recovered scopes as \`delegation.scopes\`. Refusing to stamp ` +
                `\`${scopeExercised}\` against an unreadable grant.`
        );
    }

    const scopes = delegation.scopes;
    if (scopes === undefined || scopes.length === 0) {
        throw new ScopeNotGrantedError(
            'no_scopes',
            `${fnName}: delegation grants no scopes, so \`${scopeExercised}\` cannot be ` +
                `exercised. An absent or empty \`scopes\` means nothing is granted, never everything.`
        );
    }

    const exercised = parseScope(scopeExercised);
    if (!scopes.map(parseScope).some((g) => isSubScope(exercised, g))) {
        throw new ScopeNotGrantedError(
            'not_subscope',
            `${fnName}: scope_exercised (${scopeExercised}) is not a sub-scope of any granted ` +
                `scope (${scopes.join(', ')})`
        );
    }
}
