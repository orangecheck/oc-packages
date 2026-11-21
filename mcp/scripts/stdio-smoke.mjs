#!/usr/bin/env node
// Starts the built server over stdio, as an MCP client does, and calls every tool against the live endpoints.
// node scripts/stdio-smoke.mjs [project_key] [site]   (run `yarn build` first)
import { Client } from '@modelcontextprotocol/client';
import { StdioClientTransport } from '@modelcontextprotocol/client/stdio';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const cli = join(dirname(fileURLToPath(import.meta.url)), '..', 'dist', 'cli.js');
const [projectKey, site = 'https://oc-onboarding-examples.vercel.app'] = process.argv.slice(2);
const SHOW = Number(process.env.SHOW ?? 900);

const transport = new StdioClientTransport({ command: process.execPath, args: [cli], stderr: 'inherit' });
const client = new Client({ name: 'stdio-smoke', version: '0.0.0' });
await client.connect(transport);
const info = client.getServerVersion();
console.log(`connected over stdio to ${info?.name} ${info?.version}, pid ${transport.pid}`);

const { tools } = await client.listTools();
console.log(`tools/list: ${tools.map((t) => t.name).join(', ')}`);
const { prompts } = await client.listPrompts();
console.log(`prompts/list: ${prompts.map((p) => p.name).join(', ')}`);

const calls = [
    ['search_docs', { query: 'oc-domain-verify meta tag', limit: 3 }],
    ['list_docs', { section: 'integration' }],
    ['read_doc', { page: 'https://ochk.io/docs/me/quickstart#5--go-live' }],
    ['get_project_config', { project_key: projectKey ?? 'pk_test_doesnotexist000' }],
    ['check_domain_verification', { domain: 'ochk.io' }],
    ['check_setup', { site, ...(projectKey ? { project_key: projectKey } : {}) }],
    ['integration_guide', { stack: 'nextjs-pages' }],
];
let failed = 0;
for (const [name, args] of calls) {
    const started = Date.now();
    const r = await client.callTool({ name, arguments: args });
    const text = r.content.map((c) => c.text ?? '').join('\n');
    if (r.isError) failed++;
    console.log(`\n=== ${name} ${JSON.stringify(args)} -> ${r.isError ? 'ERROR' : 'ok'}, ${text.length} chars, ${Date.now() - started} ms`);
    console.log(text.length > SHOW ? `${text.slice(0, SHOW)}\n[... ${text.length - SHOW} more characters]` : text);
}
const res = await client.readResource({ uri: 'orangecheck://docs/me/require-bond' });
console.log(`\n=== resources/read orangecheck://docs/me/require-bond -> ${res.contents[0].text.split('\n').slice(0, 3).join(' | ')}`);
await client.close();
process.exit(failed ? 1 : 0);
