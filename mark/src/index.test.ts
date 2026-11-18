import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MARK_FACES, MARK_MONO_OPACITY, MARK_PIXEL_RUNS, MARK_PIXEL_TILE, MARK_POINTS, markDataUri, markPixelRuns, markSvg } from './index';
import { OrangecheckMark } from './react';

const polygons = (svg: string) => [...svg.matchAll(/<polygon ([^>]*)\/?>/g)].map((m) => m[1]!);
const attr = (s: string, name: string) => new RegExp(`${name}="([^"]*)"`).exec(s)?.[1];

/** WCAG relative luminance and contrast, for the colours the variants promise. */
function luminance(hex: string): number {
    const c = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((v) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
    return 0.2126 * c[0]! + 0.7152 * c[1]! + 0.0722 * c[2]!;
}
const contrast = (a: string, b: string) => {
    const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p);
    return (x! + 0.05) / (y! + 0.05);
};

describe('markSvg', () => {
    it('draws mono in the text colour: every face currentColor, the check at full strength', () => {
        const svg = markSvg();
        const faces = polygons(svg);
        expect(faces).toHaveLength(3);
        expect(faces.every((f) => attr(f, 'fill') === 'currentColor')).toBe(true);
        const top = faces.find((f) => attr(f, 'points') === MARK_POINTS.top)!;
        expect(attr(top, 'fill-opacity')).toBeUndefined();
        expect(faces.map((f) => attr(f, 'fill-opacity') ?? '1').sort()).toEqual(['0.3', '0.6', '1']);
        expect(svg).not.toMatch(/#[0-9a-f]{6}/i);
    });

    it('draws brand as drawn, and the tile on its ink square', () => {
        const brand = markSvg({ variant: 'brand' });
        expect(polygons(brand).map((f) => attr(f, 'fill'))).toEqual([MARK_FACES.left, MARK_FACES.right, MARK_FACES.top]);
        const tile = markSvg({ variant: 'tile' });
        expect(tile).toContain('viewBox="0 0 24 24"');
        expect(tile).toMatch(/<rect [^>]*fill="#0A0A0A"/);
        expect(polygons(tile)).toHaveLength(3);
    });

    it('sizes in em with the 8:5 aspect, as attributes a stylesheet can override, never inline styles', () => {
        const svg = markSvg();
        expect(attr(svg, 'viewBox')).toBe('0 0 16 10');
        expect(attr(svg, 'width')).toBe('1.6em');
        expect(attr(svg, 'height')).toBe('1em');
        expect(attr(markSvg({ width: '32px' }), 'height')).toBe('20px');
        expect(attr(markSvg({ variant: 'tile' }), 'height')).toBe('1.5em');
        for (const v of ['mono', 'brand', 'tile'] as const) expect(markSvg({ variant: v })).not.toContain('style=');
    });

    it('is decoration without a title and an image with one, escaping what it is given', () => {
        expect(markSvg()).toContain('aria-hidden="true"');
        const named = markSvg({ title: 'orangecheck <"x">' });
        expect(named).toContain('role="img"');
        expect(named).not.toContain('aria-hidden');
        expect(named).toContain('<title>orangecheck &#60;&#34;x&#34;&#62;</title>');
        expect(markSvg({ className: '"><script>' })).not.toContain('<script>');
    });

    it('refuses an unknown variant, and a mono image without a colour', () => {
        expect(() => markSvg({ variant: 'gold' as never })).toThrow(/unknown variant/);
        expect(() => markDataUri()).toThrow(/needs a colour/);
        const uri = markDataUri({ variant: 'mono', color: '#111111' });
        expect(uri.startsWith('data:image/svg+xml,')).toBe(true);
        expect(decodeURIComponent(uri)).toContain('fill="#111111"');
    });

    it('draws a flat mono mark for forced colours: every face at full strength', () => {
        const faces = polygons(markSvg({ flat: true }));
        expect(faces.every((f) => attr(f, 'fill') === 'currentColor' && attr(f, 'fill-opacity') === undefined)).toBe(true);
        expect(polygons(markSvg({ variant: 'brand', flat: true })).map((f) => attr(f, 'fill'))).toEqual([MARK_FACES.left, MARK_FACES.right, MARK_FACES.top]);
    });

    it('steps mono faces apart on every kind of button: light, dark, amber, brown', () => {
        // Text colour on button colour, as hosts draw them. Neighbours are top↔left, left↔right, right↔ground.
        const hosts: Array<[string, string]> = [
            ['#1c1917', '#fbfaf7'],
            ['#18181b', '#ffffff'],
            ['#fafaf9', '#1c1917'],
            ['#fafafa', '#09090b'],
            ['#2b1d05', '#f2b04a'],
            ['#ffffff', '#9a6420'],
        ];
        const rgb = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
        const hex = (c: number[]) => '#' + c.map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');
        const over = (ink: string, a: number, ground: string) => hex(rgb(ink).map((v, i) => v * a + rgb(ground)[i]! * (1 - a)));
        for (const [ink, ground] of hosts) {
            const [t, l, r] = (['top', 'left', 'right'] as const).map((f) => over(ink, MARK_MONO_OPACITY[f], ground));
            const steps = [contrast(t!, l!), contrast(l!, r!), contrast(r!, ground)];
            expect(Math.min(...steps), `${ink} on ${ground}: ${steps.map((x) => x.toFixed(2)).join(', ')}`).toBeGreaterThanOrEqual(1.6);
        }
    });

    it('keeps its promise about grounds: brand faces read on ink, not all on white', () => {
        for (const face of Object.values(MARK_FACES)) expect(contrast(face, '#0A0A0A')).toBeGreaterThanOrEqual(3);
        expect(contrast(MARK_FACES.top, '#FFFFFF')).toBeLessThan(3);
        expect(MARK_MONO_OPACITY.top).toBe(1);
    });
});

describe('OrangecheckMark', () => {
    it('renders the same mark as the string', () => {
        for (const variant of ['mono', 'brand', 'tile'] as const) {
            const html = renderToStaticMarkup(createElement(OrangecheckMark, { variant }));
            const fromString = markSvg({ variant });
            expect(polygons(html).map((f) => [attr(f, 'points'), attr(f, 'fill'), attr(f, 'fill-opacity')])).toEqual(
                polygons(fromString).map((f) => [attr(f, 'points'), attr(f, 'fill'), attr(f, 'fill-opacity')])
            );
            expect(attr(html, 'width')).toBe(attr(fromString, 'width'));
            expect(attr(html, 'height')).toBe(attr(fromString, 'height'));
            const pixelHtml = renderToStaticMarkup(createElement(OrangecheckMark, { variant, pixel: true }));
            const pixelString = markSvg({ variant, pixel: true });
            expect(cells(pixelHtml)).toEqual(cells(pixelString));
            expect(attr(pixelHtml, 'viewBox')).toBe(attr(pixelString, 'viewBox'));
            expect(attr(pixelHtml, 'shape-rendering')).toBe('crispEdges');
        }
    });

    it('takes a title, a px size and the host props', () => {
        const html = renderToStaticMarkup(createElement(OrangecheckMark, { title: 'orangecheck', size: 32, className: 'x' }));
        expect(html).toContain('role="img"');
        expect(html).toContain('<title>orangecheck</title>');
        expect(attr(html, 'width')).toBe('32');
        expect(attr(html, 'height')).toBe('20');
        expect(html).toContain('class="x"');
    });
});

/** An element as its tag, attributes in name order (xmlns aside), text and children: order of attributes is not drawing. */
function shape(el: Element): unknown {
    const attrs = [...el.attributes].filter((a) => a.name !== 'xmlns').map((a) => `${a.name}=${a.value}`).sort();
    return [el.tagName.toLowerCase(), attrs, el.children.length ? [...el.children].map(shape) : el.textContent];
}

describe('markElement', () => {
    it('builds the same drawing as markSvg, node by node', async () => {
        const { JSDOM } = await import('jsdom');
        const { markElement } = await import('./index');
        const doc = new JSDOM('<!doctype html>').window.document;
        for (const [variant, pixel] of [['mono', false], ['brand', false], ['tile', false], ['mono', true], ['brand', true], ['tile', true]] as const) {
            const el = markElement(doc, { variant, title: 'orangecheck', pixel });
            const fromString = new JSDOM(markSvg({ variant, title: 'orangecheck', pixel })).window.document.querySelector('svg')!;
            expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg');
            expect(shape(el)).toEqual(shape(fromString));
        }
    });
});

/** A drawing's cells: each <rect> run in its group's fill, sorted. */
function cells(svg: string): string[] {
    const out: string[] = [];
    for (const g of svg.matchAll(/<g ([^>]*fill="[^"]*"[^>]*)>((?:<rect [^>]*\/>|<rect [^>]*><\/rect>)*)<\/g>/g)) {
        const fill = `${attr(g[1]!, 'fill')}/${attr(g[1]!, 'fill-opacity') ?? 1}`;
        for (const r of g[2]!.matchAll(/<rect ([^>]*?)\/?>/g)) out.push(`${fill} ${attr(r[1]!, 'x')},${attr(r[1]!, 'y')}+${attr(r[1]!, 'width')}`);
    }
    return out.sort();
}

describe('the pixel mark', () => {
    const drawn = readFileSync(join(__dirname, '..', 'test-vectors', 'pixel-mark.txt'), 'utf8')
        .split('\n')
        .filter((l) => l && !l.startsWith('#'));

    it("draws the design's pixel mark exactly, cell by cell, from the same three faces", () => {
        expect(drawn).toHaveLength(20);
        const grid = Array.from({ length: 20 }, () => Array<string>(32).fill('.'));
        const letter = { top: 'T', left: 'L', right: 'R' } as const;
        for (const face of ['top', 'left', 'right'] as const) {
            for (const [x, y, w] of MARK_PIXEL_RUNS[face]) {
                for (let i = x; i < x + w; i++) {
                    expect(grid[y]![i], `cell ${i},${y} drawn twice`).toBe('.');
                    grid[y]![i] = letter[face];
                }
            }
        }
        expect(grid.map((r) => r.join(''))).toEqual(drawn);
    });

    it('is whole cells in whole-pixel steps, crisp, and marked as pixel', () => {
        const svg = markSvg({ variant: 'brand', pixel: true, width: '64' });
        expect(attr(svg, 'viewBox')).toBe('0 0 32 20');
        expect(attr(svg, 'height')).toBe('40');
        expect(svg).toContain('shape-rendering="crispEdges"');
        expect(svg).toContain('data-oc-pixel=""');
        expect(polygons(svg)).toHaveLength(0);
        for (const face of ['top', 'left', 'right'] as const) {
            for (const run of MARK_PIXEL_RUNS[face]) expect(run.every(Number.isInteger)).toBe(true);
        }
        const fills = [...svg.matchAll(/<g fill="([^"]*)"/g)].map((m) => m[1]);
        expect(fills).toEqual([MARK_FACES.left, MARK_FACES.right, MARK_FACES.top]);
    });

    it('centres the mark on the pixel tile, on whole cells', () => {
        const tile = markSvg({ variant: 'tile', pixel: true });
        expect(attr(tile, 'viewBox')).toBe('0 0 48 48');
        expect(tile).toContain(`transform="${MARK_PIXEL_TILE.transform}"`);
        expect(MARK_PIXEL_TILE.transform).toBe(`translate(${(48 - 32) / 2} ${(48 - 20) / 2})`);
        expect(tile).toMatch(/<rect width="48" height="48" rx="12.5" fill="#0A0A0A"\/>/);
    });

    it('draws the same check at every whole-cell scale: every cell once, the faces meeting where they meet', () => {
        const draw = (perUnit: number) => {
            const [w, h] = [16 * perUnit, 10 * perUnit];
            const grid = Array.from({ length: h }, () => Array<string>(w).fill('.'));
            const runs = markPixelRuns(perUnit);
            for (const [face, letter] of [['top', 'T'], ['left', 'L'], ['right', 'R']] as const) {
                for (const [x, y, n] of runs[face]) {
                    for (let i = x; i < x + n; i++) {
                        expect(grid[y]![i], `${perUnit}: cell ${i},${y} drawn twice`).toBe('.');
                        grid[y]![i] = letter;
                    }
                }
            }
            return grid.map((r) => r.join(''));
        };
        expect(draw(2)).toEqual(drawn);
        expect(markPixelRuns(2)).toEqual(MARK_PIXEL_RUNS);
        // One cell a unit, a lockup's: the check's tip, its elbow and the foot of its two sides.
        const small = draw(1);
        expect(small).toHaveLength(10);
        expect(small[0]).toBe('.............TT.');
        expect(small[9]).toBe('.....LR.........');
        expect(draw(1.5)[14]).toBe('........LR..............');
        for (const bad of [0, -1, 1.25, 0.1, 9, Number.NaN]) expect(() => markPixelRuns(bad)).toThrow(RangeError);
    });

    it('takes the mono colour and weights in pixels too', () => {
        const svg = markSvg({ pixel: true });
        expect([...svg.matchAll(/<g ([^>]*)>/g)].map((m) => attr(m[1]!, 'fill-opacity') ?? '1').sort()).toEqual(['0.3', '0.6', '1']);
        expect(svg).not.toMatch(/#[0-9a-f]{6}/i);
        expect(decodeURIComponent(markDataUri({ pixel: true, color: '#111111' }))).toContain('width="32"');
    });
});
