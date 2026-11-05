import { OG_SIZE, OgCard, ogFonts } from '@orangecheck/app-design/og';
import type { NextApiRequest, NextApiResponse } from 'next';
// The .js suffix: next has no exports map, so Node's ESM loader needs the file name.
import { ImageResponse } from 'next/og.js';
import type { ReactNode } from 'react';

import { cardHeadline, type OgCardEntry } from '../seo/meta';

export type { OgCardEntry } from '../seo/meta';

export interface OgCardOptions {
    /** The default card's headline: every request that names no card of `cards` gets it. */
    defaultTitle: string;
    /**
     * The cards this site issues, by page key: `?page=<key>` draws that card.
     * Nothing a request carries is ever drawn as text, so with no `cards` every
     * request gets the default card.
     */
    cards?: Readonly<Record<string, OgCardEntry>>;
    /** At the foot, e.g. `stamp.ochk.io`. */
    host: string;
    /** The site's word beside the lockup, e.g. `stamp`. Default: `wordmark` without its `oc·`. */
    product?: string;
    /** The accent line above the title, e.g. `OC Stamp`. Default: from `wordmark`. */
    eyebrow?: string;
    /** `ink` (default) or `paper`. */
    tone?: 'ink' | 'paper';
    /**
     * The cards this site looks up, by query name: `{ project: (slug) => … }`
     * draws a project's card for `?project=<slug>`, that query alone being its
     * one URL. Each lookup says how long its answer is kept, since a looked-up
     * card can change or be taken down; one that throws answers the default
     * card with `no-store`, so a failed read is never kept. Not `page`, the
     * query of `cards`.
     */
    resolve?: Readonly<Record<string, (value: string) => Promise<OgLookup>>>;
    /**
     * The site's Next `basePath`, e.g. `/docs`. Next takes it off `req.url`, so
     * a 308 puts it back on the URL it sends a request to. Default: none.
     */
    basePath?: string;
    /** A card headline longer than this is cut. Default 200. */
    maxTitleLength?: number;
    /** e.g. `oc·stamp`: gives `product` and `eyebrow` when they are not set. */
    wordmark?: string;
    /** @deprecated Since 0.4.0 the card shows the family lockup, not a glyph of the site's own. Ignored. */
    mark?: ReactNode;
    /** @deprecated Since 0.4.0. Ignored. */
    badge?: string;
    /** @deprecated Since 0.4.0. Ignored. */
    footer?: string;
    /** @deprecated Since 0.4.0. Ignored. */
    markTop?: number;
    /** @deprecated Since 0.4.0. Ignored. */
    wordmarkLeft?: number;
}

/** What a site's lookup answers for one value, e.g. a project by its slug. */
export interface OgLookup {
    /** The card to draw, or null for the default card: a thing removed, hidden or not found. */
    card: OgCardEntry | null;
    /** This answer's Cache-Control, e.g. `public, max-age=300, s-maxage=3600, stale-while-revalidate=60`. */
    cacheControl: string;
}

function entryCard(entry: OgCardEntry): { title: string; eyebrow?: string } {
    return typeof entry === 'string' ? { title: entry } : { title: cardHeadline(entry), eyebrow: entry.eyebrow };
}

/** The card a request names by `?page=<key>`, when the site issues one: an own key of `cards` only. */
function issued(url: string | undefined, cards: OgCardOptions['cards']): { title: string; eyebrow?: string } | undefined {
    if (!cards) return undefined;
    const key = new URL(url ?? '/', 'http://og.invalid').searchParams.get('page');
    if (key === null || !Object.prototype.hasOwnProperty.call(cards, key)) return undefined;
    return entryCard(cards[key]!);
}

function cut(title: string, max = 200): string {
    return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}

/** The headline for a request: the card it names from `cards`, else the default; cut to the limit. Never the request's own text. */
export function ogTitle(url: string | undefined, opts: Pick<OgCardOptions, 'defaultTitle' | 'maxTitleLength' | 'cards'>): string {
    return cut(issued(url, opts.cards)?.title ?? opts.defaultTitle, opts.maxTitleLength);
}

/** What app-design's `OgCard` is given for these options: `oc·stamp` reads as `stamp` under `OC Stamp`. */
function ogCardProps(opts: OgCardOptions, title: string, asked?: string) {
    const word = opts.wordmark?.replace(/^oc\s*[·.\-\s]\s*/i, '');
    const product = opts.product ?? word;
    const eyebrow =
        asked ??
        opts.eyebrow ??
        (word && word !== opts.wordmark ? `OC ${word.charAt(0).toUpperCase()}${word.slice(1)}` : undefined);
    return { title, product, eyebrow, host: opts.host.toLowerCase(), tone: opts.tone ?? 'ink' } as const;
}

/** A card is the same for a whole deployment: kept a day by the browser and the edge. */
const CARD_CACHE = 'public, max-age=86400, s-maxage=86400';

/** A failed lookup's default card stands in for a card that may exist, so no one keeps it. */
const FAILED_LOOKUP_CACHE = 'no-store';

/**
 * The query of the one URL of the card a request names, as `generateMetaTags`
 * builds it: `?page=<key>` for a card the site issues, else `?<name>=<value>`
 * for the first of its lookups the request gives a value, else none.
 */
function canonical(url: URL, opts: OgCardOptions): { query: string; lookup?: readonly [string, string] } {
    const key = url.searchParams.get('page');
    if (opts.cards && key !== null && Object.prototype.hasOwnProperty.call(opts.cards, key)) {
        return { query: `?page=${encodeURIComponent(key)}` };
    }
    for (const name of Object.keys(opts.resolve ?? {})) {
        const value = url.searchParams.get(name);
        if (value) return { query: `?${encodeURIComponent(name)}=${encodeURIComponent(value)}`, lookup: [name, value] };
    }
    return { query: '' };
}

/**
 * A Pages API route that renders app-design's share card on the node runtime.
 *
 * next 16 deprecates the edge runtime, and `runtime: 'edge'` selects the
 * handler contract: without it a returned Response is ignored. So the image
 * is rendered as a Response and copied onto `res`, headers included, with the
 * card's own Cache-Control over next/og's `max-age=0`.
 *
 * Each card has one URL. Any other query is sent there with a 308, before any
 * lookup, so a query string cannot make the site render a card the edge
 * already holds: a site renders at most one image per card it issues, plus its
 * default, per edge region and deployment, and one per looked-up card for as
 * long as its lookup says to keep it.
 */
export function createOgHandler(opts: OgCardOptions) {
    if (opts.resolve && Object.prototype.hasOwnProperty.call(opts.resolve, 'page')) {
        throw new TypeError('site-kit: resolve cannot name `page`, the query of `cards`');
    }
    if (opts.basePath !== undefined && !/^(\/[\w.~-]+)+$/.test(opts.basePath)) {
        throw new TypeError(`site-kit: basePath must be a path such as /docs, got ${JSON.stringify(opts.basePath)}`);
    }
    return async function ogHandler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
        const url = new URL(req.url ?? '/', 'http://og.invalid');
        const { query, lookup } = canonical(url, opts);
        if (url.search !== query) {
            res.setHeader('Cache-Control', CARD_CACHE);
            res.setHeader('Location', `${opts.basePath ?? ''}${url.pathname}${query}`);
            res.status(308).end();
            return;
        }
        let drawn = issued(req.url, opts.cards);
        let cache = CARD_CACHE;
        if (lookup) {
            const [name, value] = lookup;
            try {
                const found = await opts.resolve![name]!(value);
                drawn = found.card === null ? undefined : entryCard(found.card);
                cache = found.cacheControl;
            } catch (err) {
                console.error(`[og] the ${name} lookup failed, so the default card: ${err instanceof Error ? err.message : String(err)}`);
                cache = FAILED_LOOKUP_CACHE;
            }
        }
        const card = ogCardProps(opts, cut(drawn?.title ?? opts.defaultTitle, opts.maxTitleLength), drawn?.eyebrow);
        const image = new ImageResponse(<OgCard {...card} />, { ...OG_SIZE, fonts: ogFonts() });
        const body = Buffer.from(await image.arrayBuffer());
        image.headers.forEach((value, key) => res.setHeader(key, value));
        res.setHeader('Cache-Control', cache);
        res.status(image.status).send(body);
    };
}
