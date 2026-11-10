/**
 * A next.config rewrite to another origin sends the visitor's request on to it, and under next start
 * the request's cookie, authorization and x-oc-tab-session go with it. A family site rewrites only
 * to paths of its own; a page view goes through `./analytics-event`'s route, never a rewrite.
 *
 *   // a site's test
 *   import nextConfig from '../../next.config';
 *   expect(await externalRewrites(nextConfig)).toEqual([]);
 */

export interface RewriteRule {
    source: string;
    destination: string;
}

type RewriteList =
    | RewriteRule[]
    | { beforeFiles?: RewriteRule[]; afterFiles?: RewriteRule[]; fallback?: RewriteRule[] };

/** A destination that stays on the site: a path, never a URL, `//host` or `/\host`. */
export function isSitePath(destination: string): boolean {
    return /^\/(?![/\\])/.test(destination);
}

/** Every rewrite in the config, from every phase, whose destination is not a path on the site. */
export async function externalRewrites(config: {
    rewrites?: () => RewriteList | Promise<RewriteList>;
}): Promise<RewriteRule[]> {
    // A config exported as `(phase) => ({...})` has no rewrites of its own to read: call it first.
    if (typeof config === 'function') throw new TypeError('externalRewrites takes the config object, not a function');
    const listed = config.rewrites ? await config.rewrites() : [];
    const all = Array.isArray(listed)
        ? listed
        : [...(listed.beforeFiles ?? []), ...(listed.afterFiles ?? []), ...(listed.fallback ?? [])];
    return all.filter((r) => !isSitePath(r.destination));
}
