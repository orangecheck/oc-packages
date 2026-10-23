// @vitest-environment jsdom
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

// next/head collects tags through Next's head manager; render them in place here.
vi.mock('next/head.js', () => ({ default: ({ children }: { children: ReactNode }) => <>{children}</> }));

import {
    cardTitle,
    createSeo,
    defineSite,
    generateMetaTags,
    jsonLd,
    organization,
    pageTitle,
    Seo,
    softwareApplication,
    webPage,
    webSite,
} from './index';

const STAMP = defineSite({
    url: 'https://stamp.ochk.io',
    name: 'OC Stamp',
    defaultTitle: 'OC Stamp — sign anything with your Bitcoin address, anchor the moment to Bitcoin',
    defaultDescription:
        'Bitcoin-identity-bound content attestation with block-anchored priority. BIP-322 authorship, OpenTimestamps anchoring, optional OrangeCheck stake signal. Verify anywhere, offline, forever. A sub-product of OrangeCheck.',
});

describe('jsonLd', () => {
    it('cannot close the script it sits in, and still parses to the same value', () => {
        const value = { url: '/address/x</script><script>alert(1)</script>', note: '<!--', amp: 'a&b>c', ls: 'x\u2028y\u2029z' };
        const out = jsonLd(value);
        expect(out).not.toMatch(/[<>&\u2028\u2029]/);
        expect(JSON.parse(out)).toEqual(value);
    });

    it('refuses a value JSON cannot represent rather than emitting "undefined"', () => {
        expect(() => jsonLd(undefined)).toThrow(TypeError);
    });
});

describe('titles', () => {
    it.each(['OC Stamp — home', 'stamp · oc·stamp', 'OrangeCheck status', 'create · oc·stamp'])(
        'does not repeat a brand the title already names: %s',
        (title) => {
            expect(pageTitle(STAMP, title)).toBe(title);
        }
    );

    it('names the product once on an unbranded title', () => {
        expect(pageTitle(STAMP, 'Pricing')).toBe('Pricing | OC Stamp');
        expect(pageTitle(STAMP, 'Page Not Found')).toBe('Page Not Found | OC Stamp');
    });

    it('takes a site separator and brand pattern (ochk.io: em dash, orangecheck only)', () => {
        const www = defineSite({ ...STAMP, url: 'https://ochk.io', name: 'OrangeCheck', titleSeparator: ' — ', brand: /orangecheck/i });
        expect(pageTitle(www, 'Pricing')).toBe('Pricing — OrangeCheck');
        expect(pageTitle(www, 'oc stamp')).toBe('oc stamp — OrangeCheck');
    });

    it('escapes a site name used as a pattern', () => {
        const odd = defineSite({ ...STAMP, name: 'OC a+b' });
        expect(pageTitle(odd, 'x | oc·a+b')).toBe('x | oc·a+b');
        expect(pageTitle(odd, 'oc aab')).toBe('oc aab | OC a+b');
    });
});

describe('defineSite', () => {
    it.each(['http://stamp.ochk.io', 'https://stamp.ochk.io/', 'https://stamp.ochk.io/x', 'stamp.ochk.io', 'javascript:alert(1)'])(
        'refuses %s',
        (url) => {
            expect(() => defineSite({ ...STAMP, url })).toThrow(TypeError);
        }
    );

    it('allows localhost while developing', () => {
        expect(defineSite({ ...STAMP, url: 'http://localhost:3000' }).url).toBe('http://localhost:3000');
    });
});

describe('generateMetaTags', () => {
    it('matches what stamp.ochk.io/create served before the kit', () => {
        const m = generateMetaTags(STAMP, {
            title: 'create · oc·stamp',
            description:
                'Sign any bytes with your Bitcoin address, anchor the hash to a Bitcoin block, and produce a self-contained .stamp envelope.',
            canonical: '/create',
            keywords: ['bitcoin', 'bip-322', 'opentimestamps', 'stamp', 'signing'],
        });
        expect(m.title).toBe('create · oc·stamp');
        expect(m.canonical).toBe('https://stamp.ochk.io/create');
        expect(m.openGraph.url).toBe('https://stamp.ochk.io/create');
        expect(m.openGraph.images).toEqual([
            { url: 'https://stamp.ochk.io/og.png', width: 1200, height: 630, alt: 'create · oc·stamp' },
        ]);
        expect(m.keywords).toBe('bitcoin, bip-322, opentimestamps, stamp, signing');
        expect(m.robots).toEqual({ index: true, follow: true });
    });

    it('refuses a page without a canonical: a tool site root redirects, so it is no fallback', () => {
        // @ts-expect-error a page must name its canonical
        expect(() => generateMetaTags(STAMP)).toThrow(TypeError);
        // @ts-expect-error a page must name its canonical
        expect(() => generateMetaTags(STAMP, { title: 'Pricing' })).toThrow(TypeError);
    });

    it('defaults to the site title', () => {
        const m = generateMetaTags(STAMP, { canonical: '/' });
        expect(m.canonical).toBe('https://stamp.ochk.io/');
        expect(m.title).toBe(STAMP.defaultTitle);
        expect(m.keywords).toBeUndefined();
    });

    it('takes an absolute https canonical, and refuses anything else that is not a path', () => {
        expect(generateMetaTags(STAMP, { canonical: 'https://ochk.io/stamp' }).canonical).toBe('https://ochk.io/stamp');
        for (const canonical of ['create', '//evil.example/x', 'javascript:alert(1)', 'http://stamp.ochk.io/x']) {
            expect(() => generateMetaTags(STAMP, { canonical })).toThrow(TypeError);
        }
    });

    it('noindex means noindex,nofollow', () => {
        expect(generateMetaTags(STAMP, { canonical: '/x', noindex: true }).robots).toEqual({ index: false, follow: false });
    });
});

/** Tag list in document order, as `name=value` strings. */
function tags(html: string): string[] {
    const doc = new DOMParser().parseFromString(`<head>${html}</head>`, 'text/html');
    return [...doc.head.children].map((el) => {
        if (el.tagName === 'TITLE') return `title=${el.textContent}`;
        if (el.tagName === 'LINK') return `link:${el.getAttribute('rel')}=${el.getAttribute('href')}`;
        if (el.tagName === 'SCRIPT') return `script:${el.getAttribute('type')}=${el.textContent}`;
        const k = el.getAttribute('name') ?? el.getAttribute('property');
        return `${k}=${el.getAttribute('content')}`;
    });
}

describe('<Seo>', () => {
    it('renders the tags stamp.ochk.io/create served before the kit, in order', () => {
        const html = renderToStaticMarkup(
            <Seo
                site={STAMP}
                title="create · oc·stamp"
                description="Sign any bytes with your Bitcoin address, anchor the hash to a Bitcoin block, and produce a self-contained .stamp envelope."
                canonical="/create"
                keywords={['bitcoin', 'bip-322', 'opentimestamps', 'stamp', 'signing']}
            />
        );
        const d =
            'Sign any bytes with your Bitcoin address, anchor the hash to a Bitcoin block, and produce a self-contained .stamp envelope.';
        expect(tags(html)).toEqual([
            'title=create · oc·stamp',
            'title=create · oc·stamp',
            `description=${d}`,
            'keywords=bitcoin, bip-322, opentimestamps, stamp, signing',
            'link:canonical=https://stamp.ochk.io/create',
            'og:type=website',
            'og:url=https://stamp.ochk.io/create',
            'og:title=create · oc·stamp',
            `og:description=${d}`,
            'og:site_name=OC Stamp',
            'og:image=https://stamp.ochk.io/og.png',
            'og:image:width=1200',
            'og:image:height=630',
            'og:image:alt=create · oc·stamp',
            'twitter:card=summary_large_image',
            'twitter:title=create · oc·stamp',
            `twitter:description=${d}`,
            'twitter:image=https://stamp.ochk.io/og.png',
            'robots=index,follow',
        ]);
    });

    it('escapes structured data inside the script tag', () => {
        const html = renderToStaticMarkup(
            <Seo site={STAMP} canonical="/" structuredData={{ '@type': 'Thing', name: '</script><script>alert(1)</script>' }} />
        );
        expect(html).not.toContain('<script>alert(1)');
        expect(html).toContain('\\u003c/script\\u003e');
    });

    it('emits og:image:type only when the site sets one', () => {
        expect(renderToStaticMarkup(<Seo site={STAMP} canonical="/" />)).not.toContain('og:image:type');
        const html = renderToStaticMarkup(<Seo site={{ ...STAMP, ogImageType: 'image/png' }} canonical="/" />);
        expect(html).toContain('property="og:image:type" content="image/png"');
    });

    it('createSeo binds the site so pages pass only their own values', () => {
        const seo = createSeo(STAMP);
        const html = renderToStaticMarkup(<seo.Seo title="Pricing" canonical="/pricing" noindex />);
        expect(html).toContain('<title>Pricing | OC Stamp</title>');
        expect(html).toContain('content="noindex,nofollow"');
    });
});

describe('share image', () => {
    const ROUTED = defineSite({ ...STAMP, ogRoute: '/api/og' });
    const image = (site: typeof STAMP, page: Parameters<typeof generateMetaTags>[1]) => {
        const m = generateMetaTags(site, page);
        expect(m.twitter.images).toEqual([m.openGraph.images[0]!.url]);
        return m.openGraph.images[0]!.url;
    };

    it('with an og route and no cards, every page shares the default card: no title rides the URL', () => {
        for (const page of [
            { title: 'Create a stamp · OC Stamp', canonical: '/create' },
            { title: 'Verify a stamp', canonical: '/verify' },
            { canonical: '/' },
            { title: 'a&b #1?', canonical: '/x' },
        ]) {
            expect(image(ROUTED, page)).toBe('https://stamp.ochk.io/api/og');
        }
    });

    it("with cards, a page whose card title the site issues names it by key, the site's name cut", () => {
        const CARDED = defineSite({ ...ROUTED, ogCards: { create: 'Create a stamp', verify: { title: 'Verify a stamp', eyebrow: 'Verify' } } });
        expect(image(CARDED, { title: 'Create a stamp · OC Stamp', canonical: '/create' })).toBe('https://stamp.ochk.io/api/og?page=create');
        expect(image(CARDED, { title: 'Verify a stamp', canonical: '/verify' })).toBe('https://stamp.ochk.io/api/og?page=verify');
        expect(image(CARDED, { title: 'Pricing', canonical: '/pricing' })).toBe('https://stamp.ochk.io/api/og');
        expect(image(CARDED, { canonical: '/' })).toBe('https://stamp.ochk.io/api/og');
    });

    it.each<Record<string, string | { title: string }>>([{ 'Bad Key': 'x' }, { 'a/b': 'x' }, { '': 'x' }, { ok: '' }, { ok: { title: ' ' } }])('defineSite refuses ogCards %j', (ogCards) => {
        expect(() => defineSite({ ...ROUTED, ogCards })).toThrow(TypeError);
    });

    it('without one, the static image; a page or a site image wins over the route', () => {
        expect(image(STAMP, { title: 'Verify', canonical: '/verify' })).toBe('https://stamp.ochk.io/og.png');
        expect(image(ROUTED, { canonical: '/p/1', ogImage: 'https://stamp.ochk.io/api/og?page=p1' })).toBe(
            'https://stamp.ochk.io/api/og?page=p1'
        );
        expect(image(defineSite({ ...ROUTED, ogImage: 'https://cdn.example/x.png' }), { canonical: '/' })).toBe('https://cdn.example/x.png');
    });

    it('ogImage(title) gets the page title and must give an absolute URL', () => {
        const seen: string[] = [];
        const site = defineSite({ ...STAMP, ogImage: (t: string) => (seen.push(t), `https://img.example/${encodeURIComponent(t)}.png`) });
        expect(image(site, { title: 'Verify a stamp · OC Stamp', canonical: '/verify' })).toBe('https://img.example/Verify%20a%20stamp%20%C2%B7%20OC%20Stamp.png');
        expect(seen).toEqual(['Verify a stamp · OC Stamp']);
        expect(() => generateMetaTags(defineSite({ ...STAMP, ogImage: () => '/og.png' }), { canonical: '/' })).toThrow(TypeError);
    });

    it('cardTitle needs only the name, for a site that keeps its own Seo', () => {
        expect(cardTitle({ name: 'OC Chat' }, 'Pricing · OC Chat')).toBe('Pricing');
        expect(cardTitle({ name: 'orangecheck docs' }, 'orangecheck docs — Vault')).toBe('Vault');
    });

    it.each(['api/og', '/api/og?x=1', 'https://stamp.ochk.io/api/og', '/api/og#x'])('defineSite refuses ogRoute %s', (ogRoute) => {
        expect(() => defineSite({ ...STAMP, ogRoute })).toThrow(TypeError);
    });

    it('<Seo> writes the card to og:image and twitter:image', () => {
        const site = defineSite({ ...ROUTED, ogCards: { create: 'Create a stamp' } });
        const html = renderToStaticMarkup(<Seo site={site} title="Create a stamp · OC Stamp" canonical="/create" />);
        expect(html).toContain('property="og:image" content="https://stamp.ochk.io/api/og?page=create"');
        expect(html).toContain('name="twitter:image" content="https://stamp.ochk.io/api/og?page=create"');
    });
});

describe('structured data', () => {
    it("reproduces stamp.ochk.io's home JSON-LD as served before the kit", () => {
        const served = [
            {
                '@context': 'https://schema.org',
                '@type': 'WebSite',
                name: 'OC Stamp',
                url: 'https://stamp.ochk.io',
                description: STAMP.defaultDescription,
                potentialAction: {
                    '@type': 'SearchAction',
                    target: { '@type': 'EntryPoint', urlTemplate: 'https://stamp.ochk.io/verify?q={search_term_string}' },
                    'query-input': 'required name=search_term_string',
                },
            },
            {
                '@context': 'https://schema.org',
                '@type': 'Organization',
                name: 'OrangeCheck',
                url: 'https://ochk.io',
                logo: 'https://stamp.ochk.io/favicon.svg',
                description: 'OrangeCheck family — identity, confidentiality, voting, and provenance primitives on Bitcoin.',
                sameAs: [
                    'https://github.com/orangecheck',
                    'https://ochk.io',
                    'https://lock.ochk.io',
                    'https://vote.ochk.io',
                    'https://stamp.ochk.io',
                ],
            },
            {
                '@context': 'https://schema.org',
                '@type': 'SoftwareApplication',
                name: 'OC Stamp',
                description: 'Bitcoin-identity-bound content attestation with block-anchored priority.',
                url: 'https://stamp.ochk.io/',
                applicationCategory: 'SecurityApplication',
                operatingSystem: 'Web, Node.js',
                offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
            },
        ];
        const built = [
            webSite(STAMP, { search: '/verify?q={search_term_string}' }),
            organization({
                name: 'OrangeCheck',
                url: 'https://ochk.io',
                logo: 'https://stamp.ochk.io/favicon.svg',
                description: 'OrangeCheck family — identity, confidentiality, voting, and provenance primitives on Bitcoin.',
                sameAs: served[1]!.sameAs as string[],
            }),
            softwareApplication(STAMP, {
                name: 'OC Stamp',
                description: 'Bitcoin-identity-bound content attestation with block-anchored priority.',
                url: '/',
                applicationCategory: 'SecurityApplication',
                operatingSystem: 'Web, Node.js',
            }),
        ];
        // Byte-equal, key order included.
        expect(jsonLd(built)).toBe(jsonLd(served));
    });

    it('webPage resolves its url against the site and adds no non-schema keys', () => {
        expect(webPage(STAMP, { name: 'Create a stamp — OC Stamp', description: 'd', url: '/create' })).toEqual({
            '@context': 'https://schema.org',
            '@type': 'WebPage',
            name: 'Create a stamp — OC Stamp',
            description: 'd',
            url: 'https://stamp.ochk.io/create',
        });
    });

    it('a page node needs its url: no fallback to a root that may redirect', () => {
        // @ts-expect-error url is required
        expect(() => webPage(STAMP, { name: 'x' })).toThrow(TypeError);
    });

    it('a search template must carry the placeholder', () => {
        expect(() => webSite(STAMP, { search: '/verify' })).toThrow(TypeError);
        expect(webSite(STAMP).potentialAction).toBeUndefined();
    });
});
