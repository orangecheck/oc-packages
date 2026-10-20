/*
 * The orangecheck family as data: every public site, its one line, its group
 * and its status. The family menu, the footer, the protocol grid and the app
 * grid all read it, so a site is added, renamed or retired here and nowhere
 * else. No React: OG renderers and server code import it too.
 *
 * Status is written here until the claims source exists; then it is read
 * from there. "live" shows no badge.
 */
import type { FooterColumn, NavItem } from '../lib/nav';

/** The six protocols, in the family's fixed order. */
export type ProtocolSlug = 'attest' | 'lock' | 'vote' | 'stamp' | 'agent' | 'pledge';

/** The same slugs as the classic system's, so a site's `current` carries over. */
export type FamilySlug =
    | 'home'
    | 'me'
    | 'docs'
    | ProtocolSlug
    | 'vault'
    | 'chat'
    | 'cosign'
    | 'me-demo'
    | 'globe'
    | 'btc';

export type FamilyGroup = 'orangecheck' | 'protocol' | 'app' | 'public-good';

/** Where a site or feature stands, in the family's words. */
export type SiteStatus = 'live' | 'testing' | 'not-yet' | 'paused';

export interface FamilySite {
    slug: FamilySlug;
    /** The site's word, lowercase, as menus and lockups show it. */
    label: string;
    /** Where the family menu and footer send people. A protocol's is its page on ochk.io. */
    href: string;
    group: FamilyGroup;
    /** What it is, in one sentence. */
    line: string;
    status: SiteStatus;
    /** For an app: the protocols it shows. */
    protocols?: ProtocolSlug[];
}

export interface ProtocolSite extends FamilySite {
    slug: ProtocolSlug;
    group: 'protocol';
    /** What it carries: identity, confidentiality, legitimacy, provenance, authority, commitment. */
    verb: string;
    /** The protocol's page on ochk.io. */
    pageHref: string;
    /** The tools, on the protocol's own host. */
    toolHref: string;
    /** The normative spec. */
    specHref: string;
    /** The Nostr event kinds it publishes. */
    kinds: string;
}

export const OCHK_IO = 'https://ochk.io';
/** Docs move to ochk.io/docs; docs.ochk.io then 308s there, so this link keeps working. */
export const DOCS_HREF = 'https://docs.ochk.io';

function protocol(
    slug: ProtocolSlug,
    verb: string,
    line: string,
    kinds: string
): ProtocolSite {
    return {
        slug,
        label: slug,
        href: `${OCHK_IO}/${slug}`,
        group: 'protocol',
        line,
        status: 'live',
        verb,
        pageHref: `${OCHK_IO}/${slug}`,
        toolHref: `https://${slug}.ochk.io`,
        specHref: `https://github.com/orangecheck/oc-${slug}-protocol`,
        kinds,
    };
}

/** Attest · Lock · Vote · Stamp · Agent · Pledge, everywhere. */
export const PROTOCOLS: readonly ProtocolSite[] = [
    protocol('attest', 'identity', 'Show that an address holds bitcoin, and for how long.', '30078'),
    protocol('lock', 'confidentiality', 'Encrypt to a Bitcoin address, so only its holder can open it.', '30078'),
    protocol('vote', 'legitimacy', 'Polls weighed in sats, that anyone can tally.', '30080–30082'),
    protocol('stamp', 'provenance', 'Prove who signed something, and when.', '30083'),
    protocol('agent', 'authority', 'Give software scoped, revocable permission to act for you.', '30083–30086'),
    protocol('pledge', 'commitment', 'Make a promise with bitcoin behind it, on a public record.', '30078'),
];

export const PROTOCOL_ORDER: readonly ProtocolSlug[] = PROTOCOLS.map((p) => p.slug);

export const FAMILY: readonly FamilySite[] = [
    {
        slug: 'home',
        label: 'ochk.io',
        href: OCHK_IO,
        group: 'orangecheck',
        line: 'The open protocols, and the company behind them.',
        status: 'live',
    },
    {
        slug: 'me',
        label: 'ochk.app',
        href: 'https://ochk.app',
        group: 'orangecheck',
        line: 'One account, with Bitcoin behind it.',
        status: 'testing',
    },
    {
        slug: 'docs',
        label: 'docs',
        href: DOCS_HREF,
        group: 'orangecheck',
        line: 'Specs, SDKs and guides for every protocol.',
        status: 'live',
    },
    ...PROTOCOLS,
    {
        slug: 'vault',
        label: 'vault',
        href: 'https://vault.ochk.io',
        group: 'app',
        line: 'A password manager, encrypted in your browser.',
        status: 'live',
        protocols: ['lock'],
    },
    {
        slug: 'chat',
        label: 'chat',
        href: 'https://chat.ochk.io',
        group: 'app',
        line: 'Messages only the holder of a Bitcoin address can read.',
        status: 'testing',
        protocols: ['lock'],
    },
    {
        slug: 'cosign',
        label: 'cosign',
        href: 'https://cosign.ochk.io',
        group: 'app',
        line: 'Builders find co-founders and backers.',
        status: 'testing',
        protocols: ['attest'],
    },
    {
        slug: 'me-demo',
        label: 'lumen notes',
        href: 'https://me-demo.ochk.io',
        group: 'app',
        line: 'A made-up app that signs in with orangecheck.',
        status: 'live',
    },
    {
        slug: 'globe',
        label: 'globe',
        href: 'https://globe.ochk.io',
        group: 'public-good',
        line: 'The Bitcoin network, live, on a globe.',
        status: 'live',
    },
    {
        slug: 'btc',
        label: 'btc',
        href: 'https://btc.ochk.io',
        group: 'public-good',
        line: 'A free desk for reading the Bitcoin market.',
        status: 'live',
    },
];

export const FAMILY_GROUPS: readonly { id: FamilyGroup; label: string }[] = [
    { id: 'orangecheck', label: 'orangecheck' },
    { id: 'protocol', label: 'Protocols' },
    { id: 'app', label: 'Apps' },
    { id: 'public-good', label: 'Public goods' },
];

const BY_SLUG = new Map(FAMILY.map((s) => [s.slug, s]));

export function familySite(slug: FamilySlug): FamilySite {
    return BY_SLUG.get(slug)!;
}

export function protocolSite(slug: ProtocolSlug): ProtocolSite {
    return BY_SLUG.get(slug) as ProtocolSite;
}

/** The family in its groups, in order, for menus and footers. */
export function familyByGroup(): { id: FamilyGroup; label: string; sites: FamilySite[] }[] {
    return FAMILY_GROUPS.map((g) => ({ ...g, sites: FAMILY.filter((s) => s.group === g.id) }));
}

/** One fixed row on every footer, all on ochk.io. */
export const LEGAL_LINKS: readonly NavItem[] = [
    { href: `${OCHK_IO}/privacy`, label: 'Privacy' },
    { href: `${OCHK_IO}/terms`, label: 'Terms' },
    { href: `${OCHK_IO}/security`, label: 'Security' },
    { href: `${OCHK_IO}/trademark`, label: 'Trademarks' },
    { href: `${OCHK_IO}/contact`, label: 'Contact' },
];

/**
 * ochk.io's header navigation. oc-www and the docs (served under ochk.io/docs)
 * both draw it from here, so the two cannot drift. Absolute links work from
 * either; mark the active item where it is rendered.
 */
export const OCHK_IO_NAV: readonly NavItem[] = [
    {
        href: `${OCHK_IO}/protocols`,
        label: 'Protocols',
        children: PROTOCOLS.map((p) => ({ href: p.pageHref, label: p.label, description: p.line })),
    },
    { href: `${OCHK_IO}/apps`, label: 'Apps' },
    { href: DOCS_HREF, label: 'Docs' },
    { href: `${OCHK_IO}/trust`, label: 'Trust' },
    { href: `${OCHK_IO}/about`, label: 'About' },
];

/** ochk.io's own footer column; `SiteFooter family` adds the family's. */
export const OCHK_IO_FOOTER: readonly FooterColumn[] = [
    {
        heading: 'Company',
        links: [
            { href: `${OCHK_IO}/about`, label: 'About' },
            { href: `${OCHK_IO}/trust`, label: 'Trust' },
            { href: 'https://github.com/orangecheck', label: 'GitHub', external: true },
        ],
    },
];
