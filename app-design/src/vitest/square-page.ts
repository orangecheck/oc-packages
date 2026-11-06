import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

/*
 * The square page, read from a site's own source. The theme's radius token is 0, so every rounded-*
 * step draws square; these are the ways past it. A site's test calls it on its src directory:
 *
 *     import { squarePage } from '@orangecheck/app-design/vitest';
 *
 *     const page = squarePage(join(__dirname, '..'));
 *     it('reads its sources', () => expect(page.files).toBeGreaterThan(100));
 *     it('draws no radius off the scale', () => expect(page.radii).toEqual([]));
 *     it('draws no pill and no round control', () => expect(page.roundNotDots).toEqual([]));
 */

/**
 * A radius off the zero scale, on any corner or side: a literal, a variable, Tailwind's xs, a
 * depiction's or a tile's (the package's frames draw those), an arbitrary border-radius property,
 * and an inline borderRadius.
 */
const ARBITRARY_RADIUS =
    /\brounded(?:-(?:[trblse]|tl|tr|br|bl|ss|se|es|ee))?-(?:\[[^\]\s]+\]|\([^)\s]+\)|(?:xs|tile|depict)(?![\w-]))|\[border-radius:|\bborderRadius\b/g;

/** Elements a person presses or types in: square, whatever their size. */
const CONTROLS = new Set(['a', 'button', 'input', 'select', 'textarea', 'Button', 'Link', 'Input', 'Textarea']);

function sources(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) return name === '__tests__' ? [] : sources(p);
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [p] : [];
    });
}

function radii(src: string, name: string): string[] {
    return src.split('\n').flatMap((line, i) => [...line.matchAll(ARBITRARY_RADIUS)].map((m) => `${name}:${i + 1} ${m[0]}`));
}

/**
 * Every rounded-full that is not a dot: a class string holding it must be a square box (size-N) on
 * an element nobody presses. One this cannot read counts against it.
 */
function roundNotDots(src: string, name: string): string[] {
    const out: string[] = [];
    let read = 0;
    for (const m of src.matchAll(/className=(?:"([^"]*)"|\{`([^`]*)`\})/g)) {
        const cls = m[1] ?? m[2] ?? '';
        if (!/\brounded-full\b/.test(cls)) continue;
        read += 1;
        const before = src.slice(0, m.index);
        const tag = /<([A-Za-z][\w.]*)[^<]*$/.exec(before)?.[1] ?? '?';
        if (CONTROLS.has(tag) || !/(^|\s)size-\d/.test(cls)) out.push(`${name}:${before.split('\n').length} <${tag}> ${cls}`);
    }
    const all = src.match(/\brounded-full\b/g)?.length ?? 0;
    if (all > read) out.push(`${name}: ${all - read} rounded-full outside a className this reads`);
    return out;
}

export interface SquarePage {
    /** The .ts and .tsx files read: every one under the directory but tests and __tests__. */
    files: number;
    /** Each radius off the zero scale, as `src/file.tsx:line class`. */
    radii: string[];
    /** Each rounded-full on a control or on a box that is not square, as `src/file.tsx:line <tag> classes`. */
    roundNotDots: string[];
}

/** `dir`: the site's source directory. Findings name files from its parent, as `src/...`. */
export function squarePage(dir: string): SquarePage {
    const files = sources(dir);
    const read = files.map((f) => [readFileSync(f, 'utf8'), relative(dirname(dir), f)] as const);
    return {
        files: files.length,
        radii: read.flatMap(([src, name]) => radii(src, name)),
        roundNotDots: read.flatMap(([src, name]) => roundNotDots(src, name)),
    };
}
