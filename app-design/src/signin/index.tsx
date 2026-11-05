import { familyReturnTarget, OcSignIn, useOptionalOcSession, type OcSignInProps } from '@orangecheck/auth-client';
import { useEffect, useSyncExternalStore, type ReactNode } from 'react';

import { SignInFrame } from '../chrome/sign-in-frame';
import { Notice } from '../components/data';
import { protocolSite, SIGN_IN_LABEL, type ProtocolSlug } from '../family';

/*
 * A family site's whole /signin page, read from @orangecheck/auth-client (an
 * optional peer: install it to use this entry). It was a hundred lines copied
 * into every tool site, the same but for the protocol and the return path; a
 * site now passes those two. The site's own <Seo> stays in the site, given
 * signInSeo() so every tab reads the same.
 */

/** Back and forward; any other move to /signin renders the page, which reads the address again. */
function onHistory(change: () => void) {
    window.addEventListener('popstate', change);
    return () => window.removeEventListener('popstate', change);
}

const search = () => window.location.search;
// The server renders /signin without its query, as Next's router.query is empty on a prerendered page.
const noSearch = () => '';

/** "OC Lock" from "lock". */
function protocolName(slug: ProtocolSlug): string {
    return `OC ${slug[0]!.toUpperCase()}${slug.slice(1)}`;
}

/** The family's one tab title and description for a sign-in page, for the site's own <Seo>. */
export function signInSeo(site: { protocol: ProtocolSlug; description?: string } | { product: string; description: string }): {
    title: string;
    description: string;
    canonical: string;
    noindex: true;
} {
    const description =
        site.description ??
        ('protocol' in site ? `Sign in to ${protocolName(site.protocol)} with email, Google, GitHub or a Bitcoin wallet. One sign-in for every orangecheck site.` : '');
    // site-kit's Seo adds the site's name to every title, so a sign-in tab reads "Sign in | OC Lock".
    return { title: SIGN_IN_LABEL, description, canonical: '/signin', noindex: true };
}

/**
 * Where a sign-in goes when it is done, and whether it is needed at all.
 * returnTo is the page's `?return_to` when auth-client's familyReturnTarget
 * accepts it (a path on this site, or an https *.ochk.io address), else
 * `defaultReturnTo`. With `?add=1` a signed-in visitor stays, to sign in a
 * second account; otherwise one already signed in is sent to returnTo.
 */
export function useSignInReturn(defaultReturnTo: string): { returnTo: string; addMode: boolean; alreadyIn: boolean } {
    const query = new URLSearchParams(useSyncExternalStore(onHistory, search, noSearch));
    // The first value, as the site copies read router.query; add mode only for a lone add=1.
    const returnTo = familyReturnTarget(query.get('return_to')) ?? defaultReturnTo;
    const adds = query.getAll('add');
    const addMode = adds.length === 1 && adds[0] === '1';
    const status = useOptionalOcSession()?.status ?? 'loading';
    const alreadyIn = status === 'authenticated' && !addMode;
    // The notice says "heading back"; this is what makes that true.
    useEffect(() => {
        if (alreadyIn) window.location.assign(returnTo);
    }, [alreadyIn, returnTo]);
    return { returnTo, addMode, alreadyIn };
}

function AlreadySignedIn({ returnTo }: { returnTo: string }) {
    return (
        <Notice tone="success" title="You're already signed in" role="status">
            Heading back to <code className="break-all">{returnTo}</code>. If nothing happens,{' '}
            <a href={returnTo} className="underline underline-offset-4">
                continue
            </a>
            .
        </Notice>
    );
}

type SignInBrand =
    /** A tool site: home is the protocol's page on ochk.io, the audience https://<protocol>.ochk.io. */
    | { protocol: ProtocolSlug; product?: never; home?: string; audience?: string }
    /** An app on its own host (btc, cosign): its word, its home and its audience. */
    | { protocol?: never; product: string; home: string; audience: string };

export type SignInPageProps = SignInBrand & {
    /** Where a sign-in goes when the page has no `?return_to`, or one auth-client refuses. */
    defaultReturnTo: string;
    /** Default: "Sign in to OC <Protocol>", else "Sign in". */
    title?: ReactNode;
    /** Default: "One sign-in for every orangecheck site. No password." */
    lead?: ReactNode;
    fineprint?: ReactNode;
    /**
     * The link opposite the lockup. `'return'` (default): "Go back" to the
     * return target, the page the visitor came from. `'home'`: the frame's
     * Back to home. Anything else is drawn as given; `null` leaves it out.
     */
    back?: 'return' | 'home' | ReactNode;
    /** Default "Go back". */
    backLabel?: string;
    /** In place of the notice a signed-in visitor sees on the way back. */
    alreadySignedIn?: (returnTo: string) => ReactNode;
    /** Passed to OcSignIn. */
    signIn?: Pick<OcSignInProps, 'providersFirst' | 'initialPath' | 'paths'>;
    art?: ReactNode;
    caption?: ReactNode;
};

/**
 * The family's sign-in page: SignInFrame around auth-client's OcSignIn, the
 * return target checked, a second account allowed with `?add=1`, and a
 * signed-in visitor sent on. A tool site passes its protocol and where to go.
 */
export function SignInPage({
    protocol,
    product,
    home,
    audience,
    defaultReturnTo,
    title,
    lead = 'One sign-in for every orangecheck site. No password.',
    fineprint,
    back = 'return',
    backLabel,
    alreadySignedIn,
    signIn,
    art,
    caption,
}: SignInPageProps) {
    const { returnTo, alreadyIn } = useSignInReturn(defaultReturnTo);
    const to = audience ?? new URL(protocolSite(protocol!).toolHref).origin;
    const frameBack = back === 'return' ? { backTo: returnTo, backLabel } : back === 'home' ? {} : { back };
    return (
        <SignInFrame
            protocol={protocol}
            product={product}
            home={home}
            title={title ?? (protocol ? `Sign in to ${protocolName(protocol)}` : SIGN_IN_LABEL)}
            lead={lead}
            fineprint={fineprint}
            art={art}
            caption={caption}
            {...frameBack}
        >
            {alreadyIn ? (alreadySignedIn ? alreadySignedIn(returnTo) : <AlreadySignedIn returnTo={returnTo} />) : <OcSignIn audience={to} returnTo={returnTo} {...signIn} />}
        </SignInFrame>
    );
}
