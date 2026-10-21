import { useOptionalOcSession, type OcAccount } from '@orangecheck/auth-client';

import { OCHK_APP_ACCOUNT, SessionAccountView, type SessionState } from '../chrome/tool-shell';
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
    /** Default: the session's sign-in URL on the auth host. */
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
            signInHref={signInHref ?? (signInPath ? undefined : (session?.signInUrl ?? 'https://ochk.io/signin'))}
            signInPath={signInPath}
            signInLabel={signInLabel}
            signInVariant={signInVariant}
            accountHref={accountHref}
            onSignOut={() => void session?.signOut()}
            nameFrom={nameFrom}
        />
    );
}

export { SessionAccountView };
export type { SessionState };
