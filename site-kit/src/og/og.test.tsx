import { OG_SIZE, OgCard, ogFonts } from '@orangecheck/app-design/og';
import type { NextApiRequest, NextApiResponse } from 'next';
import { ImageResponse } from 'next/og.js';
import type { ComponentProps } from 'react';
import { describe, expect, it } from 'vitest';

import { recorder } from '../auth/fixtures';
import { createOgHandler, ogTitle, type OgCardOptions } from './index';

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

    it('takes the card fields when a site names them', async () => {
        const out = await handled({ defaultTitle: 'x', host: 'vault.ochk.io', product: 'vault', eyebrow: 'Vault', tone: 'paper', cards: { hi: 'hi' } }, '/api/og?page=hi');
        const want = await card({ title: 'hi', product: 'vault', eyebrow: 'Vault', host: 'vault.ochk.io', tone: 'paper' });
        expect((out.body as Buffer).equals(want)).toBe(true);
    }, 30_000);
});
