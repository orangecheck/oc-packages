import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it, vi } from 'vitest';

import { Docs } from '../docs.js';
import type { FetchLike } from '../http.js';
import { createServer } from '../server.js';
import { EXAMPLES_TOKEN, lookupWith, replay } from './replay.js';

const pins = vi.hoisted(() => [] as string[][]);
const replayed = vi.hoisted(() => ({ fetch: undefined as unknown as FetchLike }));
vi.mock('../pinned.js', () => ({
    pinnedFetch: (addresses: string[]) => {
        pins.push(addresses);
        return { fetch: (input: string, init?: RequestInit) => replayed.fetch(input, init), close: async () => undefined };
    },
}));

describe('createServer without a pin', () => {
    it('reads the site through pinnedFetch, connected to the address the lookup checked', async () => {
        const { fetch } = replay();
        replayed.fetch = fetch;
        const server = createServer({ fetch, lookup: lookupWith(), docs: new Docs({ fetch }) });
        const [a, b] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: 'test', version: '0.0.0' });
        await server.connect(a);
        await client.connect(b);
        try {
            const r = await client.callTool({
                name: 'check_domain_verification',
                arguments: { domain: 'oc-onboarding-examples.vercel.app', token: EXAMPLES_TOKEN },
            });
            expect(r.isError ?? false).toBe(false);
            expect(pins).toEqual([['93.184.216.10']]);
        } finally {
            await client.close();
        }
    });
});
