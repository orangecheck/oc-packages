import { OG_SIZE, OgCard, ogFonts } from '@orangecheck/app-design/og';
import type { NextApiRequest, NextApiResponse } from 'next';
// The .js suffix: next has no exports map, so Node's ESM loader needs the file name.
import { ImageResponse } from 'next/og.js';
import type { ReactNode } from 'react';

export interface OgCardOptions {
    /** Headline when the request has no `?title=`. */
    defaultTitle: string;
    /** At the foot, e.g. `stamp.ochk.io`. */
    host: string;
    /** The site's word beside the lockup, e.g. `stamp`. Default: `wordmark` without its `oc·`. */
    product?: string;
    /** The accent line above the title, e.g. `OC Stamp`. Default: from `wordmark`. */
    eyebrow?: string;
    /** `ink` (default) or `paper`. */
    tone?: 'ink' | 'paper';
    /** A longer `?title=` is cut, so one request cannot ask for an unbounded render. Default 200. */
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

/** The title a request asks for, or the default; cut to the limit. */
export function ogTitle(url: string | undefined, opts: Pick<OgCardOptions, 'defaultTitle' | 'maxTitleLength'>): string {
    const { searchParams } = new URL(url ?? '/', 'http://og.invalid');
    const title = searchParams.get('title') ?? opts.defaultTitle;
    const max = opts.maxTitleLength ?? 200;
    return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}

/** The eyebrow a request names (`?eyebrow=`), cut to 80 characters; otherwise the site's. */
export function ogEyebrow(url: string | undefined): string | undefined {
    const eyebrow = new URL(url ?? '/', 'http://og.invalid').searchParams.get('eyebrow')?.trim();
    if (!eyebrow) return undefined;
    return eyebrow.length > 80 ? `${eyebrow.slice(0, 79)}…` : eyebrow;
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
        const card = ogCardProps(opts, ogTitle(req.url, opts), ogEyebrow(req.url));
        const image = new ImageResponse(<OgCard {...card} />, { ...OG_SIZE, fonts: ogFonts() });
        const body = Buffer.from(await image.arrayBuffer());
        image.headers.forEach((value, key) => res.setHeader(key, value));
        res.status(image.status).send(body);
    };
}
