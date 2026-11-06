import { OG_SIZE, OgBento, OgCard, ogArt, ogFonts } from '@orangecheck/app-design/og';
import type { NextApiRequest, NextApiResponse } from 'next';
import { ImageResponse } from 'next/og.js';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { recorder } from '../auth/fixtures';
import { defineSite, generateMetaTags } from '../seo/meta';
import { createOgHandler, ogTitle, type OgCardOptions, type OgLookup } from './index';

const STAMP: OgCardOptions = {
    wordmark: 'oc·stamp',
    badge: 'V1 · PREVIEW',
    defaultTitle: 'sign anything with a bitcoin address.\nanchor the moment to bitcoin.',
    host: 'STAMP.OCHK.IO',
    footer: '§ AN ORANGECHECK PROTOCOL',
    mark: (
        <svg width="200" height="200" viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">
            <circle cx="100" cy="100" r="84" fill="#f97316" />
        </svg>
    ),
};

const CARDS = { create: 'Create a stamp', verify: { title: 'Verify a stamp', eyebrow: 'Verify' } } as const;
const KEYED: OgCardOptions = { ...STAMP, cards: CARDS };
const NOT_CARDS = ['__proto__', 'constructor', 'toString', 'hasOwnProperty', 'valueOf', 'nope', ''];

describe('ogTitle', () => {
    it('never takes a headline from the request', () => {
        expect(ogTitle('/api/og?title=hello', STAMP)).toBe(STAMP.defaultTitle);
        expect(ogTitle('/api/og?title=hello', KEYED)).toBe(STAMP.defaultTitle);
        expect(ogTitle('/api/og', STAMP)).toBe(STAMP.defaultTitle);
        expect(ogTitle(undefined, STAMP)).toBe(STAMP.defaultTitle);
    });

    it('gives the card a site issues for ?page=<key>, and the default for anything else', () => {
        expect(ogTitle('/api/og?page=create', KEYED)).toBe('Create a stamp');
        expect(ogTitle('/api/og?page=verify&title=hello', KEYED)).toBe('Verify a stamp');
        expect(ogTitle('/api/og?page=create', STAMP)).toBe(STAMP.defaultTitle);
        for (const key of NOT_CARDS) expect(ogTitle(`/api/og?page=${key}`, KEYED)).toBe(STAMP.defaultTitle);
    });

    it("cuts a site's own long card title", () => {
        const long = { ...STAMP, cards: { x: 'a'.repeat(20) }, maxTitleLength: 10 };
        expect(ogTitle('/api/og?page=x', long)).toBe('aaaaaaaaa…');
    });
});

async function handled(opts: OgCardOptions, url: string) {
    const { res, out } = recorder();
    await createOgHandler(opts)({ url } as NextApiRequest, res as unknown as NextApiResponse);
    return out;
}
async function card(props: ComponentProps<typeof OgCard>) {
    return Buffer.from(await new ImageResponse(<OgCard {...props} />, { ...OG_SIZE, fonts: ogFonts() }).arrayBuffer());
}

describe('createOgHandler', () => {
    it('renders a 1200×630 PNG on the node handler contract', async () => {
        const out = await handled(STAMP, '/api/og');
        expect(out.status).toBe(200);
        expect(out.headers['content-type']).toBe('image/png');
        const png = out.body as Buffer;
        expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
        expect(png.readUInt32BE(16)).toBe(1200);
        expect(png.readUInt32BE(20)).toBe(630);
    }, 30_000);

    it("draws app-design's card: a site's 0.3 options read as its word, OC <Verb> and its host", async () => {
        const plain = await handled(STAMP, '/api/og');
        const want = await card({ title: STAMP.defaultTitle, product: 'stamp', eyebrow: 'OC Stamp', host: 'stamp.ochk.io', tone: 'ink' });
        expect((plain.body as Buffer).equals(want)).toBe(true);
    }, 30_000);

    it("draws none of a request's own text: it is sent to the card's one URL", async () => {
        for (const [url, to] of [
            ['/api/og?title=Send%20your%20bitcoin%20to%20bc1qexample', '/api/og'],
            ['/api/og?eyebrow=Official%20notice', '/api/og'],
            ['/api/og?title=x&eyebrow=y', '/api/og'],
            ['/api/og?page=create&title=ignored', '/api/og?page=create'],
            ['/api/og?title=ignored&page=verify', '/api/og?page=verify'],
            ['/api/og?page=create&page=create', '/api/og?page=create'],
            ['/api/og?page=create&v=2', '/api/og?page=create'],
            ...NOT_CARDS.map((k) => [`/api/og?page=${k}`, '/api/og']),
        ] as const) {
            const out = await handled(KEYED, url);
            expect([out.status, out.headers.location, out.body], url).toEqual([308, to, undefined]);
            expect(out.headers['cache-control'], url).toBe('public, max-age=86400, s-maxage=86400');
        }
    });

    it('keeps each card a day, browser and edge, so a share renders once per deployment', async () => {
        for (const url of ['/api/og', '/api/og?page=create']) {
            const out = await handled(KEYED, url);
            expect(out.status, url).toBe(200);
            expect(out.headers['cache-control'], url).toBe('public, max-age=86400, s-maxage=86400');
        }
    }, 30_000);

    it('?page=<key> draws that card, with its own eyebrow when it names one', async () => {
        const create = await handled(KEYED, '/api/og?page=create');
        expect((create.body as Buffer).equals(await card({ title: 'Create a stamp', product: 'stamp', eyebrow: 'OC Stamp', host: 'stamp.ochk.io' }))).toBe(true);
        const verify = await handled(KEYED, '/api/og?page=verify');
        expect((verify.body as Buffer).equals(await card({ title: 'Verify a stamp', product: 'stamp', eyebrow: 'Verify', host: 'stamp.ochk.io' }))).toBe(true);
    }, 30_000);

    // generateMetaTags puts a card's key in the share URL as it is, and this handler takes as
    // canonical only encodeURIComponent(key): the two agree only while defineSite holds keys
    // to [a-z0-9-], which seo.test.tsx pins.
    it('answers the URL generateMetaTags shares for each card, not a 308 to another', async () => {
        const cards = { create: 'Create a stamp', 'how-it-works': 'How it works', v2: 'Version 2' };
        const site = defineSite({ url: 'https://stamp.ochk.io', name: 'OC Stamp', defaultTitle: 'OC Stamp', defaultDescription: 'x', ogRoute: '/api/og', ogCards: cards });
        for (const [key, title] of Object.entries(cards)) {
            const shared = new URL(generateMetaTags(site, { title, canonical: `/${key}` }).openGraph.images[0]!.url);
            expect(shared.search).toBe(`?page=${encodeURIComponent(key)}`);
            const out = await handled({ ...STAMP, cards }, shared.pathname + shared.search);
            expect([out.status, out.headers.location], key).toEqual([200, undefined]);
        }
    }, 60_000);

    it('takes the card fields when a site names them', async () => {
        const out = await handled({ defaultTitle: 'x', host: 'vault.ochk.io', product: 'vault', eyebrow: 'Vault', tone: 'paper', cards: { hi: 'hi' } }, '/api/og?page=hi');
        const want = await card({ title: 'hi', product: 'vault', eyebrow: 'Vault', host: 'vault.ochk.io', tone: 'paper' });
        expect((out.body as Buffer).equals(want)).toBe(true);
    }, 30_000);
});

const DAY = 'public, max-age=86400, s-maxage=86400';
const SHORT = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=60';
const DEFAULT_CARD = { title: STAMP.defaultTitle, product: 'stamp', eyebrow: 'OC Stamp', host: 'stamp.ochk.io' } as const;

/** KEYED with a `project` lookup over `rows`: a row's card, null when there is none, or a throw. */
function lookingUp(rows: Record<string, OgLookup['card'] | Error>, more: Partial<OgCardOptions> = {}) {
    const asked: string[] = [];
    const project = async (slug: string): Promise<OgLookup> => {
        asked.push(slug);
        const row = Object.prototype.hasOwnProperty.call(rows, slug) ? rows[slug]! : null;
        if (row instanceof Error) throw row;
        return { card: row, cacheControl: SHORT };
    };
    return { asked, opts: { ...KEYED, resolve: { project }, ...more } satisfies OgCardOptions };
}

describe('createOgHandler resolve', () => {
    it("draws a looked-up card at its one URL, kept as long as the lookup says", async () => {
        const { asked, opts } = lookingUp({ demo: 'Demo project', vault: { title: 'Vault', eyebrow: 'Featured' } });
        const demo = await handled(opts, '/api/og?project=demo');
        expect([demo.status, demo.headers['cache-control']]).toEqual([200, SHORT]);
        expect((demo.body as Buffer).equals(await card({ ...DEFAULT_CARD, title: 'Demo project' }))).toBe(true);
        const vault = await handled(opts, '/api/og?project=vault');
        expect((vault.body as Buffer).equals(await card({ ...DEFAULT_CARD, title: 'Vault', eyebrow: 'Featured' }))).toBe(true);
        expect(asked).toEqual(['demo', 'vault']);
    }, 30_000);

    it('sends a thing removed, hidden or not found to the default card for now, kept as long as the lookup says, and draws nothing', async () => {
        // A probe of any slug costs one lookup and no render, and a project made after its URL was
        // probed shows within the lookup's own age. Not found now is not for good: a 307.
        const { asked, opts } = lookingUp({});
        const out = await handled(opts, '/api/og?project=gone');
        expect([out.status, out.headers.location, out.headers['cache-control'], out.body]).toEqual([307, '/api/og', SHORT, undefined]);
        expect(asked).toEqual(['gone']);
        const docs = await handled({ ...opts, basePath: '/docs' }, '/api/og?project=gone');
        expect([docs.status, docs.headers.location]).toEqual([307, '/docs/api/og']);
    });

    it('keeps that redirect a day at most, whatever the lookup asks', async () => {
        const project = async (): Promise<OgLookup> => ({
            card: null,
            cacheControl: 'public, max-age=31536000, s-maxage=31536000, stale-while-revalidate=31536000, immutable',
        });
        const out = await handled({ ...KEYED, resolve: { project } }, '/api/og?project=gone');
        expect([out.status, out.headers['cache-control']]).toEqual([307, 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400']);
    });

    it('caps every age it is given on that redirect, quoted or not', async () => {
        // RFC 9111 lets a cache read max-age="31536000"; stale-if-error keeps a redirect through any outage.
        const project = async (): Promise<OgLookup> => ({
            card: null,
            cacheControl: 'public, max-age="31536000", s-maxage = "31536000", stale-if-error=31536000, no-transform',
        });
        const out = await handled({ ...KEYED, resolve: { project } }, '/api/og?project=gone');
        expect(out.headers['cache-control']).toBe('public, max-age=86400, s-maxage=86400, stale-if-error=86400, no-transform');
    });

    it('answers the default card with no-store when the lookup throws, so a failed read is never kept', async () => {
        const said = vi.spyOn(console, 'error').mockImplementation(() => {});
        try {
            const { opts } = lookingUp({ demo: new Error('database unreachable') });
            const out = await handled(opts, '/api/og?project=demo');
            expect([out.status, out.headers['cache-control']]).toEqual([200, 'no-store']);
            expect((out.body as Buffer).equals(await card(DEFAULT_CARD))).toBe(true);
            expect(String(said.mock.calls[0])).toContain('database unreachable');
        } finally {
            said.mockRestore();
        }
    }, 30_000);

    it("cuts a looked-up title, as it cuts the site's own", async () => {
        const { opts } = lookingUp({ long: 'a'.repeat(20) }, { maxTitleLength: 10 });
        const out = await handled(opts, '/api/og?project=long');
        expect((out.body as Buffer).equals(await card({ ...DEFAULT_CARD, title: 'aaaaaaaaa…' }))).toBe(true);
    }, 30_000);

    it('sends any other query to its one URL, kept a day, before any lookup', async () => {
        const { asked, opts } = lookingUp({ demo: 'Demo project' });
        for (const [url, to] of [
            ['/api/og?project=demo&title=x', '/api/og?project=demo'],
            ['/api/og?title=x&project=demo', '/api/og?project=demo'],
            ['/api/og?project=demo&project=other', '/api/og?project=demo'],
            ['/api/og?project=a+b', '/api/og?project=a%20b'],
            ['/api/og?project=', '/api/og'],
            ['/api/og?page=create&project=demo', '/api/og?page=create'],
            ['/api/og?page=nope&project=demo', '/api/og?project=demo'],
            ...['constructor', '__proto__', 'toString', 'hasOwnProperty'].map((name) => [`/api/og?${name}=demo`, '/api/og']),
        ] as const) {
            const out = await handled(opts, url);
            expect([out.status, out.headers.location, out.headers['cache-control'], out.body], url).toEqual([308, to, DAY, undefined]);
        }
        expect(asked).toEqual([]);
    });

    it('refuses a lookup named page, the query of `cards`', () => {
        const page = async (): Promise<OgLookup> => ({ card: null, cacheControl: SHORT });
        expect(() => createOgHandler({ ...KEYED, resolve: { page } })).toThrow(TypeError);
    });
});

const HOME_BENTO = {
    hero: { tone: 'paper', title: 'Sign anything with a bitcoin address.', lockup: true, art: { ...ogArt.ditherMarkInk, place: 'right' } },
    top: [
        { tone: 'brand', numeral: '0', body: 'accounts to make' },
        { tone: 'ink', numeral: '1', body: 'address' },
    ],
    wide: { tone: 'burnt', title: 'Anchored to a bitcoin block.', footer: 'stamp.ochk.io' },
} as const satisfies OgCardOptions['home'];

describe('createOgHandler home', () => {
    it("draws the site's bento at ?page=home, kept a day, and its cards as before", async () => {
        const home = await handled({ ...KEYED, home: HOME_BENTO }, '/api/og?page=home');
        expect([home.status, home.headers['cache-control']]).toEqual([200, DAY]);
        const want = Buffer.from(await new ImageResponse(<OgBento {...HOME_BENTO} />, { ...OG_SIZE, fonts: ogFonts() }).arrayBuffer());
        expect((home.body as Buffer).equals(want)).toBe(true);
        const create = await handled({ ...KEYED, home: HOME_BENTO }, '/api/og?page=create');
        expect((create.body as Buffer).equals(await card({ ...DEFAULT_CARD, title: 'Create a stamp' }))).toBe(true);
    }, 60_000);

    it('sends any other query on the home URL to it, and ?page=home to the default card where there is no bento', async () => {
        for (const url of ['/api/og?page=home&title=x', '/api/og?title=x&page=home', '/api/og?page=home&page=home']) {
            const out = await handled({ ...KEYED, home: HOME_BENTO }, url);
            expect([out.status, out.headers.location, out.body], url).toEqual([308, '/api/og?page=home', undefined]);
        }
        const none = await handled(KEYED, '/api/og?page=home');
        expect([none.status, none.headers.location]).toEqual([308, '/api/og']);
    });

    it('refuses cards that name home beside a home bento', () => {
        expect(() => createOgHandler({ ...STAMP, cards: { home: 'Home' }, home: HOME_BENTO })).toThrow(TypeError);
        expect(() => createOgHandler({ ...STAMP, cards: { home: 'Home' } })).not.toThrow();
    });
});

describe('createOgHandler basePath', () => {
    it("puts the site's basePath back on the URL it sends a request to", async () => {
        const docs = { ...KEYED, basePath: '/docs' };
        for (const [url, to] of [
            ['/api/og?title=x', '/docs/api/og'],
            ['/api/og?page=create&title=x', '/docs/api/og?page=create'],
            ['/api/og?page=nope', '/docs/api/og'],
        ] as const) {
            const out = await handled(docs, url);
            expect([out.status, out.headers.location, out.headers['cache-control']], url).toEqual([308, to, DAY]);
        }
        const create = await handled(docs, '/api/og?page=create');
        expect([create.status, create.headers.location]).toEqual([200, undefined]);
    }, 30_000);

    it('sends no request to another host, whatever its path', async () => {
        // /x/..//evil.com resolves to //evil.com, which a Location would read as a host.
        const { opts } = lookingUp({});
        for (const [site, url, to] of [
            [KEYED, '/x/..//evil.example?title=x', '/evil.example'],
            [{ ...KEYED, basePath: '/docs' }, '/x/..//evil.example?title=x', '/docs/evil.example'],
            [opts, '/x/..//evil.example?project=gone', '/evil.example'],
            [KEYED, '/x/..///api/og?page=nope', '/api/og'],
        ] as const) {
            const out = await handled(site, url);
            expect(out.headers.location, url).toBe(to);
        }
    });

    it('refuses a basePath that is not a path, so a 308 never leaves the site', () => {
        for (const basePath of ['docs', '/docs/', '/', '', '//evil.example', 'https://evil.example', '/do cs', '/a//b', '/.', '/..', '/docs/..', '/../docs', '/./docs']) {
            expect(() => createOgHandler({ ...KEYED, basePath }), basePath).toThrow(TypeError);
        }
        expect(() => createOgHandler({ ...KEYED, basePath: '/docs' })).not.toThrow();
        expect(() => createOgHandler({ ...KEYED, basePath: '/a/b-c.d' })).not.toThrow();
        expect(() => createOgHandler({ ...KEYED, basePath: '/.well/...' })).not.toThrow();
    });
});
