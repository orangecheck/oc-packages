import { describe, expect, it } from 'vitest';

import { blocks, findHeading, headings, section, slugBase } from '../markdown.js';
import { fixture, RECORDED_ROUTES } from './replay.js';

describe('anchors', () => {
    it('match the anchors the docs link to, on every recorded page', () => {
        const pages = new Map(RECORDED_ROUTES.map((r) => [r, fixture(`docs/pages${r}.md`)]));
        const linked: { route: string; anchor: string }[] = [];
        for (const md of pages.values()) {
            for (const m of md.matchAll(/https:\/\/ochk\.io\/docs(\/[a-z0-9/_-]+)#([a-z0-9_-]+)/gi)) {
                if (pages.has(m[1]!)) linked.push({ route: m[1]!, anchor: m[2]! });
            }
        }
        expect(linked.length).toBeGreaterThan(20);
        const unresolved = linked.filter(({ route, anchor }) => !headings(pages.get(route)!).some((h) => h.slug === anchor));
        expect(unresolved).toEqual([]);
    });

    it('drop the middle dot and keep both spaces as hyphens, as rehype-slug does', () => {
        expect(slugBase('5 · go live')).toBe('5--go-live');
        expect(slugBase('Python: warming')).toBe('python-warming');
        expect(slugBase('oc.event.fire · send an event')).toBe('oceventfire--send-an-event');
    });

    it('number a repeated heading', () => {
        const hs = headings('# A\n\n## Setup\n\ntext\n\n## Setup\n');
        expect(hs.map((h) => h.slug)).toEqual(['a', 'setup', 'setup-1']);
    });
});

describe('headings', () => {
    it('skip lines inside code fences', () => {
        const native = fixture('docs/pages/integration/native-sign-in.md');
        const texts = headings(native).map((h) => h.text);
        expect(texts).toContain('The app: Godot 4');
        // GDScript doc comments start with ##, inside the fence.
        expect(texts.some((t) => t.startsWith('Sign a player in'))).toBe(false);
    });
});

describe('section', () => {
    const qs = fixture('docs/pages/me/quickstart.md');

    it('runs to the next heading of the same level', () => {
        const s = section(qs, '2 · add the sign-in popup')!;
        expect(s.markdown.startsWith('### 2 · add the sign-in popup')).toBe(true);
        expect(s.markdown).toContain('npm install @orangecheck/me-client');
        expect(s.markdown).not.toContain('### 3 · check the session');
    });

    it('is found by anchor, by text, and by the start of the text', () => {
        expect(findHeading(qs, '#5--go-live')?.text).toBe('5 · go live');
        expect(findHeading(qs, 'Choose who can sign in')).toBeUndefined();
        expect(findHeading(qs, '4 · choose who can sign in')?.slug).toBe('4--choose-who-can-sign-in');
        expect(findHeading(qs, '5 · check it')?.slug).toBe('5--check-it-before-real-people-sign-in');
    });
});

describe('blocks', () => {
    it('keeps a code block whole, fences and all, exactly as the page has it', () => {
        const qs = fixture('docs/pages/me/quickstart.md');
        const s = section(qs, '3 · check the session on your server')!;
        const code = blocks(s.markdown).filter((b) => b.kind === 'code');
        expect(code.map((b) => b.lang)).toEqual(['ts', 'ts', 'ts']);
        for (const b of code) expect(qs).toContain(b.raw);
        expect(code[0]!.raw.startsWith('```ts\n// Next.js Pages · pages/api/auth/me.ts')).toBe(true);
        expect(code[0]!.raw.endsWith('```')).toBe(true);
    });
});
