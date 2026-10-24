import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';

import { MARK_FACES, MARK_MONO_OPACITY, MARK_POINTS, markDataUri, markSvg } from './index';
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
        expect(faces.map((f) => attr(f, 'fill-opacity') ?? '1').sort()).toEqual(['0.45', '0.7', '1']);
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

    it('sizes in em with the 2:1 aspect, as attributes a stylesheet can override, never inline styles', () => {
        const svg = markSvg();
        expect(attr(svg, 'width')).toBe('1.5em');
        expect(attr(svg, 'height')).toBe('0.75em');
        expect(attr(markSvg({ width: '20px' }), 'height')).toBe('10px');
        expect(attr(markSvg({ variant: 'tile' }), 'height')).toBe('1.25em');
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
        }
    });

    it('takes a title, a px size and the host props', () => {
        const html = renderToStaticMarkup(createElement(OrangecheckMark, { title: 'orangecheck', size: 24, className: 'x' }));
        expect(html).toContain('role="img"');
        expect(html).toContain('<title>orangecheck</title>');
        expect(attr(html, 'width')).toBe('24');
        expect(attr(html, 'height')).toBe('12');
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
        for (const variant of ['mono', 'brand', 'tile'] as const) {
            const el = markElement(doc, { variant, title: 'orangecheck' });
            const fromString = new JSDOM(markSvg({ variant, title: 'orangecheck' })).window.document.querySelector('svg')!;
            expect(el.namespaceURI).toBe('http://www.w3.org/2000/svg');
            expect(shape(el)).toEqual(shape(fromString));
        }
    });
});
