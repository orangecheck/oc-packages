import type { NextApiRequest, NextApiResponse } from 'next';

import type { SessionPayload } from '@orangecheck/auth-core';

import type { SessionReader } from './session';

/**
 * The account `@orangecheck/auth-client` reads. Its `normalizeAccount` returns
 * null, and the chip shows "sign in", unless BOTH `did_oc` and `id` are present.
 */
export interface MeAccount {
    id: string;
    did_oc: string;
    /** Always null here: the JWT carries did_oc only. ochk.io/api/auth/me resolves it. */
    primary_btc: string | null;
    display_name: string | null;
    nostr_npub: string | null;
    display_identity: SessionPayload['display_identity'] | null;
    home_federation_slug: string | null;
    signing_method: SessionPayload['signing_method'] | null;
    /** A hint for the family switcher, never a security gate. */
    is_owner: boolean;
}

export type MeBody = { ok: true; account: MeAccount | null } | { ok: false; reason: string };

export function accountFromSession(session: SessionPayload, opts: { ownerHint?: boolean } = {}): MeAccount {
    return {
        id: session.sub,
        did_oc: session.did_oc,
        primary_btc: null,
        display_name: session.name ?? null,
        nostr_npub: session.npub ?? null,
        display_identity: session.display_identity ?? null,
        home_federation_slug: session.home_federation ?? null,
        signing_method: session.signing_method ?? null,
        is_owner: opts.ownerHint === false ? false : Boolean(session.is_owner),
    };
}

export interface MeHandlerOptions {
    reader: SessionReader;
    /** Pass false on a site with no owner surfaces: `is_owner` is then always false. */
    ownerHint?: boolean;
    /**
     * Another credential this site accepts when there is no session (vault's
     * `ocvt_` access tokens). Return the account, or null.
     */
    fallback?: (req: NextApiRequest) => Promise<MeAccount | null>;
    /** Runs after a signed-in response is sent (chat and cosign fire me events here). */
    after?: (session: SessionPayload, req: NextApiRequest) => void;
}

/**
 * The local `/api/auth/me`.
 *
 * Signed out answers **200 `{ ok: true, account: null }`**, as ochk.app does,
 * so an anonymous page view logs no failed request. auth-client reads a null
 * account as anonymous.
 *
 * A per-tab token that cannot be honoured still answers **401**: auth-client
 * drops a tab's pin only on a 401 and then retries on the cookie, so a 200
 * there would leave that tab signed out for good.
 */
export function createMeHandler(opts: MeHandlerOptions) {
    return async function meHandler(req: NextApiRequest, res: NextApiResponse<MeBody | { error: string }>): Promise<void> {
        // Without these a cached anonymous answer can be served to a signed-in caller.
        res.setHeader('Cache-Control', 'no-store, private');
        res.setHeader('Vary', 'Cookie, X-OC-Tab-Session');

        if (req.method !== 'GET') {
            res.setHeader('Allow', 'GET');
            res.status(405).json({ error: 'method_not_allowed' });
            return;
        }

        const r = await opts.reader.resolve(req);
        if (r.ok) {
            res.status(200).json({ ok: true, account: accountFromSession(r.session, { ownerHint: opts.ownerHint }) });
            opts.after?.(r.session, req);
            return;
        }
        if (r.tab) {
            res.status(401).json({ ok: false, reason: r.reason });
            return;
        }
        const account = opts.fallback ? await opts.fallback(req) : null;
        res.status(200).json({ ok: true, account });
    };
}
