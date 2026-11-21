import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { describe, expect, it } from 'vitest';

import { STACKS } from '../guide.js';
import { createServer } from '../server.js';

// Every tool against the real ochk.io/docs and me.ochk.io. OC_MCP_LIVE=1 runs it (yarn test:live);
// OC_MCP_LIVE_PROJECT_KEY and OC_MCP_LIVE_SITE point it at a real project and its site.
const live = process.env.OC_MCP_LIVE === '1';
const projectKey = process.env.OC_MCP_LIVE_PROJECT_KEY;
const site = process.env.OC_MCP_LIVE_SITE ?? 'https://ochk.app';

const textOf = (r: { content?: unknown }) =>
    ((r.content ?? []) as { type: string; text?: string }[]).map((c) => c.text ?? '').join('\n');

describe.skipIf(!live)('live: every tool against the real endpoints', () => {
    it('answers', { timeout: 120_000 }, async () => {
        const server = createServer();
        const [a, b] = InMemoryTransport.createLinkedPair();
        const client = new Client({ name: 'live-smoke', version: '0.0.0' });
        await server.connect(a);
        await client.connect(b);
        const call = async (name: string, args: Record<string, unknown>) => {
            const r = await client.callTool({ name, arguments: args });
            const t = textOf(r);
            expect(r.isError ?? false, `${name}: ${t}`).toBe(false);
            return t;
        };
        try {
            expect(await call('search_docs', { query: 'oc-domain-verify' })).toContain('https://ochk.io/docs/me/quickstart');
            expect(await call('list_docs', {})).toContain('## /docs/me');
            expect(await call('read_doc', { page: '/me/quickstart', section: '5 · go live' })).toContain('oc-verify=<token>');
            // Every guide resolves against the docs as they are today: this is the drift alarm.
            for (const stack of STACKS) {
                const g = await call('integration_guide', { stack });
                expect(g, stack).not.toContain('WARNING');
            }
            const unknown = await client.callTool({ name: 'get_project_config', arguments: { project_key: 'pk_test_doesnotexist000' } });
            expect(textOf(unknown)).toContain('No project has the key pk_test_doesnotexist000');
            if (projectKey) expect(await call('get_project_config', { project_key: projectKey })).toContain('## Identity');
            expect(await call('check_domain_verification', { domain: 'ochk.io' })).toContain('oc-verify=');
            expect(await call('check_setup', { site, ...(projectKey ? { project_key: projectKey } : {}) })).toContain('## By hand');
        } finally {
            await client.close();
        }
    });
});
