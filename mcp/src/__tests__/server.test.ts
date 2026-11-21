import { Client } from '@modelcontextprotocol/client';
import { InMemoryTransport } from '@modelcontextprotocol/server';
import { afterEach, describe, expect, it } from 'vitest';

import { Docs } from '../docs.js';
import type { FetchLike } from '../http.js';
import { createServer } from '../server.js';
import { EXAMPLES_TOKEN, FIXTURE_KEY, lookupWith, replay, respond } from './replay.js';

const open: Client[] = [];
afterEach(async () => {
    await Promise.all(open.splice(0).map((c) => c.close()));
});

async function connect(fetch: FetchLike = replay().fetch): Promise<Client> {
    const server = createServer({ fetch, lookup: lookupWith(), docs: new Docs({ fetch }) });
    const [a, b] = InMemoryTransport.createLinkedPair();
    const client = new Client({ name: 'test', version: '0.0.0' });
    await server.connect(a);
    await client.connect(b);
    open.push(client);
    return client;
}

const textOf = (r: { content?: unknown }) =>
    ((r.content ?? []) as { type: string; text?: string }[]).map((c) => (c.type === 'text' ? c.text : '')).join('\n');

describe('the server over MCP', () => {
    it('lists seven read-only tools, the docs resources and two prompts', async () => {
        const client = await connect();
        const { tools } = await client.listTools();
        expect(tools.map((t) => t.name).sort()).toEqual([
            'check_domain_verification',
            'check_setup',
            'get_project_config',
            'integration_guide',
            'list_docs',
            'read_doc',
            'search_docs',
        ]);
        for (const t of tools) expect(t.annotations?.readOnlyHint, t.name).toBe(true);
        const guide = tools.find((t) => t.name === 'integration_guide')!;
        expect((guide.inputSchema.properties as Record<string, { enum?: string[] }>).stack!.enum).toEqual([
            'nextjs-pages',
            'nextjs-app',
            'express',
            'hono',
            'python',
            'godot',
        ]);
        const { prompts } = await client.listPrompts();
        expect(prompts.map((p) => p.name).sort()).toEqual(['pre_launch_check', 'set_up_sign_in']);
        const { resources } = await client.listResources();
        expect(resources.map((r) => r.uri)).toEqual(['orangecheck://docs/llms.txt']);
        const { resourceTemplates } = await client.listResourceTemplates();
        expect(resourceTemplates.map((r) => r.uriTemplate)).toEqual(['orangecheck://docs/{+route}']);
    });

    it('answers each tool from the recorded endpoints', async () => {
        const client = await connect();
        const call = async (name: string, args: Record<string, unknown>) => {
            const r = await client.callTool({ name, arguments: args });
            expect(r.isError ?? false, `${name}: ${textOf(r)}`).toBe(false);
            return textOf(r);
        };
        expect(await call('search_docs', { query: 'withOcAuth projectKey' })).toMatch(/^\d+ pages? for "withOcAuth projectKey":\n\n1\. /);
        expect(await call('list_docs', { section: 'integration' })).toContain('- Sign in from an app or a game: https://ochk.io/docs/integration/native-sign-in');
        expect(await call('read_doc', { page: 'https://ochk.io/docs/me/quickstart#5--go-live' })).toMatch(
            /^Source: https:\/\/ochk\.io\/docs\/me\/quickstart#5--go-live \(https:\/\/ochk\.io\/docs\/me\/quickstart\.md\)\n\n### 5 · go live/
        );
        expect(await call('get_project_config', { project_key: FIXTURE_KEY })).toContain('- Domain verified: yes');
        expect(await call('check_domain_verification', { domain: 'oc-onboarding-examples.vercel.app', token: EXAMPLES_TOKEN })).toContain(
            'Found the token through the meta tag.'
        );
        expect(await call('check_setup', { site: 'https://oc-onboarding-examples.vercel.app', project_key: FIXTURE_KEY })).toContain(
            '- PASS Cross-Origin-Opener-Policy:'
        );
        expect(await call('integration_guide', { stack: 'python' })).toContain('# Sign in with orangecheck: Python');
    });

    it('reads a docs page as a resource, and fills a prompt', async () => {
        const client = await connect();
        const res = await client.readResource({ uri: 'orangecheck://docs/me/require-bond' });
        const first = res.contents[0] as { text: string };
        expect(first.text.startsWith('Source: https://ochk.io/docs/me/require-bond\n\n# ')).toBe(true);
        const p = await client.getPrompt({ name: 'set_up_sign_in', arguments: { stack: 'express', site: 'https://yourapp.example' } });
        const msg = (p.messages[0]!.content as { text: string }).text;
        expect(msg).toContain('Call integration_guide with stack "express"');
        expect(msg).toContain('run check_setup on https://yourapp.example');
    });

    it('explains, as a tool error, when the docs are down', async () => {
        const { fetch } = replay({
            'https://ochk.io/docs/llms-full.txt': respond(503, 'Service Unavailable'),
            'https://ochk.io/docs/llms.txt': respond(503, 'Service Unavailable'),
        });
        const client = await connect(fetch);
        const r = await client.callTool({ name: 'search_docs', arguments: { query: 'withOcAuth' } });
        expect(r.isError).toBe(true);
        expect(textOf(r)).toBe(
            "https://ochk.io/docs/llms-full.txt answered 503. It may be down or unreachable from here; try again in a minute. Until it answers, open https://ochk.io/docs in a browser. Don't write orangecheck code from memory: the docs are the source."
        );
    });

    it('explains, as a tool error, when me.ochk.io is down', async () => {
        const down = respond(503, '<html>down</html>');
        const { fetch } = replay({
            [`https://me.ochk.io/api/integrator/${FIXTURE_KEY}/identity`]: down,
            [`https://me.ochk.io/api/integrator/${FIXTURE_KEY}/sign-in`]: down,
            [`https://me.ochk.io/api/integrator/${FIXTURE_KEY}/native`]: down,
            [`https://me.ochk.io/api/integrator/config?project_key=${FIXTURE_KEY}`]: down,
        });
        const client = await connect(fetch);
        const r = await client.callTool({ name: 'get_project_config', arguments: { project_key: FIXTURE_KEY } });
        expect(r.isError).toBe(true);
        expect(textOf(r)).toMatch(/^me\.ochk\.io could not be read: https:\/\/me\.ochk\.io\/api\/integrator\/pk_test_FIXTURE\/identity answered 503 with a body that is not JSON\..* Try again in a minute\.$/);
    });

    it('refuses to read anything but the docs', async () => {
        const { fetch, calls } = replay();
        const client = await connect(fetch);
        const r = await client.callTool({ name: 'read_doc', arguments: { page: 'https://evil.example/docs/x' } });
        expect(r.isError).toBe(true);
        expect(textOf(r)).toBe('Only the orangecheck docs at https://ochk.io/docs can be read; "https://evil.example/docs/x" is elsewhere.');
        expect(calls).toEqual([]);
    });

    it('refuses a stack it has no guide for, through the schema', async () => {
        const client = await connect();
        const r = await client.callTool({ name: 'integration_guide', arguments: { stack: 'rails' } }).catch((e: Error) => ({ isError: true, content: [{ type: 'text', text: e.message }] }));
        expect(r.isError).toBe(true);
        expect(textOf(r)).toMatch(/stack/);
    });
});
