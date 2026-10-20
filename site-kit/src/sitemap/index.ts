/**
 * Build-time sitemap from `src/pages`, the family pattern:
 *
 * - `<loc>` and `<lastmod>` only; crawlers ignore `<changefreq>` and `<priority>`.
 * - `lastmod` is the date of the last commit that touched the page's source,
 *   omitted when git cannot say: no git, or a shallow clone whose boundary
 *   commit is the only one that names the file. Never the build clock.
 * - Same-host URLs only.
 * - A static page is listed unless it is infrastructure, an API route, dynamic
 *   (`[param]`), excluded, or its source says `noindex`.
 *
 * Output is deterministic: running it twice writes identical bytes.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative, resolve, sep } from 'node:path';

export interface SitemapOptions {
    /** Absolute https origin with no trailing slash. */
    siteUrl: string;
    /** Routes kept out, with everything under them: `['/dashboard']`. */
    exclude?: readonly string[];
    /** Project root. Default `process.cwd()`. */
    root?: string;
    /** Pages directory under the root. Default `src/pages`. */
    pagesDir?: string;
    /** Output file under the root. Default `public/sitemap.xml`. */
    out?: string;
    /** Commit dates by repo-relative path; default reads `git log`. */
    gitDates?: Map<string, string>;
}

export interface SitemapEntry {
    route: string;
    lastmod: string | null;
}

const PAGE_EXT = /\.(tsx|ts|jsx|js|mdx|md)$/;
const INFRA = /^(_app|_document|_error|404|500|sitemap.*|robots.*)$/;
const ORIGIN = /^https:\/\/[a-z0-9-]+(\.[a-z0-9-]+)+$/;

function walk(dir: string, acc: string[] = []): string[] {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const abs = join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name === 'api' || entry.name.startsWith('_')) continue;
            walk(abs, acc);
        } else if (PAGE_EXT.test(entry.name)) {
            acc.push(abs);
        }
    }
    return acc;
}

/** Repo-relative path → date (YYYY-MM-DD) of the newest commit touching it. */
export function readGitDates(root: string): Map<string, string> {
    const map = new Map<string, string>();
    try {
        try {
            // A shallow Vercel clone would date every stable page as missing.
            execFileSync('git', ['fetch', '--unshallow', '--quiet'], { cwd: root, stdio: 'ignore' });
        } catch {
            /* already complete, or no remote */
        }
        // Still shallow (Vercel cannot always deepen): the boundary commit lists
        // every file in the tree as added, so its date is not a change date.
        const shallowPath = resolve(
            root,
            execFileSync('git', ['rev-parse', '--git-path', 'shallow'], { cwd: root, encoding: 'utf8' }).trim()
        );
        const boundary = new Set(existsSync(shallowPath) ? readFileSync(shallowPath, 'utf8').split('\n').filter(Boolean) : []);
        const log = execFileSync('git', ['log', '--name-only', '--format=%x01%H %cI'], {
            cwd: root,
            encoding: 'utf8',
            maxBuffer: 256 * 1024 * 1024,
        });
        let cur: string | null = null;
        for (const line of log.split('\n')) {
            if (line.startsWith('\x01')) {
                const [hash, date] = line.slice(1).split(' ');
                cur = hash && date && !boundary.has(hash) ? date.slice(0, 10) : null;
            } else if (line && !map.has(line)) {
                // First sighting is the newest commit; a boundary sighting means "unknown".
                map.set(line, cur ?? '');
            }
        }
        for (const [k, v] of map) if (!v) map.delete(k);
    } catch {
        /* no git: every lastmod is omitted, which is correct */
    }
    return map;
}

export function collectRoutes(opts: SitemapOptions): SitemapEntry[] {
    const root = opts.root ?? process.cwd();
    const pagesDir = join(root, opts.pagesDir ?? join('src', 'pages'));
    const exclude = opts.exclude ?? [];
    const gitDates = opts.gitDates ?? readGitDates(root);
    const seen = new Set<string>();
    const urls: SitemapEntry[] = [];

    for (const abs of walk(pagesDir)) {
        const rel = relative(root, abs).split(sep).join('/');
        const base = rel.split('/').pop()!.replace(PAGE_EXT, '');
        if (INFRA.test(base)) continue;
        if (rel.includes('[')) continue;
        let route = relative(pagesDir, abs).split(sep).join('/').replace(PAGE_EXT, '');
        route = '/' + route.replace(/\/index$/, '').replace(/^index$/, '');
        if (exclude.some((ex) => route === ex || route.startsWith(ex + '/'))) continue;
        if (seen.has(route)) continue;
        let src = '';
        try {
            src = readFileSync(abs, 'utf8');
        } catch {
            /* unreadable: treated as indexable */
        }
        if (/noindex/i.test(src)) continue;
        seen.add(route);
        urls.push({ route, lastmod: gitDates.get(rel) ?? null });
    }
    urls.sort((a, b) => (a.route === '/' ? -1 : b.route === '/' ? 1 : a.route < b.route ? -1 : 1));
    return urls;
}

const xmlEscape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

export function renderSitemap(siteUrl: string, urls: readonly SitemapEntry[]): string {
    const body = urls
        .map(({ route, lastmod }) => {
            const loc = xmlEscape(`${siteUrl}${route}`);
            const lm = lastmod ? `\n    <lastmod>${lastmod}</lastmod>` : '';
            return `  <url>\n    <loc>${loc}</loc>${lm}\n  </url>`;
        })
        .join('\n');
    return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${body}\n</urlset>\n`;
}

/**
 * Write the sitemap. Never fails the build over it: on an error it writes a
 * root-only sitemap and says why. Returns the number of URLs written.
 */
export function writeSitemap(opts: SitemapOptions): number {
    if (!ORIGIN.test(opts.siteUrl)) {
        throw new TypeError(`site-kit sitemap: siteUrl must be an https origin, got ${JSON.stringify(opts.siteUrl)}`);
    }
    const root = opts.root ?? process.cwd();
    const out = join(root, opts.out ?? join('public', 'sitemap.xml'));
    try {
        statSync(join(root, opts.pagesDir ?? join('src', 'pages')));
        const urls = collectRoutes(opts);
        writeFileSync(out, renderSitemap(opts.siteUrl, urls));
        return urls.length;
    } catch (err) {
        console.warn(`[sitemap] fell back to a root-only sitemap: ${err instanceof Error ? err.message : String(err)}`);
        writeFileSync(out, renderSitemap(opts.siteUrl, [{ route: '/', lastmod: null }]));
        return 1;
    }
}
