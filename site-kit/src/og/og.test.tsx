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

describe('ogTitle', () => {
    it('uses ?title= or the default', () => {
        expect(ogTitle('/api/og?title=hello', STAMP)).toBe('hello');
        expect(ogTitle('/api/og', STAMP)).toBe(STAMP.defaultTitle);
        expect(ogTitle(undefined, STAMP)).toBe(STAMP.defaultTitle);
    });

    it('cuts a title past the limit so one request cannot ask for an unbounded render', () => {
        const t = ogTitle(`/api/og?title=${'a'.repeat(5000)}`, STAMP);
        expect(t).toHaveLength(200);
        expect(t.endsWith('…')).toBe(true);
        expect(ogTitle(`/api/og?title=${'a'.repeat(20)}`, { ...STAMP, maxTitleLength: 10 })).toBe('aaaaaaaaa…');
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
        const out = await handled(STAMP, '/api/og?title=hi');
        expect(out.status).toBe(200);
        expect(out.headers['content-type']).toBe('image/png');
        const png = out.body as Buffer;
        expect(png.subarray(1, 4).toString('latin1')).toBe('PNG');
        expect(png.readUInt32BE(16)).toBe(1200);
        expect(png.readUInt32BE(20)).toBe(630);
    }, 30_000);

    it("draws app-design's card: a site's 0.3 options read as its word, OC <Verb> and its host", async () => {
        const out = await handled(STAMP, '/api/og?title=hi');
        const want = await card({ title: 'hi', product: 'stamp', eyebrow: 'OC Stamp', host: 'stamp.ochk.io', tone: 'ink' });
        expect((out.body as Buffer).equals(want)).toBe(true);
        const plain = await handled(STAMP, '/api/og');
        expect((plain.body as Buffer).equals(await card({ title: STAMP.defaultTitle, product: 'stamp', eyebrow: 'OC Stamp', host: 'stamp.ochk.io' }))).toBe(true);
    }, 30_000);

    it('takes the card fields when a site names them', async () => {
        const out = await handled({ defaultTitle: 'x', host: 'vault.ochk.io', product: 'vault', eyebrow: 'Vault', tone: 'paper' }, '/api/og?title=hi');
        const want = await card({ title: 'hi', product: 'vault', eyebrow: 'Vault', host: 'vault.ochk.io', tone: 'paper' });
        expect((out.body as Buffer).equals(want)).toBe(true);
    }, 30_000);
});
