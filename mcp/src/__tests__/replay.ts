import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { DomainDeps, Lookup, Pin } from '../domain.js';
import type { FetchLike } from '../http.js';

// Recorded answers from the real endpoints (scripts/record-fixtures.mjs), replayed with no network.
const DIR = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');

interface Recorded {
    status: number;
    headers: Record<string, string>;
    body?: string;
    bodyFile?: string;
}

const manifest = JSON.parse(readFileSync(join(DIR, 'http.json'), 'utf8')) as { responses: Record<string, Recorded> };

export const fixture = (rel: string) => readFileSync(join(DIR, rel), 'utf8');

export const FIXTURE_KEY = 'pk_test_FIXTURE';
export const UNKNOWN_KEY = 'pk_test_doesnotexist000';
/** The token oc-onboarding-examples.vercel.app publishes in its meta tag. */
export const EXAMPLES_TOKEN = 'e36045efea5cf9344183b7b24fe09078ad4f834b3c9cff1f';
/** The token ochk.io publishes as a TXT record. */
export const OCHK_TXT_TOKEN = '2dfdd2d9679d75442d3ceef7ae068fc64a8cbb09b638a32b';

/** Routes recorded as .md copies; llms-full.txt is rebuilt from them, as the site builds it from the same text. */
export const RECORDED_ROUTES = Object.keys(manifest.responses)
    .map((u) => /^https:\/\/ochk\.io\/docs(\/.+)\.md$/.exec(u)?.[1])
    .filter((r): r is string => !!r && manifest.responses[`https://ochk.io/docs${r}.md`]!.status === 200);

export function llmsFull(): string {
    const head = fixture('docs/llms-full-head.txt');
    const pages = RECORDED_ROUTES.map((r) => `---\n\nURL: https://ochk.io/docs${r}\n\n${fixture(`docs/pages${r}.md`).trimEnd()}\n`);
    return head + pages.join('\n');
}

const bodyOf = (r: Recorded) => (r.bodyFile ? fixture(r.bodyFile) : (r.body ?? ''));

export type Fake = Response | Error | (() => Response | Error | Promise<Response | Error>);

const noBody = (status: number) => status === 204 || status === 304 || (status >= 300 && status < 400);

export function respond(status: number, body = '', headers: Record<string, string> = {}): Response {
    return new Response(noBody(status) && body === '' ? null : body, { status, headers });
}

export function netError(code: string): Error {
    return Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error(code), { code }) });
}

/** A fetch that answers from the recording, with overrides; anything else fails like a host that isn't there. */
export function replay(overrides: Record<string, Fake> = {}): { fetch: FetchLike; calls: string[] } {
    const calls: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
        const url = String(input);
        calls.push(url);
        if (Object.hasOwn(overrides, url)) {
            const o = overrides[url]!;
            const r = typeof o === 'function' ? await o() : o;
            if (r instanceof Error) throw r;
            return r.clone();
        }
        if (url === 'https://ochk.io/docs/llms-full.txt') return respond(200, llmsFull(), { 'content-type': 'text/plain; charset=utf-8' });
        const rec = manifest.responses[url];
        if (!rec) throw netError('ENOTFOUND');
        return respond(rec.status, bodyOf(rec), rec.headers);
    };
    return { fetch: fetchImpl, calls };
}

/** Every host resolves to a public address, except the ones named. */
export function lookupWith(missing: string[] = [], privateHosts: Record<string, string> = {}): Lookup {
    return async (host) => {
        if (privateHosts[host]) return [privateHosts[host]!];
        if (missing.includes(host) || host.startsWith('www.oc-onboarding-examples')) {
            throw Object.assign(new Error(`getaddrinfo ENOTFOUND ${host}`), { code: 'ENOTFOUND' });
        }
        return ['93.184.216.10'];
    };
}

/** A pin that fetches through the replay and records the addresses each connection was given. */
export function pinVia(fetch: FetchLike, pins: string[][] = []): Pin {
    return (addresses) => {
        pins.push(addresses);
        return { fetch, close: async () => undefined };
    };
}

/** Deps for the domain and site checks, answered from the replay. */
export function site(fetch: FetchLike, lookup: Lookup = lookupWith()): DomainDeps {
    return { fetch, lookup, pin: pinVia(fetch) };
}
