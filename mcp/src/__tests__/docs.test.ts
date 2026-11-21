import { describe, expect, it } from 'vitest';

import { Docs, parseFull, parseIndex, parsePageRef, readPart, search } from '../docs.js';
import { UpstreamError } from '../http.js';
import { fixture, llmsFull, RECORDED_ROUTES, replay, respond } from './replay.js';

describe('parsePageRef', () => {
    it.each([
        ['https://ochk.io/docs/me/quickstart', '/me/quickstart', undefined],
        ['https://ochk.io/docs/me/quickstart.md', '/me/quickstart', undefined],
        ['https://ochk.io/docs/me/quickstart#5--go-live', '/me/quickstart', '5--go-live'],
        ['ochk.io/docs/me/sdk', '/me/sdk', undefined],
        ['https://docs.ochk.io/me/sdk#react', '/me/sdk', 'react'],
        ['/me/sdk', '/me/sdk', undefined],
        ['me/sdk', '/me/sdk', undefined],
        ['/docs/me/sdk', '/me/sdk', undefined],
        ['https://ochk.io/docs', '/', undefined],
        ['https://ochk.io/docs/index.md', '/', undefined],
    ])('reads %s', (ref, route, anchor) => {
        expect(parsePageRef(ref)).toEqual(anchor ? { route, anchor } : { route });
    });

    it.each(['https://evil.example/docs/me', 'https://ochk.io/api/auth/session', 'file:///etc/passwd', 'javascript:alert(1)', ''])(
        'refuses %s',
        (ref) => {
            expect(() => parsePageRef(ref)).toThrow();
        }
    );

    it('cannot climb out of /docs', () => {
        expect(parsePageRef('/me/../../api/auth').route).toBe('/api/auth');
        // The route stays a docs route: it is fetched as https://ochk.io/docs/api/auth.md, never /api/auth.
    });
});

describe('llms.txt and llms-full.txt', () => {
    it('index every page with its section, title and description', () => {
        const index = parseIndex(fixture('docs/llms.txt'));
        expect(index.length).toBeGreaterThan(100);
        const qs = index.find((e) => e.route === '/me/quickstart')!;
        expect(qs.group).toBe('/docs/me');
        expect(qs.title).toBe('ochk.app · Quickstart');
        expect(qs.url).toBe('https://ochk.io/docs/me/quickstart');
        expect(qs.description).toMatch(/^Two tracks/);
        expect(index.some((e) => e.group === 'Optional' && e.route === '/sdk/me-client/README')).toBe(true);
    });

    it('split llms-full.txt into pages without being fooled by a --- inside one', () => {
        const pages = parseFull(llmsFull());
        expect(pages.map((p) => p.route)).toEqual(RECORDED_ROUTES);
        for (const p of pages) expect(p.markdown.trimEnd()).toBe(fixture(`docs/pages${p.route}.md`).trimEnd());
    });
});

describe('search', () => {
    const pages = parseFull(llmsFull());
    const index = parseIndex(fixture('docs/llms.txt'));

    it('ranks the page that is about the words first, with section anchors on its lines', () => {
        const hits = search(pages, index, 'oc-domain-verify meta tag');
        expect(hits[0]!.url).toBe('https://ochk.io/docs/me/quickstart');
        expect(hits[0]!.matches.some((m) => m.anchor === '5--go-live')).toBe(true);
    });

    it('finds the native sign-in page for a Godot question', () => {
        expect(search(pages, index, 'godot loopback')[0]!.url).toBe('https://ochk.io/docs/integration/native-sign-in');
    });

    it('falls back to any word when no page has them all, and finds SDK reference titles', () => {
        expect(search(pages, index, 'webhook-verify zzzunknownzzz').some((h) => h.url.endsWith('/sdk/webhook-verify/README'))).toBe(true);
    });

    it('answers nothing for nothing', () => {
        expect(search(pages, index, '   ')).toEqual([]);
        expect(search(pages, index, 'zzzunknownzzz')).toEqual([]);
    });
});

describe('readPart', () => {
    const page = { url: 'https://ochk.io/docs/me/sdk', route: '/me/sdk', title: 'x', markdown: fixture('docs/pages/me/sdk.md') };

    it('cuts a long page into parts at line breaks that join back to the page', () => {
        let offset = 0;
        let text = '';
        for (let i = 0; i < 50; i++) {
            const part = readPart(page, { offset, maxChars: 8000 });
            expect(part.text.length).toBeLessThanOrEqual(8000);
            text += part.text;
            if (part.nextOffset === undefined) break;
            expect(part.text.endsWith('\n')).toBe(true);
            offset = part.nextOffset;
        }
        expect(text).toBe(page.markdown);
    });

    it('reads one section, and lists the sections when the name matches none', () => {
        expect(readPart(page, { section: 'python-warming' }).text.startsWith('### Python: warming')).toBe(true);
        expect(() => readPart(page, { section: 'no such thing' })).toThrow(/has no section "no such thing"[\s\S]*- `@orangecheck\/me-client` · SDK reference|has no section "no such thing"[\s\S]*#install/);
    });
});

describe('Docs', () => {
    it('reads llms-full.txt once and keeps it', async () => {
        const { fetch, calls } = replay();
        const docs = new Docs({ fetch });
        await docs.pages();
        await docs.pages();
        expect(calls.filter((u) => u.endsWith('llms-full.txt'))).toHaveLength(1);
    });

    it('reads again after a failure instead of keeping it', async () => {
        let n = 0;
        const { fetch } = replay({
            'https://ochk.io/docs/llms.txt': () => (++n === 1 ? respond(503, 'down') : respond(200, fixture('docs/llms.txt'))),
        });
        const docs = new Docs({ fetch });
        await expect(docs.index()).rejects.toThrow(/answered 503/);
        expect((await docs.index()).length).toBeGreaterThan(100);
    });

    it('says a missing page is missing, with what to do', async () => {
        const docs = new Docs({ fetch: replay().fetch });
        const err = await docs.page('/no-such-page-for-fixtures').catch((e: unknown) => e);
        expect(err).toBeInstanceOf(UpstreamError);
        expect((err as Error).message).toMatch(/There is no docs page at https:\/\/ochk\.io\/docs\/no-such-page-for-fixtures\. search_docs or list_docs/);
    });
});
