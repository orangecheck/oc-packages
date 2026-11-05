import { useOptionalOcSession, type OcAccount } from '@orangecheck/auth-client';
import { useState } from 'react';

import { OCHK_APP_ACCOUNT, SessionAccountView, type SessionState } from '../chrome/account';
import { returningTo, useHereHref } from '../lib/sign-in';
import type { AccountMenuItem } from '../chrome/account';
import { shortenMiddle } from '../format';

/*
 * The account control on any family site, read from @orangecheck/auth-client
 * (an optional peer: install it to use this entry). Inside an
 * OcSessionProvider it shows who is signed in, with the account menu, or the
 * way in; with no provider there is nobody to be signed in as, so it offers
 * the way in.
 */

/**
 * Who is signed in, as the account control shows it: the email the session
 * shows, else the name the account chose, else its address or npub, short,
 * else a short did. Never a generic word in place of a person.
 */
export function accountName(account: Pick<OcAccount, 'displayName' | 'displayIdentity'> & { didOc?: string }): string {
    const { kind, value } = account.displayIdentity;
    if (kind === 'email' && value) return value;
    if (account.displayName) return account.displayName;
    // An address or npub: head and tail, short enough for the header.
    if (value && kind !== 'did' && !value.startsWith('did:')) return shortenMiddle(value, 8, 6);
    // did:oc:ed30f1d9…a4c2: the method and enough of the id to tell two apart.
    return shortenMiddle(value.startsWith('did:') ? value : (account.didOc ?? value), 15, 4);
}

export function SessionAccount({
    signInHref,
    signInPath,
    signInLabel,
    accountHref = OCHK_APP_ACCOUNT,
    appearance = true,
    items,
    nameFrom = 'lg',
}: {
    /** Default: the session's sign-in URL on the auth host, else ochk.io's; either returns to the page the viewer is on. */
    signInHref?: string;
    /** This site's own sign-in page (`/signin`): sign in here, in place, and return to the page the viewer is on. */
    signInPath?: string;
    signInLabel?: string;
    /** @deprecated 2.2: ignored; the way in has one look per place (see SessionAccountView). */
    signInVariant?: 'primary' | 'secondary';
    /** Where Account settings goes: ochk.app's account page; `false` when `items` hold the account page. */
    accountHref?: string | false;
    /** The Appearance item in the menu; `false` leaves it out. */
    appearance?: boolean;
    /** This site's own items, above Account settings: its own action ("Open your vault") goes here. */
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
    // A second line only when it adds something: the address behind the email or name.
    const btc = account?.primaryBtc ? shortenMiddle(account.primaryBtc, 8, 6) : undefined;
    const detail = btc && btc !== name ? btc : undefined;
    return (
        <SessionAccountView
            state={state === 'in' && !account ? 'checking' : state}
            name={name}
            detail={detail}
            items={items}
            signInHref={signInHref ?? (signInPath || !session?.signInUrl ? undefined : returningTo(session.signInUrl, here))}
            signInPath={signInPath}
            signInLabel={signInLabel}
            accountHref={accountHref}
            appearance={appearance}
            onSignOut={() => {
                setSignOutRefused(false);
                // auth-client 2.41 answers whether the auth host ended the session; an older one only signs out.
                const signOut = session?.trySignOut ?? session?.signOut;
                void signOut?.().then((outcome: unknown) => setSignOutRefused(refused(outcome)));
            }}
            signOutRefused={signOutRefused}
            // The notice has been read once the menu opens again, as design's and ui's menus drop it.
            onMenuOpenChange={(open) => {
                if (open) setSignOutRefused(false);
            }}
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
