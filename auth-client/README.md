# `@orangecheck/auth-client`

> **Full reference:** [docs.ochk.io/sdk/auth-client](https://docs.ochk.io/sdk/auth-client) — auto-generated from the TypeScript source on every release.
> Hand-written prose below is the high-level overview; the docs site is the source of truth for every export, type, and signature.


**React bindings for the cross-subdomain oc_session.**

Drop a provider near your app root, then consume the signed-in identity
from any subdomain in the `.ochk.io` ecosystem via hooks or a prebuilt
sign-in button.

Pairs with [`@orangecheck/auth-core`](../auth-core) on the server side.

> **Which integration pathway is this?** This package is for letting
> OrangeCheck *be* your sign-in. If you already run your own login
> (Google, Auth0, Clerk, NextAuth, …) and just want to add a `did:oc`
> to your users, you don't need this package — see
> [OrangeCheck Connect](https://docs.ochk.io/connect). Both pathways are
> compared at [docs.ochk.io/integration](https://docs.ochk.io/integration).

## Install

```bash
yarn add @orangecheck/auth-client @orangecheck/auth-core
```

## Mount the provider

```tsx
// app root (e.g. pages/_app.tsx)
import { OcSessionProvider } from '@orangecheck/auth-client';

export default function App({ Component, pageProps }) {
    return (
        <OcSessionProvider
            config={{
                authOrigin: 'https://ochk.io', // the subdomain that owns sign-in
            }}
        >
            <Component {...pageProps} />
        </OcSessionProvider>
    );
}
```

The provider hits `GET /api/auth/me` (same origin) to load the current
session. Your app is responsible for implementing that endpoint using
`@orangecheck/auth-core`'s `verifySessionToken()`.

## Read the session

```tsx
import { useOcSession } from '@orangecheck/auth-client';

function Header() {
    const { status, account, signOut } = useOcSession();

    if (status === 'loading') return null;
    if (status === 'anonymous') return <a href="/signin">sign in</a>;

    return (
        <>
            <span>{account!.address}</span>
            <button onClick={() => signOut()}>sign out</button>
        </>
    );
}
```

## Drop-in components

```tsx
import { OcSignInButton, OcAccountPill } from '@orangecheck/auth-client';

// Shows a sign-in link when anonymous, nothing when signed in.
<OcSignInButton className="font-mono text-xs uppercase" />

// Shows the signed-in address pill; nothing when anonymous.
<OcAccountPill dashboardUrl="https://attest.ochk.io/dashboard" />
```

Both components use CSS classes from the caller — no enforced styling,
so they work with Tailwind, vanilla CSS, or whatever.

## API

```ts
OcSessionProvider({ children, config?, defaultReturnTo? })

useOcSession(): {
    status: 'loading' | 'authenticated' | 'anonymous' | 'error';
    account: OcAccount | null;
    error: Error | null;
    refresh(): Promise<void>;
    signOut(): Promise<void>;
    signInUrl: string;
}

useOptionalOcSession(): OcSessionState | null   // no-throw variant

<OcSignInButton label? eager? ...anchorProps />
<OcAccountPill dashboardUrl? render? ...divProps />
```

## License

MIT.
