/*
 * Every family caller's text in ./og's mono fields: where it comes from, the
 * class of characters it can hold, and its real strings today. ./og's mono
 * font is JetBrains Mono 400 cut to the union of these classes, plus space
 * (subset-mono.mjs); check-og fails when a class or a real string can hold a
 * character the subset font's cmap lacks.
 *
 * Read at each repo's origin/main on 2026-11-04 (the sha beside each file).
 * The mono fields are OgCard's eyebrow and host, and OgBento's tile kicker,
 * rows and footer (src/og/index.tsx, `MONO`). A field's class is the union of
 *   strings    the exact characters of static config strings,
 *   alphabets  the alphabets of values made at request time (ALPHABETS),
 * taken uppercase when the label row draws the field (`upper`: textTransform,
 * which satori applies with toLocaleUpperCase). `wide` marks free user text:
 * no subset holds it, so `strings` and `alphabets` are the part its spec
 * allows, and ./og's net draws the rest in Inter with a warning (check-og's
 * plant). A new caller of OgCard, OgBento or site-kit's createOgHandler adds
 * its fields and its real cards here.
 */

let printable = '';
for (let c = 0x21; c <= 0x7e; c++) printable += String.fromCharCode(c);

export const ALPHABETS = {
    /** A hostname, as site-kit lowercases it. */
    hostname: 'abcdefghijklmnopqrstuvwxyz0123456789.-',
    /** A bech32 address as @orangecheck/bip322's normalizeAddress spells it: the bc, tb and bcrt prefixes, the 1, BIP-173's data characters. */
    bech32: 'bcrt1qpzry9x8gf2tvdw0s3jn54khce6mua7l',
    /** A base58 address (P2PKH, P2SH), which normalizeAddress keeps as given. */
    base58: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',
    /** An attestation id: 64 lowercase hex digits. */
    hex: '0123456789abcdef',
    /** An identity binding's identifier and protocol, as oc-attest-protocol SPEC §2.3's ABNF allows: printable ASCII. */
    identifier: printable,
};

/** The sections of oc-docs' DOCS_NAV (src/components/docs/nav.ts): a docs page's card has its section above the title. */
const DOCS_SECTIONS = [
    'Getting started',
    'Integration',
    'Ecosystem (shared)',
    'OC Attest',
    'OC Lock',
    'OC Stamp',
    'OC Vote',
    'OC Agent',
    'OC Pledge',
    'ochk.app',
    'OC Vault',
    'OC Chat',
    'OC Cosign',
    'API reference',
    'SDKs',
    'Reference',
];

/**
 * The options each site gives site-kit's createOgHandler, as its route has them. site-kit draws
 * `eyebrow` (or a card entry's own) in the label row and `host`, lowercased, at the top right.
 */
export const SITE_KIT_SITES = {
    'oc-agent-web': {
        file: 'src/pages/api/og.tsx @ 7ce10ec0',
        options: { defaultTitle: 'Every agent gets a Bitcoin address. Every action, signed.', host: 'agent.ochk.io', product: 'OC Agent', eyebrow: 'Authority' },
    },
    'oc-app-web': {
        file: 'src/pages/api/og.ts @ 4182836c',
        options: { defaultTitle: 'Sign in · Back it · Get paid · Own it', eyebrow: 'One account, with Bitcoin behind it', host: 'ochk.app', tone: 'paper' },
    },
    'oc-attest-web': {
        file: 'src/pages/api/og/index.tsx @ 42355d2c',
        options: { product: 'attest', eyebrow: 'OC Attest', defaultTitle: 'Proof of Bitcoin stake for the open web', host: 'attest.ochk.io' },
    },
    'oc-globe-web': {
        file: 'src/pages/api/og.tsx @ 1f95cf6b',
        options: { product: 'globe', eyebrow: 'OC Globe', defaultTitle: 'The bitcoin network, made visible.', host: 'globe.ochk.io' },
    },
    'oc-lock-web': {
        file: 'src/pages/api/og.tsx @ 4db28853',
        options: { defaultTitle: 'Encrypt to a Bitcoin address. Open it in one click.', host: 'lock.ochk.io', product: 'OC Lock', eyebrow: 'Confidentiality' },
    },
    'oc-pledge-web': {
        file: 'src/pages/api/og.tsx @ a57cbd66',
        options: { product: 'pledge', eyebrow: 'OC Pledge', defaultTitle: 'pledge your word to bitcoin.\nbroken pledges, public ledger.', host: 'pledge.ochk.io' },
    },
    'oc-stamp-web': {
        file: 'src/pages/api/og.tsx @ 4147841f',
        options: { product: 'stamp', eyebrow: 'OC Stamp', defaultTitle: 'sign anything with a bitcoin address.\nanchor the moment to bitcoin.', host: 'STAMP.OCHK.IO' },
    },
    'oc-vault-web': {
        file: 'src/pages/api/og.tsx @ ff43eb87',
        options: { product: 'vault', eyebrow: 'Vault', defaultTitle: 'The password manager that can’t read your data.', host: 'vault.ochk.io', tone: 'paper' },
    },
    'oc-vote-web': {
        file: 'src/pages/api/og.tsx @ b054e077 (titleCard)',
        options: { product: 'vote', eyebrow: 'OC Vote', host: 'vote.ochk.io', defaultTitle: 'sovereign signaling for the open web.' },
    },
    'oc-www': {
        file: 'src/pages/api/og/index.tsx @ ab11ec44',
        options: { defaultTitle: 'Open protocols on Bitcoin', eyebrow: 'Six verbs, one Bitcoin address', host: 'ochk.io' },
        // src/lib/seo/og-cards.ts: the protocol pages' cards name their protocol above the title.
        cards: {
            attest: { title: 'prove you hold bitcoin', eyebrow: 'OC Attest' },
            lock: { title: 'seal a message to a Bitcoin address', eyebrow: 'OC Lock' },
            vote: { title: 'polls weighed in sats, counted by anyone', eyebrow: 'OC Vote' },
            stamp: { title: 'prove who signed a file, and when', eyebrow: 'OC Stamp' },
            agent: { title: 'scoped, revocable permission for software', eyebrow: 'OC Agent' },
            pledge: { title: 'a public promise with bitcoin behind it', eyebrow: 'OC Pledge' },
        },
    },
};

/** What site-kit's createOgHandler gives OgCard for a site's options (ogCardProps and ogTitle, site-kit/src/og/index.tsx @ 3bbb908e). */
export function siteKitCard(opts, title = opts.defaultTitle, asked) {
    const max = opts.maxTitleLength ?? 200;
    const word = opts.wordmark?.replace(/^oc\s*[·.\-\s]\s*/i, '');
    const eyebrow = asked ?? opts.eyebrow ?? (word && word !== opts.wordmark ? `OC ${word.charAt(0).toUpperCase()}${word.slice(1)}` : undefined);
    return { title: title.length > max ? `${title.slice(0, max - 1)}…` : title, product: opts.product ?? word, eyebrow, host: opts.host.toLowerCase(), tone: opts.tone ?? 'ink' };
}

const siteKitFields = Object.entries(SITE_KIT_SITES).flatMap(([caller, { file, options, cards = {} }]) => {
    const eyebrows = [options.eyebrow, ...Object.values(cards).map((c) => c.eyebrow)].filter(Boolean);
    return [
        {
            caller: `${caller} (site-kit)`,
            file,
            field: 'OgCard.eyebrow',
            upper: true,
            source: "createOgHandler's eyebrow option, or a card entry's own: static config",
            strings: [...new Set(eyebrows)],
        },
        { caller: `${caller} (site-kit)`, file, field: 'OgCard.host', source: "createOgHandler's host option, lowercased: static config", alphabets: ['hostname'], real: [options.host.toLowerCase()] },
    ];
});

/** Every mono field a caller draws: caller, file, field, source, class, and real strings when they are not the class's own strings. */
export const INVENTORY = [
    ...siteKitFields,
    {
        caller: 'oc-attest-web',
        file: 'src/pages/api/og/check.tsx @ 42355d2c',
        field: 'OgCard.eyebrow',
        upper: true,
        source: '`Attestation · ${subject}`: the verifier’s address or the request’s (normalizeAddress), cut to 14…8, else the id’s 10…6; or a fixed line',
        strings: ['Attestation · ', '…', 'Attestation · open the link to check it', 'OC Attest'],
        alphabets: ['bech32', 'base58', 'hex'],
        real: ['Attestation · bc1pezn5yjxmz9…s60hqa2', 'Attestation · 1A1zP1eP5QGefi…v7DivfNa', 'Attestation · bbde80f884…e23658', 'Attestation · open the link to check it', 'OC Attest'],
    },
    { caller: 'oc-attest-web', file: 'src/pages/api/og/check.tsx @ 42355d2c', field: 'OgCard.host', source: 'a literal', strings: ['attest.ochk.io'] },
    {
        caller: 'oc-btc-web',
        file: 'src/pages/api/og.tsx @ a68fa316',
        field: 'OgCard.eyebrow',
        upper: true,
        source: 'a literal (src/lib/seo/og-cards.ts gives only titles)',
        strings: ['The public bitcoin desk'],
    },
    { caller: 'oc-btc-web', file: 'src/pages/api/og.tsx @ a68fa316', field: 'OgCard.host', source: 'a literal', strings: ['btc.ochk.io'] },
    { caller: 'oc-chat-web', file: 'src/pages/api/og.tsx @ 666182ea', field: 'OgCard.eyebrow', upper: true, source: 'a literal', strings: ['Private messaging, built on Bitcoin'] },
    { caller: 'oc-chat-web', file: 'src/pages/api/og.tsx @ 666182ea', field: 'OgCard.host', source: 'a literal', strings: ['chat.ochk.io'] },
    { caller: 'oc-cosign-web', file: 'src/pages/api/og.tsx @ 39982dbc', field: 'OgCard.eyebrow', upper: true, source: 'a literal', strings: ['Co-founders, on Bitcoin'] },
    { caller: 'oc-cosign-web', file: 'src/pages/api/og.tsx @ 39982dbc', field: 'OgCard.host', source: 'a literal', strings: ['cosign.ochk.io'] },
    {
        caller: 'oc-docs',
        file: 'src/pages/api/og.tsx @ b29ab581',
        field: 'OgCard.eyebrow',
        upper: true,
        source: 'docsCard(page): the page’s DOCS_NAV section label (src/components/docs/nav.ts), else Docs: static config',
        strings: [...DOCS_SECTIONS, 'Docs'],
    },
    { caller: 'oc-docs', file: 'src/pages/api/og.tsx @ b29ab581', field: 'OgCard.host', source: 'a literal', strings: ['ochk.io/docs'] },
    {
        caller: 'oc-vote-web',
        file: 'src/pages/api/og.tsx @ b054e077 (pollCard)',
        field: 'OgCard.eyebrow',
        upper: true,
        source: '`${Closed|Open} poll${", secret ballot"}`, or CARD.eyebrow: literals',
        strings: ['OC Vote', 'Open poll', 'Closed poll', 'Open poll, secret ballot', 'Closed poll, secret ballot'],
    },
    { caller: 'oc-vote-web', file: 'src/pages/api/og.tsx @ b054e077 (pollCard)', field: 'OgCard.host', source: 'CARD.host: a literal', strings: ['vote.ochk.io'] },
    {
        caller: 'oc-www',
        file: 'src/pages/api/og/profile.tsx @ ab11ec44',
        field: 'OgCard.eyebrow',
        upper: true,
        wide: 'show=handles adds up to three of the attestation’s identity bindings (formatHandle). oc-www’s signedAttestation splits the signed identities: line on commas with no other rule, and the sdk’s parseIdentities refuses only CR, LF and commas, so a signed identifier can hold any character. Its spec class is SPEC §2.3’s printable ASCII.',
        source: 'Verified on Bitcoin · <the address, cut to 12…8> · <handles: @x, protocol/identifier, a nostr key cut to 8…5>; or a fixed line',
        strings: ['Verified on Bitcoin', ' · ', 'No OC Attest on this address yet', 'Open the profile to check it on chain', '…', '@', '/'],
        alphabets: ['bech32', 'base58', 'identifier'],
        real: [
            'Verified on Bitcoin · bc1qar0srrr7…zwf5mdq',
            'Verified on Bitcoin · bc1qar0srrr7…zwf5mdq · @alice · github/alice · npub1alc…q3k2x',
            'No OC Attest on this address yet',
            'Open the profile to check it on chain',
        ],
    },
    {
        caller: 'oc-www',
        file: 'src/pages/api/og/profile.tsx @ ab11ec44',
        field: 'OgCard.host',
        source: '`ochk.io/u/${shortAddr(addr)}` (mainnetAddress, cut to 12…8), else ochk.io',
        strings: ['ochk.io/u/', '…', 'ochk.io'],
        alphabets: ['bech32', 'base58'],
        real: ['ochk.io/u/bc1qar0srrr7…zwf5mdq', 'ochk.io/u/1A1zP1eP5QGe…v7DivfNa', 'ochk.io'],
    },
    // OgCard's own default, and app-design's fixtures: OgBento has no family caller (no repo but app-design names it at
    // origin/main); check-og and Og.stories.tsx are its only callers, with these strings.
    { caller: 'app-design', file: 'src/og/index.tsx', field: 'OgCard.host', source: 'the default when a caller gives none', strings: ['ochk.io'] },
    {
        caller: 'app-design (fixtures)',
        file: 'scripts/check-og.mjs, src/og/Og.stories.tsx',
        field: 'OgCard.eyebrow',
        upper: true,
        source: 'literals',
        strings: ['OC Stamp', 'Lumen Notes', 'Halfway Books'],
    },
    { caller: 'app-design (fixtures)', file: 'scripts/check-og.mjs, src/og/Og.stories.tsx', field: 'OgCard.host', source: 'literals', strings: ['stamp.ochk.io', 'lumen.example', 'halfway.example'] },
    { caller: 'app-design (fixtures)', file: 'scripts/check-og.mjs, src/og/Og.stories.tsx', field: 'OgTile.kicker', upper: true, source: 'literals', strings: ['Receipts', 'For shops'] },
    {
        caller: 'app-design (fixtures)',
        file: 'scripts/check-og.mjs, src/og/Og.stories.tsx',
        field: 'OgTile.rows',
        source: 'literals',
        strings: ['Paperback', '£4', 'Hardback', '£9', 'Listing', 'free'],
    },
    { caller: 'app-design (fixtures)', file: 'scripts/check-og.mjs, src/og/Og.stories.tsx', field: 'OgTile.footer', source: 'literals', strings: ['lumen.example', 'Example data', 'halfway.example'] },
];

/** The characters a string draws as: uppercase in the label row, as satori transforms it. */
const drawnAs = (text, upper) => [...(upper ? text.toLocaleUpperCase() : text)];

/** Every character a field can draw: its class, uppercase in the label row. */
export function fieldClass(entry) {
    const raw = [...(entry.strings ?? []), ...(entry.alphabets ?? []).map((a) => ALPHABETS[a])].join('');
    if (entry.alphabets?.some((a) => ALPHABETS[a] === undefined)) throw new Error(`${entry.caller} ${entry.field}: an unknown alphabet`);
    return new Set([...raw].flatMap((c) => drawnAs(c, entry.upper)));
}

/** Every character a field draws today: its real strings, else its class's own strings. */
export function fieldReal(entry) {
    return new Set((entry.real ?? entry.strings ?? []).flatMap((s) => drawnAs(s, entry.upper)));
}

/** The subset's characters: the union of every field's class, plus space. */
export function monoSet(inventory = INVENTORY) {
    const out = new Set([' ']);
    for (const e of inventory) for (const c of fieldClass(e)) out.add(c);
    return [...out].sort((a, b) => a.codePointAt(0) - b.codePointAt(0)).join('');
}

const shortAttest = (a) => (a.length > 28 ? `${a.slice(0, 14)}…${a.slice(-8)}` : a);
const shortWww = (a) => (a.length <= 22 ? a : `${a.slice(0, 12)}…${a.slice(-8)}`);
const BECH32 = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const TAPROOT = 'bc1pezn5yjxmz9nuahtqprvhfeya2nv4zdfk49u5amquhqptykx695rs60hqa2';
const BASE58 = '1A1zP1eP5QGefi2DMPTfTL5SLmv7DivfNa';
const ID = 'bbde80f884ae849d2cc8d4fa19687e7ec862f8b7c85a3ee8cf93739548e23658';

/** Each caller's real cards, as OgCard props: what its route draws, with real values where a request makes them. */
export const CARDS = [
    ...Object.entries(SITE_KIT_SITES).flatMap(([caller, { options, cards = {} }]) => [
        { caller, name: `${caller}-default`, props: siteKitCard(options) },
        ...Object.entries(cards).map(([key, c]) => ({ caller, name: `${caller}-${key}`, props: siteKitCard(options, c.title, c.eyebrow) })),
    ]),
    ...[
        { name: 'verified', eyebrow: `Attestation · ${shortAttest(TAPROOT)}`, title: '1,250,000 sats, unspent 412 days' },
        { name: 'verified-base58', eyebrow: `Attestation · ${shortAttest(BASE58)}`, title: '5,000,000,000 sats, unspent 6150 days' },
        { name: 'verified-id', eyebrow: `Attestation · ${ID.slice(0, 10)}…${ID.slice(-6)}`, title: '100,000 sats, unspent 30 days' },
        { name: 'subject', eyebrow: 'Attestation · open the link to check it', title: shortAttest(TAPROOT) },
        { name: 'fixed', eyebrow: 'OC Attest', title: 'Proof of Bitcoin stake for the open web' },
    ].map(({ name, ...c }) => ({ caller: 'oc-attest-web', name: `oc-attest-web-check-${name}`, props: { ...c, product: 'attest', host: 'attest.ochk.io' } })),
    {
        caller: 'oc-btc-web',
        name: 'oc-btc-web-default',
        props: { product: 'btc', eyebrow: 'The public bitcoin desk', title: 'Bitcoin, read in plain English. Live, open, free.', host: 'btc.ochk.io' },
    },
    {
        caller: 'oc-chat-web',
        name: 'oc-chat-web-default',
        props: { product: 'chat', eyebrow: 'Private messaging, built on Bitcoin', title: 'No phone number. No password. Just an inbox that’s actually yours.', host: 'chat.ochk.io' },
    },
    {
        caller: 'oc-cosign-web',
        name: 'oc-cosign-web-default',
        props: { product: 'cosign', eyebrow: 'Co-founders, on Bitcoin', title: 'Get behind builders. Join it, or back it.', host: 'cosign.ochk.io' },
    },
    { caller: 'oc-docs', name: 'oc-docs-default', props: { product: 'docs', eyebrow: 'Docs', title: 'the orangecheck handbook.', host: 'ochk.io/docs' } },
    ...DOCS_SECTIONS.map((s, i) => ({ caller: 'oc-docs', name: `oc-docs-section-${i + 1}`, props: { product: 'docs', eyebrow: s, title: 'Quickstart', host: 'ochk.io/docs' } })),
    ...[
        ['open', 'Open poll', 'Should the relay set grow to five?'],
        ['open-secret', 'Open poll, secret ballot', 'Which logo should the meetup use?'],
        ['closed', 'Closed poll', 'Ship the 2.0 design this month?'],
        ['closed-secret', 'Closed poll, secret ballot', 'Pick the venue for the next meetup.'],
        ['not-found', 'OC Vote', 'This poll was not found.'],
    ].map(([name, eyebrow, title]) => ({ caller: 'oc-vote-web', name: `oc-vote-web-poll-${name}`, props: { product: 'vote', eyebrow, title, host: 'vote.ochk.io' } })),
    ...[
        ['verified', 'Verified on Bitcoin · ' + shortWww(BECH32), '100k+ sats, 1y+ unspent', BECH32],
        ['verified-handles', `Verified on Bitcoin · ${shortWww(BECH32)} · @alice · github/alice · npub1alc…q3k2x`, '100k+ sats, 1y+ unspent', BECH32],
        ['verified-base58', 'Verified on Bitcoin · ' + shortWww(BASE58), '1M+ sats, 30d+ unspent', BASE58],
        ['none', 'No OC Attest on this address yet', shortWww(BECH32), BECH32],
        ['unknown', 'Open the profile to check it on chain', shortWww(BECH32), BECH32],
    ].map(([name, eyebrow, title, addr]) => ({ caller: 'oc-www', name: `oc-www-profile-${name}`, props: { eyebrow, title, host: `ochk.io/u/${shortWww(addr)}`, mark: name !== 'verified-handles' } })),
    { caller: 'oc-www', name: 'oc-www-profile-default', props: { title: 'Six verbs, one Bitcoin address', host: 'ochk.io', mark: true } },
];
