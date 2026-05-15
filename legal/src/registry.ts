/**
 * @orangecheck/legal — site registry.
 *
 * Maps each consuming site to its legal profile and token context. The nine
 * `protocol`-profile sites (ochk.io umbrella, six verb sites, docs, analytics)
 * deliberately do NOT host their own pages — their footers link to ochk.io,
 * and the protocol document on ochk.io is authored to govern the whole
 * non-custodial family. Only the three commercial products self-host, because
 * each describes money flows the protocol document cannot truthfully cover.
 */

import type { SiteContext } from './types';
import { CONTACT_GENERAL, CONTACT_SECURITY } from './constants';

export const LEGAL_SITES: Record<string, SiteContext> = {
    www: {
        slug: 'www',
        profile: 'protocol',
        host: 'ochk.io',
        product: 'OrangeCheck',
        productShort: 'OrangeCheck',
        contact: CONTACT_GENERAL,
        securityContact: CONTACT_SECURITY,
        selfHosted: true,
    },
    me: {
        slug: 'me',
        profile: 'me',
        host: 'me.ochk.io',
        product: 'me.ochk.io',
        productShort: 'me.ochk.io',
        contact: CONTACT_GENERAL,
        securityContact: CONTACT_SECURITY,
        selfHosted: true,
    },
    vault: {
        slug: 'vault',
        profile: 'vault',
        host: 'vault.ochk.io',
        product: 'OC Vault',
        productShort: 'Vault',
        contact: CONTACT_GENERAL,
        securityContact: CONTACT_SECURITY,
        selfHosted: true,
    },
    fleet: {
        slug: 'fleet',
        profile: 'fleet',
        host: 'fleet.ochk.io',
        product: 'OrangeCheck Fleet',
        productShort: 'Fleet',
        contact: CONTACT_GENERAL,
        securityContact: CONTACT_SECURITY,
        selfHosted: true,
    },
};

/** Sites that share the protocol document hosted on ochk.io (no own pages). */
export const PROTOCOL_LINKED_SITES = [
    'attest',
    'lock',
    'vote',
    'stamp',
    'agent',
    'pledge',
    'docs',
    'analytics',
] as const;

export function getSiteContext(slug: string): SiteContext {
    const ctx = LEGAL_SITES[slug];
    if (!ctx) {
        throw new Error(
            `@orangecheck/legal: unknown site "${slug}". ` +
                `Known self-hosting sites: ${Object.keys(LEGAL_SITES).join(', ')}.`,
        );
    }
    return ctx;
}

/**
 * Resolve the footer href for a legal document on a given site.
 *
 * Self-hosting sites get a local path (`/terms`); every other site points at
 * the canonical protocol document on ochk.io. One helper, so no site ever
 * hand-rolls a legal link again.
 */
export function legalHref(siteSlug: string, kind: 'terms' | 'privacy' | 'security'): string {
    const ctx = LEGAL_SITES[siteSlug];
    if (ctx?.selfHosted) return `/${kind}`;
    return `https://ochk.io/${kind}`;
}
