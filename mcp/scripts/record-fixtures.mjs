#!/usr/bin/env node
// Records the real answers the tests replay: node scripts/record-fixtures.mjs [project_key]
// The project key, when given, is replaced by pk_test_FIXTURE in what is written.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'src', '__tests__', 'fixtures');
const DOCS = 'https://ochk.io/docs';
const ROUTES = [
    '/integration',
    '/integration/native-sign-in',
    '/integration/reference',
    '/integration/sign-in-button',
    '/me/integrations',
    '/me/quickstart',
    '/me/require-bond',
    '/me/sdk',
    '/sdk/python',
];
const KEEP_HEADERS = ['content-type', 'location', 'cross-origin-opener-policy', 'content-security-policy', 'cache-control'];
const FIXTURE_KEY = 'pk_test_FIXTURE';
const UNKNOWN_KEY = 'pk_test_doesnotexist000';
const realKey = process.argv[2];

const manifest = {};
const write = (rel, body) => {
    const p = join(OUT, rel);
    mkdirSync(dirname(p), { recursive: true });
    writeFileSync(p, body);
};
const scrub = (s) => (realKey ? s.split(realKey).join(FIXTURE_KEY) : s);

async function record(url, { file, maxBytes = 256 * 1024, accept = '*/*' } = {}) {
    const res = await fetch(url, { redirect: 'manual', headers: { 'User-Agent': 'orangecheck-mcp fixture recorder', Accept: accept } });
    const headers = {};
    for (const h of KEEP_HEADERS) {
        const v = res.headers.get(h);
        if (v !== null) headers[h] = v;
    }
    let body = scrub(await res.text());
    if (Buffer.byteLength(body) > maxBytes) body = body.slice(0, maxBytes);
    const entry = { status: res.status, headers };
    if (file) {
        write(file, body);
        entry.bodyFile = file;
    } else entry.body = body;
    manifest[scrub(url)] = entry;
    console.log(res.status, scrub(url));
    return body;
}

const mdPath = (route) => `docs/pages${route}.md`;

await record(`${DOCS}/llms.txt`, { file: 'docs/llms.txt', maxBytes: 4 * 1024 * 1024 });
const full = await (await fetch(`${DOCS}/llms-full.txt`)).text();
const first = full.indexOf('\n---\n\nURL: ');
write('docs/llms-full-head.txt', full.slice(0, first + 1));
for (const route of ROUTES) {
    const md = await record(`${DOCS}${route}.md`, { file: mdPath(route), maxBytes: 4 * 1024 * 1024 });
    // llms-full.txt carries the same text as each .md copy: the tests rebuild it from these.
    const marker = `---\n\nURL: ${DOCS}${route}\n\n`;
    const at = full.indexOf(marker);
    if (at === -1) throw new Error(`${route} is not in llms-full.txt`);
    const next = full.indexOf('\n---\n\nURL: ', at + marker.length);
    const slice = full.slice(at + marker.length, next === -1 ? full.length : next + 1);
    if (slice.trimEnd() !== md.trimEnd()) throw new Error(`${route}: llms-full.txt and the .md copy differ`);
}
await record(`${DOCS}/no-such-page-for-fixtures.md`, { maxBytes: 512 });

const ME = 'https://me.ochk.io/api/integrator';
for (const key of [realKey, UNKNOWN_KEY].filter(Boolean)) {
    await record(`${ME}/${key}/identity`);
    await record(`${ME}/${key}/sign-in`);
    await record(`${ME}/${key}/native`);
    await record(`${ME}/config?project_key=${key}`);
}

const DOH = 'https://cloudflare-dns.com/dns-query';
for (const name of ['ochk.io', 'oc-onboarding-examples.vercel.app']) await record(`${DOH}?name=${encodeURIComponent(name)}&type=TXT`, { accept: 'application/dns-json' });
await record('https://oc-onboarding-examples.vercel.app/');
await record('http://oc-onboarding-examples.vercel.app/');
await record('https://www.ochk.io/');
await record('http://ochk.io/');

write('http.json', JSON.stringify({ recorded: new Date().toISOString(), responses: manifest }, null, 4) + '\n');
console.log(`wrote ${Object.keys(manifest).length} responses to ${OUT}`);
