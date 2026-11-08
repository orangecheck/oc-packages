import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/*
 * The scroll-margins in a site's own source. The theme's scroll-padding keeps what a link or a scroll lands
 * on clear of the site's sticky bar, at every width; a scroll-margin adds to it, so the target lands that
 * much lower. A margin belongs only where a second sticky band covers the page. A site's test calls it on
 * its src directory:
 *
 *     import { scrollMargins } from '@orangecheck/app-design/vitest';
 *
 *     const m = scrollMargins(join(__dirname, '..'));
 *     it('reads its sources, the stylesheets among them', () => {
 *         expect(m.files).toBeGreaterThan(100);
 *         expect(m.stylesheets).toBeGreaterThan(0);
 *     });
 *     it('lands a linked section where the bar leaves it', () => expect(m.margins).toEqual([]));
 */

/** A scroll-margin in any form: a utility on any side, a stylesheet property, or an inline style. */
const MARGIN = /\bscroll-m[trblxyse]?-[^\s"'`]+|\bscroll-margin[\w-]*\s*:|\bscrollMargin\w*/g;

/** Code, stylesheets and pages: a margin can be set in any of them. */
const READ = /\.(?:mdx?|[mc]?[jt]sx?|css|html)$/;
const TEST = /\.(?:test|spec)\.[mc]?[jt]sx?$/;

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) return name === '__tests__' ? [] : sources(p);
        return READ.test(name) && !TEST.test(name) ? [p] : [];
    });
}

export interface ScrollMargins {
    /** The files read: every code, stylesheet and page file under the directory but tests and __tests__. */
    files: number;
    /** The .css files among them. None means a margin set in a stylesheet would pass unseen. */
    stylesheets: number;
    /** Each scroll-margin, as `src/file.tsx: match`, in file order. No line, so an allowed one survives edits above it. */
    margins: string[];
}

/** `dir`: the site's source directory. Findings name files from its parent, as `src/...`. */
export function scrollMargins(dir: string): ScrollMargins {
    const files = sources(dir);
    return {
        files: files.length,
        stylesheets: files.filter((f) => f.endsWith('.css')).length,
        margins: files.flatMap((f) => (readFileSync(f, 'utf8').match(MARGIN) ?? []).map((m) => `${relative(dirname(dir), f)}: ${m}`)),
    };
}
