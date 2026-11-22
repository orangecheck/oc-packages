import { createServer } from 'node:http';
import type { AddressInfo, LookupFunction } from 'node:net';

import { fetch as undiciFetch } from 'undici';
import { describe, expect, it } from 'vitest';

import { pinnedFetch, pinnedLookup } from '../pinned.js';

const ask = (lookup: LookupFunction, all: boolean) =>
    new Promise<unknown>((resolve, reject) =>
        lookup('anything.example', { all }, (err, address, family) => (err ? reject(err) : resolve(all ? address : { address, family })))
    );

describe('pinnedLookup', () => {
    it('answers any name with the checked addresses, first or all, and nothing else', async () => {
        const lookup = pinnedLookup(['93.184.216.10', '2606:2800:220:1::10']);
        expect(await ask(lookup, false)).toEqual({ address: '93.184.216.10', family: 4 });
        expect(await ask(lookup, true)).toEqual([
            { address: '93.184.216.10', family: 4 },
            { address: '2606:2800:220:1::10', family: 6 },
        ]);
    });
});

describe('pinnedFetch', () => {
    it('connects to the pinned address and never resolves the URL\'s host', async () => {
        const seen: { host?: string; url?: string }[] = [];
        const server = createServer((req, res) => {
            seen.push({ host: req.headers.host, url: req.url });
            res.end('pinned');
        });
        await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
        const { port } = server.address() as AddressInfo;
        // .test never resolves (RFC 2606), so the request can only arrive through the pinned address.
        const url = `http://rebind.test:${port}/hello`;
        const pinned = pinnedFetch(['127.0.0.1']);
        try {
            await expect(undiciFetch(url, { signal: AbortSignal.timeout(5_000) })).rejects.toThrow();
            expect(seen).toEqual([]);
            const res = await pinned.fetch(url, { signal: AbortSignal.timeout(5_000) });
            expect(res.status).toBe(200);
            expect(await res.text()).toBe('pinned');
            expect(seen).toEqual([{ host: `rebind.test:${port}`, url: '/hello' }]);
        } finally {
            await pinned.close();
            await new Promise((resolve) => server.close(resolve));
        }
    });

    it('refuses to connect with no checked address', () => {
        expect(() => pinnedFetch([])).toThrow('no address to connect to');
    });
});
