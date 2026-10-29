import { useOptionalOcSession, type OcAccount } from '@orangecheck/auth-client';
import { useState } from 'react';

import { OCHK_APP_ACCOUNT, SessionAccountView, type SessionState } from '../chrome/tool-shell';
import { returningTo, useHereHref } from '../lib/sign-in';
import type { AccountMenuItem } from '../chrome/app-shell';
import { shortenMiddle } from '../format';

/*
 * The account control on any family site, read from @orangecheck/auth-client
 * (an optional peer: install it to use this entry). Inside an
 * OcSessionProvider it shows the account menu or "Sign in"; with no provider
 * there is nobody to be signed in as, so it offers sign-in.
 */

/** The name an account chose to show, never a raw did:oc. */
export function accountName(account: Pick<OcAccount, 'displayName' | 'displayIdentity'>): string {
    if (account.displayName) return account.displayName;
    const { kind, value } = account.displayIdentity;
    if (kind === 'did' || value.startsWith('did:')) return 'Your account';
    if (kind === 'email') return value;
    // An address or npub: head and tail, short enough for a header chip.
    return shortenMiddle(value, 8, 6);
}

export function SessionAccount({
    signInHref,
    signInPath,
    signInLabel,
    signInVariant,
    accountHref = OCHK_APP_ACCOUNT,
    items,
    nameFrom = 'lg',
}: {
    /** Default: the session's sign-in URL on the auth host, else ochk.io's; either returns to the page the viewer is on. */
    signInHref?: string;
    /** This site's own sign-in page (`/signin`): sign in here, in place, and return to the page the viewer is on. */
    signInPath?: string;
    signInLabel?: string;
    /** The signed-out button's look; see SessionAccountView. */
    signInVariant?: 'primary' | 'secondary';
    /** Where "Your account" goes. */
    accountHref?: string;
    /** This site's own items, above "Your account". */
    items?: (AccountMenuItem | 'separator')[];
    nameFrom?: 'sm' | 'lg';
}) {
    const session = useOptionalOcSession();
    const [signOutRefused, setSignOutRefused] = useState(false);
    // The session's sign-in, returning to the page the viewer is on now, not the one it was first read on.
    const here = useHereHref();
    const status = session?.status ?? 'anonymous';
    const state: SessionState =
        status === 'authenticated' ? 'in' : status === 'anonymous' ? 'out' : status === 'error' ? 'unknown' : 'checking';
    const account = session?.account ?? null;
    const name = account ? accountName(account) : undefined;
    // A second line only when it adds something: the address behind a chosen name.
    const detail = account?.primaryBtc && account.displayName ? shortenMiddle(account.primaryBtc, 8, 6) : undefined;
    return (
        <SessionAccountView
            state={state === 'in' && !account ? 'checking' : state}
            name={name}
            detail={detail}
            items={items}
            signInHref={signInHref ?? (signInPath || !session?.signInUrl ? undefined : returningTo(session.signInUrl, here))}
            signInPath={signInPath}
            signInLabel={signInLabel}
            signInVariant={signInVariant}
            accountHref={accountHref}
            onSignOut={() => {
                setSignOutRefused(false);
                // auth-client 2.41 answers whether the auth host ended the session; an older one only signs out.
                const signOut = session?.trySignOut ?? session?.signOut;
                void signOut?.().then((outcome: unknown) => setSignOutRefused(refused(outcome)));
            }}
            signOutRefused={signOutRefused}
            nameFrom={nameFrom}
        />
    );
}

/** True when a sign-out answered that the auth host did not end the session. */
function refused(outcome: unknown): boolean {
    return typeof outcome === 'object' && outcome !== null && (outcome as { ok?: unknown }).ok === false;
}

export { SessionAccountView };
export type { SessionState };
