import { describe, expect, it } from 'vitest';

import { Docs } from '../docs.js';
import { buildGuide, STACKS } from '../guide.js';
import { fixture, replay, respond } from './replay.js';

/** Each fenced block in the guide, fences included. */
function fencedBlocks(md: string): string[] {
    return [...md.matchAll(/^(`{3,})[^\n]*\n[\s\S]*?\n\1$/gm)].map((m) => m[0]);
}

describe('integration_guide', () => {
    it.each(STACKS)('%s: every step resolves, and every code block is copied verbatim from the page it cites', async (stack) => {
        const guide = await buildGuide(new Docs({ fetch: replay().fetch }), stack);
        expect(guide.missing).toEqual([]);
        expect(guide.text).not.toContain('WARNING');

        // Split on Source lines: every block below one must be in that page, character for character.
        const parts = guide.text.split(/^Source: /m).slice(1);
        expect(parts.length).toBeGreaterThan(4);
        let checked = 0;
        for (const part of parts) {
            const url = part.slice(0, part.indexOf('\n'));
            const route = new URL(url).pathname.replace(/^\/docs/, '');
            const page = fixture(`docs/pages${route}.md`);
            const body = part.split(/^## /m)[0]!.split(/^Note: /m)[0]!;
            for (const block of fencedBlocks(body)) {
                expect(page, `${url}: ${block.slice(0, 80)}`).toContain(block);
                checked++;
            }
        }
        expect(checked).toBeGreaterThan(2);
    });

    it('nextjs-pages leads with the project and ends with the checklist', async () => {
        const g = await buildGuide(new Docs({ fetch: replay().fetch }), 'nextjs-pages');
        const titles = [...g.text.matchAll(/^## \d+\. (.+)$/gm)].map((m) => m[1]);
        expect(titles[0]).toBe('Create a project and put its key in your server environment');
        expect(titles.at(-1)).toBe('Check it before real people sign in');
        expect(g.text).toContain('Source: https://ochk.io/docs/me/quickstart#3--check-the-session-on-your-server');
        expect(g.text).toContain('// Next.js Pages · pages/api/auth/me.ts');
        expect(g.text).not.toContain('ocAuthExpress({');
    });

    it('nextjs-app says the docs have no App Router example rather than inventing one', async () => {
        const g = await buildGuide(new Docs({ fetch: replay().fetch }), 'nextjs-app');
        expect(g.text).toContain('Note: The docs have no App Router example.');
        expect(g.text).not.toMatch(/app\/api\/[^\s]*route\.ts/);
    });

    it('godot carries the whole script and both servers', async () => {
        const g = await buildGuide(new Docs({ fetch: replay().fetch }), 'godot');
        expect(g.text).toContain('class_name OrangecheckSignIn');
        expect(g.text).toContain('exchangeNativeCode');
        expect(g.text).toContain('exchange_native_code(');
    });

    it('says which excerpt is gone when the docs change, and writes nothing in its place', async () => {
        const qs = fixture('docs/pages/me/quickstart.md').replace(/```ts\n\/\/ Next\.js Pages · pages\/api\/auth\/me\.ts[\s\S]*?\n```\n/, '');
        const { fetch } = replay({ 'https://ochk.io/docs/me/quickstart.md': respond(200, qs) });
        const g = await buildGuide(new Docs({ fetch }), 'nextjs-pages');
        expect(g.missing).toEqual(['https://ochk.io/docs/me/quickstart#3--check-the-session-on-your-server: a code block with "pages/api/auth/me.ts"']);
        expect(g.text.startsWith('WARNING: 1 excerpt could not be found')).toBe(true);
        expect(g.text).toContain('no longer has a code block with "pages/api/auth/me.ts". Read that section instead.');
        expect(g.text).not.toContain('withOcAuth(\n    async (req, res)');
    });

    it('says a page could not be read', async () => {
        const { fetch } = replay({ 'https://ochk.io/docs/integration/sign-in-button.md': respond(502, 'bad gateway') });
        const g = await buildGuide(new Docs({ fetch }), 'nextjs-pages');
        expect(g.missing).toEqual(['https://ochk.io/docs/integration/sign-in-button: https://ochk.io/docs/integration/sign-in-button.md answered 502.']);
        expect(g.text).toContain('> Could not read https://ochk.io/docs/integration/sign-in-button:');
    });
});
