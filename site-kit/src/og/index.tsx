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

/** The card a request names by `?page=<key>`, when the site issues one: an own key of `cards` only. */
function issued(url: string | undefined, cards: OgCardOptions['cards']): { title: string; eyebrow?: string } | undefined {
    if (!cards) return undefined;
    const key = new URL(url ?? '/', 'http://og.invalid').searchParams.get('page');
    if (key === null || !Object.prototype.hasOwnProperty.call(cards, key)) return undefined;
    const entry = cards[key]!;
    return typeof entry === 'string' ? { title: entry } : { title: cardHeadline(entry), eyebrow: entry.eyebrow };
}

/** The headline for a request: the card it names from `cards`, else the default; cut to the limit. Never the request's own text. */
export function ogTitle(url: string | undefined, opts: Pick<OgCardOptions, 'defaultTitle' | 'maxTitleLength' | 'cards'>): string {
    const title = issued(url, opts.cards)?.title ?? opts.defaultTitle;
    const max = opts.maxTitleLength ?? 200;
    return title.length > max ? `${title.slice(0, max - 1)}…` : title;
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

/**
 * A Pages API route that renders app-design's share card on the node runtime.
 *
 * next 16 deprecates the edge runtime, and `runtime: 'edge'` selects the
 * handler contract: without it a returned Response is ignored. So the image
 * is rendered as a Response and copied onto `res`, headers included.
 */
export function createOgHandler(opts: OgCardOptions) {
    return async function ogHandler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
        const card = ogCardProps(opts, ogTitle(req.url, opts), issued(req.url, opts.cards)?.eyebrow);
        const image = new ImageResponse(<OgCard {...card} />, { ...OG_SIZE, fonts: ogFonts() });
        const body = Buffer.from(await image.arrayBuffer());
        image.headers.forEach((value, key) => res.setHeader(key, value));
        res.status(image.status).send(body);
    };
}
