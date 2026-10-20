import type { NextApiRequest, NextApiResponse } from 'next';
// The .js suffix: next has no exports map, so Node's ESM loader needs the file name.
import { ImageResponse } from 'next/og.js';
import type { ReactElement, ReactNode } from 'react';

export interface OgCardOptions {
    /** The site's glyph, usually an inline `<svg>`. */
    mark: ReactNode;
    /** e.g. `oc·stamp`. */
    wordmark: string;
    /** The small orange line under the wordmark, e.g. `V1 · PREVIEW`. */
    badge: string;
    /** Headline when the request has no `?title=`; `\n` breaks lines. */
    defaultTitle: string;
    /** Footer left, e.g. `STAMP.OCHK.IO`. */
    host: string;
    /** Footer right, e.g. `§ AN ORANGECHECK PROTOCOL`. */
    footer: string;
    /** Distance of the mark from the top. Default 150. */
    markTop?: number;
    /** Left margin of the wordmark block. Default 270. */
    wordmarkLeft?: number;
    /** A longer `?title=` is cut, so one request cannot ask for an unbounded render. Default 200. */
    maxTitleLength?: number;
}

const INK = '#0b0909';
const PAPER = '#f5efe8';
const ORANGE = '#f97316';

/** The title a request asks for, or the default; cut to the limit. */
export function ogTitle(url: string | undefined, opts: Pick<OgCardOptions, 'defaultTitle' | 'maxTitleLength'>): string {
    const { searchParams } = new URL(url ?? '/', 'http://og.invalid');
    const title = searchParams.get('title') ?? opts.defaultTitle;
    const max = opts.maxTitleLength ?? 200;
    return title.length > max ? `${title.slice(0, max - 1)}…` : title;
}

/** The family 1200×630 card. */
export function OgCard({ opts, title }: { opts: OgCardOptions; title: string }): ReactElement {
    return (
        <div
            style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                background: INK,
                position: 'relative',
                fontFamily: 'monospace',
                color: PAPER,
                padding: 72,
            }}
        >
            <div
                style={{
                    position: 'absolute',
                    inset: 0,
                    backgroundImage:
                        'linear-gradient(to right, #1e1a19 1px, transparent 1px), linear-gradient(to bottom, #1e1a19 1px, transparent 1px)',
                    backgroundSize: '40px 40px',
                    opacity: 1,
                }}
            />
            <div
                style={{
                    position: 'absolute',
                    top: opts.markTop ?? 150,
                    left: 72,
                    display: 'flex',
                    alignItems: 'center',
                }}
            >
                {opts.mark}
            </div>

            <div
                style={{
                    marginLeft: opts.wordmarkLeft ?? 270,
                    marginTop: 90,
                    display: 'flex',
                    flexDirection: 'column',
                }}
            >
                <div style={{ fontSize: 96, fontWeight: 700, letterSpacing: -3, lineHeight: 1 }}>{opts.wordmark}</div>
                <div
                    style={{
                        fontSize: 24,
                        fontWeight: 600,
                        letterSpacing: 6,
                        textTransform: 'uppercase',
                        color: ORANGE,
                        marginTop: 20,
                    }}
                >
                    {opts.badge}
                </div>
            </div>

            <div
                style={{
                    position: 'absolute',
                    left: 72,
                    top: 400,
                    fontSize: 40,
                    fontWeight: 700,
                    letterSpacing: -1.2,
                    lineHeight: 1.22,
                    whiteSpace: 'pre-line',
                }}
            >
                {title}
            </div>

            <div
                style={{
                    position: 'absolute',
                    left: 72,
                    right: 72,
                    bottom: 52,
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    borderTop: '1px solid #2a2524',
                    paddingTop: 22,
                    fontSize: 18,
                    fontWeight: 600,
                    letterSpacing: 3,
                    color: '#a89f97',
                }}
            >
                <span>{opts.host}</span>
                <span>{opts.footer}</span>
            </div>
        </div>
    );
}

/**
 * A Pages API route that renders the card on the node runtime.
 *
 * next 16 deprecates the edge runtime, and `runtime: 'edge'` selects the
 * handler contract: without it a returned Response is ignored. So the image
 * is rendered as a Response and copied onto `res`, headers included.
 */
export function createOgHandler(opts: OgCardOptions) {
    return async function ogHandler(req: NextApiRequest, res: NextApiResponse): Promise<void> {
        const image = new ImageResponse(<OgCard opts={opts} title={ogTitle(req.url, opts)} />, {
            width: 1200,
            height: 630,
        });
        const body = Buffer.from(await image.arrayBuffer());
        image.headers.forEach((value, key) => res.setHeader(key, value));
        res.status(image.status).send(body);
    };
}
