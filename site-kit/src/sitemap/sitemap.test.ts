import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { collectRoutes, readGitDates, renderSitemap, writeSitemap } from './index';

function site(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), 'site-kit-sitemap-'));
    for (const [rel, src] of Object.entries(files)) {
        mkdirSync(dirname(join(root, rel)), { recursive: true });
        writeFileSync(join(root, rel), src);
    }
    mkdirSync(join(root, 'public'), { recursive: true });
    return root;
}

const PAGES = {
    'src/pages/index.tsx': 'export default 1',
    'src/pages/create.tsx': 'export default 1',
    'src/pages/verify.tsx': 'export default 1',
    'src/pages/v.tsx': '<Seo noindex />',
    'src/pages/signin.tsx': '<Seo noindex />',
    'src/pages/dashboard/index.tsx': 'export default 1',
    'src/pages/dashboard/keys.tsx': 'export default 1',
    'src/pages/docs/intro.mdx': '# hi',
    'src/pages/p/[id].tsx': 'export default 1',
    'src/pages/api/og.tsx': 'export default 1',
    'src/pages/_app.tsx': 'export default 1',
    'src/pages/_document.tsx': 'export default 1',
    'src/pages/404.tsx': 'export default 1',
    'src/pages/500.tsx': 'export default 1',
    'src/pages/sitemap-data.xml.ts': 'export default 1',
};

describe('collectRoutes', () => {
    it('lists static, indexable pages, root first, with commit dates where known', () => {
        const root = site(PAGES);
        const routes = collectRoutes({
            siteUrl: 'https://stamp.ochk.io',
            exclude: ['/dashboard'],
            root,
            gitDates: new Map([['src/pages/create.tsx', '2026-10-01']]),
        });
        expect(routes).toEqual([
            { route: '/', lastmod: null },
            { route: '/create', lastmod: '2026-10-01' },
            { route: '/docs/intro', lastmod: null },
            { route: '/verify', lastmod: null },
        ]);
    });
});

describe('writeSitemap', () => {
    it('writes the family format, byte-identical on a second run', () => {
        const root = site(PAGES);
        const opts = { siteUrl: 'https://stamp.ochk.io', exclude: ['/dashboard'], root, gitDates: new Map([['src/pages/create.tsx', '2026-10-01']]) };
        expect(writeSitemap(opts)).toBe(4);
        const first = readFileSync(join(root, 'public/sitemap.xml'), 'utf8');
        expect(first).toBe(
            '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n' +
                '  <url>\n    <loc>https://stamp.ochk.io/</loc>\n  </url>\n' +
                '  <url>\n    <loc>https://stamp.ochk.io/create</loc>\n    <lastmod>2026-10-01</lastmod>\n  </url>\n' +
                '  <url>\n    <loc>https://stamp.ochk.io/docs/intro</loc>\n  </url>\n' +
                '  <url>\n    <loc>https://stamp.ochk.io/verify</loc>\n  </url>\n</urlset>\n'
        );
        writeSitemap(opts);
        expect(readFileSync(join(root, 'public/sitemap.xml'), 'utf8')).toBe(first);
    });

    it('falls back to a root-only sitemap rather than failing the build', () => {
        const root = site({});
        expect(writeSitemap({ siteUrl: 'https://x.ochk.io', root })).toBe(1);
        expect(readFileSync(join(root, 'public/sitemap.xml'), 'utf8')).toContain('<loc>https://x.ochk.io/</loc>');
    });

    it('refuses a site URL that is not a bare https origin', () => {
        for (const siteUrl of ['http://x.ochk.io', 'https://x.ochk.io/', 'x.ochk.io']) {
            expect(() => writeSitemap({ siteUrl, root: site({}) })).toThrow(TypeError);
        }
    });

    it('escapes XML in a location', () => {
        expect(renderSitemap('https://x.ochk.io', [{ route: '/a&b', lastmod: null }])).toContain('<loc>https://x.ochk.io/a&amp;b</loc>');
    });
});

describe('readGitDates', () => {
    function repo(): string {
        const root = mkdtempSync(join(tmpdir(), 'site-kit-git-'));
        const git = (args: string[], date?: string) =>
            execFileSync('git', args, {
                cwd: root,
                stdio: 'ignore',
                env: {
                    ...process.env,
                    GIT_AUTHOR_NAME: 't',
                    GIT_AUTHOR_EMAIL: 't@example.invalid',
                    GIT_COMMITTER_NAME: 't',
                    GIT_COMMITTER_EMAIL: 't@example.invalid',
                    ...(date ? { GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date } : {}),
                },
            });
        const write = (rel: string, src: string) => {
            mkdirSync(dirname(join(root, rel)), { recursive: true });
            writeFileSync(join(root, rel), src);
        };
        git(['init', '-q', '-b', 'main']);
        write('src/pages/index.tsx', '1');
        write('src/pages/a.tsx', '1');
        git(['add', '.']);
        git(['commit', '-q', '-m', 'one'], '2026-01-01T12:00:00Z');
        write('src/pages/a.tsx', '2');
        git(['commit', '-q', '-am', 'two'], '2026-02-01T12:00:00Z');
        write('src/pages/b.tsx', '1');
        git(['add', '.']);
        git(['commit', '-q', '-m', 'three'], '2026-03-01T12:00:00Z');
        return root;
    }

    it('dates each file by the newest commit that touched it', () => {
        const dates = readGitDates(repo());
        expect(Object.fromEntries(dates)).toEqual({
            'src/pages/index.tsx': '2026-01-01',
            'src/pages/a.tsx': '2026-02-01',
            'src/pages/b.tsx': '2026-03-01',
        });
    });

    it('in a shallow clone, gives no date from the boundary commit, which lists every file', () => {
        const full = repo();
        const shallow = mkdtempSync(join(tmpdir(), 'site-kit-shallow-'));
        execFileSync('git', ['clone', '-q', '--depth', '2', '--no-local', `file://${full}`, shallow], { stdio: 'ignore' });
        execFileSync('git', ['remote', 'remove', 'origin'], { cwd: shallow, stdio: 'ignore' });
        expect(Object.fromEntries(readGitDates(shallow))).toEqual({ 'src/pages/b.tsx': '2026-03-01' });
    });

    it('without git, dates nothing', () => {
        expect(readGitDates(mkdtempSync(join(tmpdir(), 'site-kit-nogit-'))).size).toBe(0);
    });
});
