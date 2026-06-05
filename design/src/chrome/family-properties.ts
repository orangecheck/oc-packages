/**
 * Family-property registry — the single source of truth for every
 * orangecheck-family site. Both `<OcLogoDropdown>` (the global logo →
 * property switcher) and `<OcAccountMenu>` (the global signed-in
 * account chip) read from this table, so a one-line edit here ripples
 * to every consumer simultaneously.
 *
 * Adding a new family member means appending one entry below. Removing
 * one means deleting the entry. There are no other call sites to chase.
 */

import type { EcosystemSlug } from './ecosystem-switcher';

export type FamilyCategory = 'hub' | 'product' | 'protocol' | 'owner';

export interface FamilyProperty {
    /** Stable URL-safe identifier (e.g. `'vault'`). */
    slug: EcosystemSlug;
    /** Absolute origin (e.g. `'https://vault.ochk.io'`). */
    origin: string;
    /** Bare hostname (e.g. `'vault.ochk.io'`). Used in account-menu headers. */
    hostname: string;
    /** Wordmark label (e.g. `'oc·vault'`). */
    label: string;
    /** Short tagline (verb — what-it-does), shown under the wordmark in the menu. */
    sub: string;
    /** Docs deep-link (e.g. `'https://docs.ochk.io/vault'`). */
    docsHref: string;
    /** Family-level category that shapes the visual chip + menu sectioning. */
    category: FamilyCategory;
}

export const FAMILY_PROPERTIES: ReadonlyArray<FamilyProperty> = [
    {
        slug: 'home',
        origin: 'https://ochk.io',
        hostname: 'ochk.io',
        label: 'orangecheck',
        sub: 'umbrella · sign-in',
        docsHref: 'https://docs.ochk.io',
        category: 'hub',
    },
    {
        slug: 'docs',
        origin: 'https://docs.ochk.io',
        hostname: 'docs.ochk.io',
        label: 'oc·docs',
        sub: 'unified reference',
        docsHref: 'https://docs.ochk.io',
        category: 'hub',
    },
    {
        slug: 'me',
        origin: 'https://me.ochk.io',
        hostname: 'me.ochk.io',
        label: 'oc·me',
        sub: 'earn — consumer identity',
        docsHref: 'https://docs.ochk.io/me',
        category: 'product',
    },
    {
        slug: 'vault',
        origin: 'https://vault.ochk.io',
        hostname: 'vault.ochk.io',
        label: 'oc·vault',
        sub: 'keep — encrypted secrets',
        docsHref: 'https://docs.ochk.io/vault',
        category: 'product',
    },
    {
        slug: 'chat',
        origin: 'https://chat.ochk.io',
        hostname: 'chat.ochk.io',
        label: 'oc·chat',
        sub: 'message — encrypted chat',
        docsHref: 'https://docs.ochk.io/chat',
        category: 'product',
    },
    {
        slug: 'fleet',
        origin: 'https://fleet.ochk.io',
        hostname: 'fleet.ochk.io',
        label: 'oc·fleet',
        sub: 'managed — agent fleet',
        docsHref: 'https://docs.ochk.io/fleet',
        category: 'product',
    },
    {
        slug: 'attest',
        origin: 'https://attest.ochk.io',
        hostname: 'attest.ochk.io',
        label: 'oc·attest',
        sub: 'am — sybil resistance',
        docsHref: 'https://docs.ochk.io/attest',
        category: 'protocol',
    },
    {
        slug: 'lock',
        origin: 'https://lock.ochk.io',
        hostname: 'lock.ochk.io',
        label: 'oc·lock',
        sub: 'whisper — encryption',
        docsHref: 'https://docs.ochk.io/lock',
        category: 'protocol',
    },
    {
        slug: 'vote',
        origin: 'https://vote.ochk.io',
        hostname: 'vote.ochk.io',
        label: 'oc·vote',
        sub: 'decide — polls',
        docsHref: 'https://docs.ochk.io/vote',
        category: 'protocol',
    },
    {
        slug: 'stamp',
        origin: 'https://stamp.ochk.io',
        hostname: 'stamp.ochk.io',
        label: 'oc·stamp',
        sub: 'declare — block-anchored',
        docsHref: 'https://docs.ochk.io/stamp',
        category: 'protocol',
    },
    {
        slug: 'agent',
        origin: 'https://agent.ochk.io',
        hostname: 'agent.ochk.io',
        label: 'oc·agent',
        sub: 'delegate — scoped auth',
        docsHref: 'https://docs.ochk.io/agent',
        category: 'protocol',
    },
    {
        slug: 'pledge',
        origin: 'https://pledge.ochk.io',
        hostname: 'pledge.ochk.io',
        label: 'oc·pledge',
        sub: 'swear — bonded commitment',
        docsHref: 'https://docs.ochk.io/pledge',
        category: 'protocol',
    },
    {
        slug: 'analytics',
        origin: 'https://analytics.ochk.io',
        hostname: 'analytics.ochk.io',
        label: 'oc·analytics',
        sub: 'owner cockpit',
        docsHref: 'https://analytics.ochk.io',
        category: 'owner',
    },
    {
        slug: 'bot',
        origin: 'https://bot.ochk.io',
        hostname: 'bot.ochk.io',
        label: 'oc·bot',
        sub: 'social bot',
        docsHref: 'https://bot.ochk.io',
        category: 'owner',
    },
    {
        slug: 'forge',
        origin: 'https://forge.ochk.io',
        hostname: 'forge.ochk.io',
        label: 'oc·forge',
        sub: 'agent ops',
        docsHref: 'https://forge.ochk.io',
        category: 'owner',
    },
];

/**
 * Canonical lifecycle states for any family site. Used by both the
 * tiny chip rendered next to the wordmark and any other surface that
 * wants to display "this site is still settling" UX. Centralised
 * vocabulary so we can't accidentally drift to a parallel synonym
 * like `preview`/`experimental` on different sites.
 *
 *   - `live`     — production-ready; **no chip rendered** (the absence
 *                  of a chip is the affordance)
 *   - `beta`     — feature-complete but still iterating, soft launch
 *   - `alpha`    — early, breaking changes expected, integrators beware
 */
export type SiteState = 'alpha' | 'beta' | 'live';

export const SITE_STATE_LABEL: Record<Exclude<SiteState, 'live'>, string> = {
    alpha: 'alpha',
    beta: 'beta',
};

/** Find a property entry by its slug. */
export function findFamilyProperty(slug: EcosystemSlug): FamilyProperty | undefined {
    return FAMILY_PROPERTIES.find((p) => p.slug === slug);
}
