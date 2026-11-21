/** The orangecheck docs as their build publishes them for language models (oc-docs scripts/gen-llms.mjs). */

import { getText, UpstreamError, type FetchLike } from './http.js';
import { headings, section, type Heading } from './markdown.js';

export const DOCS_URL = 'https://ochk.io/docs';
export const LLMS_URL = `${DOCS_URL}/llms.txt`;
export const LLMS_FULL_URL = `${DOCS_URL}/llms-full.txt`;

export interface IndexEntry {
    title: string;
    /** The page's markdown copy, as llms.txt links it. */
    mdUrl: string;
    /** The rendered page. */
    url: string;
    route: string;
    description: string;
    /** The llms.txt section it is listed under, e.g. "/docs/me" or "Optional". */
    group: string;
}

export interface Page {
    url: string;
    route: string;
    markdown: string;
    title: string;
}

/** A route as the site serves it: '/', '/me/quickstart'. */
export function routeOf(url: string): string {
    const u = new URL(url);
    let path = u.pathname.replace(/^\/docs/, '') || '/';
    path = path.replace(/\.md$/, '');
    if (path === '/index') path = '/';
    return path.length > 1 ? path.replace(/\/$/, '') : '/';
}

export const pageUrl = (route: string) => (route === '/' ? DOCS_URL : DOCS_URL + route);
export const mdUrl = (route: string) => `${DOCS_URL}/${route === '/' ? 'index' : route.slice(1)}.md`;

/**
 * A page reference as a person or an agent writes it, read as a docs route and anchor:
 * https://ochk.io/docs/me/quickstart#5--go-live, ochk.io/docs/me/quickstart.md, /me/quickstart,
 * me/quickstart, docs.ochk.io/me/sdk. Anything off the docs is refused.
 */
export function parsePageRef(ref: string): { route: string; anchor?: string } {
    let s = ref.trim();
    if (!s) throw new Error('Name a docs page, e.g. /me/quickstart or https://ochk.io/docs/me/quickstart.');
    if (/^(ochk\.io|docs\.ochk\.io|www\.ochk\.io)(\/|$)/i.test(s)) s = `https://${s}`;
    let u: URL;
    if (/^[a-z][a-z0-9+.-]*:/i.test(s)) {
        try {
            u = new URL(s);
        } catch {
            throw new Error(`"${ref}" is not a URL or a docs path.`);
        }
        const host = u.hostname.toLowerCase();
        if (u.protocol !== 'https:' && u.protocol !== 'http:') throw new Error(`"${ref}" is not a docs page.`);
        if (host === 'docs.ochk.io') u = new URL(`/docs${u.pathname === '/' ? '' : u.pathname}${u.hash}`, DOCS_URL);
        else if (host !== 'ochk.io' && host !== 'www.ochk.io') {
            throw new Error(`Only the orangecheck docs at ${DOCS_URL} can be read; "${ref}" is elsewhere.`);
        }
        if (!/^\/docs(\/|$)/.test(u.pathname)) {
            throw new Error(`"${ref}" is on ochk.io but not under /docs.`);
        }
    } else {
        const path = s.startsWith('/') ? s : `/${s}`;
        u = new URL(path.replace(/^\/docs(?=\/|$|#)/, '') || '/', 'https://docs.invalid');
        u = new URL(`/docs${u.pathname === '/' ? '' : u.pathname}${u.hash}`, DOCS_URL);
    }
    const route = routeOf(u.toString());
    if (!/^\/[a-z0-9._/-]*$/i.test(route) || route.includes('..')) throw new Error(`"${ref}" is not a docs path.`);
    const anchor = u.hash ? decodeURIComponent(u.hash.slice(1)) : undefined;
    return anchor ? { route, anchor } : { route };
}

/** llms.txt: every page's title and description, by section. */
export function parseIndex(text: string): IndexEntry[] {
    const out: IndexEntry[] = [];
    let group = '';
    for (const line of text.split('\n')) {
        const g = /^## (.+)$/.exec(line);
        if (g) {
            group = g[1]!.trim();
            continue;
        }
        const m = /^- \[(.+?)\]\((https:\/\/ochk\.io\/docs\/[^)\s]+\.md)\)(?::\s*(.*))?$/.exec(line);
        if (!m) continue;
        const route = routeOf(m[2]!);
        out.push({ title: m[1]!, mdUrl: m[2]!, url: pageUrl(route), route, description: m[3] ?? '', group });
    }
    return out;
}

/** llms-full.txt: every written page, each after a `---` line and its `URL:` line. */
export function parseFull(text: string): Page[] {
    const re = /^---\n\nURL: (https:\/\/ochk\.io\/docs[^\s]*)\n\n/gm;
    const starts: { at: number; body: number; url: string }[] = [];
    for (const m of text.matchAll(re)) starts.push({ at: m.index!, body: m.index! + m[0].length, url: m[1]! });
    return starts.map((s, i) => {
        const end = i + 1 < starts.length ? starts[i + 1]!.at : text.length;
        const markdown = text.slice(s.body, end).trimEnd() + '\n';
        const title = /^# (.+)$/m.exec(markdown)?.[1]?.trim() ?? s.url;
        return { url: s.url, route: routeOf(s.url), markdown, title };
    });
}

interface Cached<T> {
    at: number;
    value: Promise<T>;
}

export interface DocsOptions {
    fetch: FetchLike;
    /** How long a read is kept. Default ten minutes. */
    ttlMs?: number;
    now?: () => number;
}

/** The docs, read on first use and kept a while, so a session reads llms-full.txt once, not per call. */
export class Docs {
    private readonly fetchImpl: FetchLike;
    private readonly ttlMs: number;
    private readonly now: () => number;
    private readonly cache = new Map<string, Cached<unknown>>();

    constructor(opts: DocsOptions) {
        this.fetchImpl = opts.fetch;
        this.ttlMs = opts.ttlMs ?? 10 * 60 * 1000;
        this.now = opts.now ?? Date.now;
    }

    private cached<T>(key: string, load: () => Promise<T>): Promise<T> {
        const hit = this.cache.get(key) as Cached<T> | undefined;
        if (hit && this.now() - hit.at < this.ttlMs) return hit.value;
        const value = load();
        this.cache.set(key, { at: this.now(), value });
        // A failed read is not kept: the next call tries again.
        value.catch(() => {
            if (this.cache.get(key)?.value === value) this.cache.delete(key);
        });
        return value;
    }

    index(): Promise<IndexEntry[]> {
        return this.cached('index', async () => {
            const text = await getText(this.fetchImpl, LLMS_URL, { maxBytes: 2 * 1024 * 1024 });
            const entries = parseIndex(text);
            if (entries.length === 0) {
                throw new UpstreamError(LLMS_URL, 'body', `${LLMS_URL} answered, but it lists no pages.`);
            }
            return entries;
        });
    }

    indexText(): Promise<string> {
        return this.cached('index-text', () => getText(this.fetchImpl, LLMS_URL, { maxBytes: 2 * 1024 * 1024 }));
    }

    pages(): Promise<Page[]> {
        return this.cached('full', async () => {
            const text = await getText(this.fetchImpl, LLMS_FULL_URL, { maxBytes: 16 * 1024 * 1024, timeoutMs: 30_000 });
            const pages = parseFull(text);
            if (pages.length === 0) {
                throw new UpstreamError(LLMS_FULL_URL, 'body', `${LLMS_FULL_URL} answered, but holds no pages.`);
            }
            return pages;
        });
    }

    /** One page's markdown copy. */
    page(route: string): Promise<Page> {
        return this.cached(`page:${route}`, async () => {
            const url = mdUrl(route);
            let markdown: string;
            try {
                markdown = await getText(this.fetchImpl, url, { maxBytes: 4 * 1024 * 1024 });
            } catch (err) {
                if (err instanceof UpstreamError && err.status === 404) {
                    throw new UpstreamError(url, 'status', `There is no docs page at ${pageUrl(route)}. search_docs or list_docs finds the right one.`, {
                        status: 404,
                    });
                }
                throw err;
            }
            const title = /^# (.+)$/m.exec(markdown)?.[1]?.trim() ?? route;
            return { url: pageUrl(route), route, markdown, title };
        });
    }
}

export interface SearchHit {
    title: string;
    url: string;
    mdUrl: string;
    description: string;
    score: number;
    /** The best matching lines, each with the anchor of the section it is in. */
    matches: { line: string; anchor?: string; heading?: string }[];
}

const terms = (q: string) =>
    [...new Set(q.toLowerCase().split(/\s+/).map((t) => t.replace(/^[^\p{L}\p{N}`@/]+|[^\p{L}\p{N}`]+$/gu, '').replace(/`/g, '')))].filter(
        (t) => t.length > 0
    );

const count = (hay: string, needle: string) => {
    let n = 0;
    let i = hay.indexOf(needle);
    while (i !== -1 && n < 50) {
        n++;
        i = hay.indexOf(needle, i + needle.length);
    }
    return n;
};

/** Pages ranked by where the words appear: title, description, headings, then body. */
export function search(pages: Page[], index: IndexEntry[], query: string, limit = 8): SearchHit[] {
    const words = terms(query);
    if (words.length === 0) return [];
    const phrase = words.length > 1 ? query.toLowerCase().replace(/\s+/g, ' ').trim() : '';
    const byRoute = new Map(index.map((e) => [e.route, e]));
    const written = new Set(pages.map((p) => p.route));

    const scored = (all: boolean) => {
        const hits: SearchHit[] = [];
        const consider = (route: string, title: string, description: string, markdown: string) => {
            const t = title.toLowerCase();
            const d = description.toLowerCase();
            const body = markdown.toLowerCase();
            const hs: Heading[] = markdown ? headings(markdown) : [];
            const present = words.filter((w) => t.includes(w) || d.includes(w) || body.includes(w));
            if (all ? present.length < words.length : present.length === 0) return;
            let score = 0;
            for (const w of present) {
                if (t.includes(w)) score += 10;
                if (d.includes(w)) score += 4;
                score += 3 * Math.min(5, hs.filter((h) => h.text.toLowerCase().includes(w)).length);
                score += Math.min(20, count(body, w));
            }
            if (phrase) {
                if (t.includes(phrase)) score += 20;
                if (body.includes(phrase)) score += 15;
            }
            const lines = markdown.split('\n');
            const ranked = lines
                .map((line, i) => ({ line, i, n: words.filter((w) => line.toLowerCase().includes(w)).length }))
                .filter((l) => l.n > 0 && l.line.trim().length > 0)
                .sort((a, b) => b.n - a.n || a.i - b.i)
                .slice(0, 3)
                .sort((a, b) => a.i - b.i);
            const matches = ranked.map(({ line, i }) => {
                const h = [...hs].reverse().find((x) => x.line <= i);
                const trimmed = line.trim();
                return {
                    line: trimmed.length > 240 ? `${trimmed.slice(0, 237)}...` : trimmed,
                    ...(h ? { anchor: h.slug, heading: h.text } : {}),
                };
            });
            const entry = byRoute.get(route);
            hits.push({
                title: entry?.title ?? title,
                url: pageUrl(route),
                mdUrl: mdUrl(route),
                description,
                score,
                matches,
            });
        };
        for (const p of pages) consider(p.route, byRoute.get(p.route)?.title ?? p.title, byRoute.get(p.route)?.description ?? '', p.markdown);
        // The generated SDK reference is not in llms-full.txt: its titles and descriptions still count.
        for (const e of index) if (!written.has(e.route)) consider(e.route, e.title, e.description, '');
        return hits;
    };

    let hits = scored(true);
    if (hits.length === 0) hits = scored(false);
    return hits.sort((a, b) => b.score - a.score || a.url.localeCompare(b.url)).slice(0, limit);
}

export interface ReadPart {
    text: string;
    /** Where the next part starts, when the page is longer than one part. */
    nextOffset?: number;
    total: number;
}

/** A page or one of its sections, cut into parts so a long page doesn't flood a context window. */
export function readPart(page: Page, opts: { section?: string; offset?: number; maxChars?: number }): ReadPart {
    let body = page.markdown;
    if (opts.section) {
        const s = section(page.markdown, opts.section);
        if (!s) {
            const outline = headings(page.markdown)
                .map((h) => `${'  '.repeat(h.depth - 1)}- ${h.text} (#${h.slug})`)
                .join('\n');
            throw new Error(`${page.url} has no section "${opts.section}". Its sections:\n${outline}`);
        }
        body = s.markdown;
    }
    const offset = Math.max(0, opts.offset ?? 0);
    const max = Math.max(1000, opts.maxChars ?? 24_000);
    if (offset >= body.length && body.length > 0) {
        throw new Error(`offset ${offset} is past the end: this text is ${body.length} characters.`);
    }
    let end = Math.min(body.length, offset + max);
    // End a part at a line break where one is near, so a code line is never cut in two.
    if (end < body.length) {
        const nl = body.lastIndexOf('\n', end);
        if (nl > offset + max / 2) end = nl + 1;
    }
    return { text: body.slice(offset, end), total: body.length, ...(end < body.length ? { nextOffset: end } : {}) };
}
