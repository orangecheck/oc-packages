import { useRouter } from 'next/compat/router';
import type { NextRouter } from 'next/router';
import { useSyncExternalStore } from 'react';

import { GET_AN_ACCOUNT } from '../family';

/** Back and forward; a router move re-renders the page, which reads the address again. */
function onHistory(change: () => void) {
    window.addEventListener('popstate', change);
    return () => window.removeEventListener('popstate', change);
}

/** The page's path and query, never the fragment. Anything the URL parser would read as another host returns home. */
function herePath(): string {
    const { href, origin, pathname, search } = window.location;
    const path = pathname + search;
    return new URL(path, href).origin === origin ? path : '/';
}

/** The page's whole address but the fragment, so a share link's secret stays off servers. */
function hereHref(): string {
    return window.location.href.split('#')[0]!;
}

/** The route the server renders, with the base path; none for a dynamic route, whose template is no address. */
function routePath(router: NextRouter | null): string | null {
    if (!router || router.pathname.includes('[')) return null;
    return router.basePath && router.pathname === '/' ? router.basePath : router.basePath + router.pathname;
}

/**
 * This site's sign-in page, set to return to the page the viewer is on:
 * `/signin?return_to=%2Fverify%3Fid%3D…`. The server renders the route
 * without its query, so hydration matches; the fragment is never read, so a
 * share link's secret stays off servers. Pass no path for none.
 */
export function useSignInHref(path?: string): string | undefined {
    const router = useRouter();
    const here = useSyncExternalStore(onHistory, herePath, () => routePath(router));
    if (!path) return undefined;
    return here ? `${path}?return_to=${encodeURIComponent(here)}` : path;
}

/**
 * The page the viewer is on, as a whole address without the fragment; null
 * on the server. A route change re-renders whoever reads it.
 */
export function useHereHref(): string | null {
    useRouter();
    return useSyncExternalStore(onHistory, hereHref, () => null);
}

/** `url` (a sign-in page) set to return to `here`; unchanged when there is no here. */
export function returningTo(url: string, here: string | null): string {
    if (!here) return url;
    const u = new URL(url);
    u.searchParams.set('return_to', here);
    return u.toString();
}

/**
 * The family's sign-in on ochk.io, set to return to the page the viewer is
 * on, whichever family site that is: a person who starts on ochk.io, its docs
 * or a tool finishes there, never on ochk.app. The server renders it bare and
 * the browser adds the page, so hydration matches.
 */
export function useFamilySignInHref(): string {
    return returningTo(GET_AN_ACCOUNT.href, useHereHref());
}
