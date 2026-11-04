/**
 * @orangecheck/legal — site registry.
 *
 * Maps each self-hosting site to its legal profile and token context. The
 * twelve `PROTOCOL_LINKED_SITES` deliberately do NOT host their own pages —
 * their footers link to ochk.io, and the protocol document on ochk.io is
 * authored to govern the whole non-custodial family. Three sites self-host:
 * ochk.io, which hosts that document, and the two commercial products,
 * ochk.app and vault, because each describes money flows the protocol
 * document cannot truthfully cover.
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
        host: 'ochk.app',
        product: 'ochk.app',
        productShort: 'ochk.app',
        contact: CONTACT_GENERAL,
        securityContact: CONTACT_SECURITY,
        selfHosted: true,
        // ochk.app writes its brand lowercase, as its own pages do (lead ruling, 2026-11-03).
        brand: 'orangecheck',
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
    'chat',
    'cosign',
    'btc',
    'globe',
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
