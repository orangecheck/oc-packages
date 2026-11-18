/**
 * The orangecheck mark: an isometric check on a 16×10 grid, three faces,
 * drawn smooth or in pixels (the ochk.app design's pixel mark: the same
 * faces, two cells per unit).
 *
 * Framework-free and dependency-free: SVG strings for any page, a data URI
 * for CSS and images, and the geometry for a renderer that draws its own.
 * The React component is in `@orangecheck/mark/react`.
 */

/** The three faces as SVG points in the 16×10 box: the check on top, its sides 4 deep. */
export const MARK_POINTS = {
    top: '0,3 2,2 6,4 14,0 16,1 6,6',
    left: '0,3 6,6 6,10 0,7',
    right: '6,6 16,1 16,5 6,10',
} as const;

export const MARK_VIEWBOX = '0 0 16 10';

/** The faces as drawn. For dark grounds only: the top face is about 1.1:1 on white. */
export const MARK_FACES = { top: '#F5F2EF', left: '#FB933C', right: '#EA580B' } as const;

/**
 * One colour, three weights: the check at full strength, the sides as depth.
 * Chosen for the widest smallest step between neighbouring faces and the
 * ground across light, dark and mid-tone (amber, brown) buttons.
 */
export const MARK_MONO_OPACITY = { top: 1, left: 0.6, right: 0.3 } as const;

/** The tile: the faces on an ink square with rounded corners, 24×24. Reads on any ground. */
export const MARK_TILE = {
    viewBox: '0 0 24 24',
    radius: 6.25,
    fill: '#0A0A0A',
    transform: 'translate(4.25 7.15) scale(0.97)',
} as const;

/** The pixel mark: two cells per unit, 32×20 cells. Crisp where one cell is a whole number of device pixels. */
export const MARK_PIXEL = { viewBox: '0 0 32 20', perUnit: 2 } as const;

/** The pixel tile: 48×48 cells, the mark centred on it; crisp at 48, 96, 144, 192 px. */
export const MARK_PIXEL_TILE = { viewBox: '0 0 48 48', radius: 12.5, fill: '#0A0A0A', transform: 'translate(8 14)' } as const;

/** Smallest width the bare mark may be drawn at, in CSS pixels (the tile: the same, square). */
export const MARK_MIN_PX = 16;

/** `mono`: the host's text colour. `brand`: as drawn, on dark grounds. `tile`: the faces on their own ink tile. */
export type MarkVariant = 'mono' | 'brand' | 'tile';

type Face = 'top' | 'left' | 'right';
const ORDER: readonly Face[] = ['left', 'right', 'top'];

function inside(x: number, y: number, poly: ReadonlyArray<readonly [number, number]>): boolean {
    let hit = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
        const [xi, yi] = poly[i]!;
        const [xj, yj] = poly[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
    }
    return hit;
}

/** A face as runs of cells, [x, y, length]: every cell whose centre is inside the face. */
function runs(face: Face, perUnit: number): ReadonlyArray<readonly [number, number, number]> {
    const poly = MARK_POINTS[face].split(' ').map((p) => p.split(',').map(Number) as [number, number]);
    const [w, h] = [16 * perUnit, 10 * perUnit];
    const out: Array<readonly [number, number, number]> = [];
    const at = (i: number, j: number) => inside((i + 0.5) / perUnit, (j + 0.5) / perUnit, poly);
    for (let j = 0; j < h; j++) {
        for (let i = 0; i < w; i++) {
            if (!at(i, j)) continue;
            let k = i;
            while (k < w && at(k, j)) k++;
            out.push([i, j, k - i]);
            i = k;
        }
    }
    return out;
}

export type MarkPixelRuns = Readonly<Record<Face, ReadonlyArray<readonly [number, number, number]>>>;

/**
 * The mark in square cells at `perUnit` cells a unit, per face, as runs [x, y, length]:
 * 1 is 16×10 cells (a lockup beside small type), 1.5 is 24×15, 2 is 32×20 (the design's drawing).
 * The grid must come out whole: 16 and 10 times `perUnit` both integers.
 */
export function markPixelRuns(perUnit: number): MarkPixelRuns {
    if (!(perUnit > 0 && perUnit <= 8 && Number.isInteger(16 * perUnit) && Number.isInteger(10 * perUnit))) {
        throw new RangeError(`@orangecheck/mark: ${perUnit} cells a unit is not a whole grid (16 and 10 times it must be integers)`);
    }
    return { top: runs('top', perUnit), left: runs('left', perUnit), right: runs('right', perUnit) };
}

/** The pixel mark's cells, per face, as runs [x, y, length] on the 32×20 grid. */
export const MARK_PIXEL_RUNS: MarkPixelRuns = markPixelRuns(MARK_PIXEL.perUnit);

export interface MarkSvgOptions {
    variant?: MarkVariant;
    /** An accessible name. Without one the mark is decoration, hidden from assistive technology. */
    title?: string;
    /** Width as a CSS length, `1.6em` by default (the tile `1.5em`); the height follows. Overridable from CSS. */
    width?: string;
    /** Draw it in pixels: crisp at 32 px wide and its multiples (the tile at 48 px and its multiples). */
    pixel?: boolean;
    /** Mono only: every face at full strength, one flat shape. For forced colours and anything that cannot shade. */
    flat?: boolean;
    /** The mono colour. Default `currentColor`; a data URI needs a real colour, since an image inherits none. */
    color?: string;
    /** Added to the `<svg>` element. */
    className?: string;
}

function escape(s: string): string {
    return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

/** A face's opacity in mono: stepped, or full for a flat mark. */
function opacity(face: Face, flat: boolean): number {
    return flat ? 1 : MARK_MONO_OPACITY[face];
}

/** A face's fill attributes: the host's colour at its weight in mono, else the face's own colour. */
function paint(face: Face, variant: MarkVariant, color: string, flat: boolean): string {
    if (variant !== 'mono') return `fill="${MARK_FACES[face]}"`;
    return `fill="${escape(color)}"${opacity(face, flat) === 1 ? '' : ` fill-opacity="${opacity(face, flat)}"`}`;
}

function faces(variant: MarkVariant, color: string, flat = false, pixel = false): string {
    return ORDER.map((face) =>
        pixel
            ? `<g ${paint(face, variant, color, flat)}>${MARK_PIXEL_RUNS[face].map(([x, y, w]) => `<rect x="${x}" y="${y}" width="${w}" height="1"/>`).join('')}</g>`
            : `<polygon points="${MARK_POINTS[face]}" ${paint(face, variant, color, flat)}/>`
    ).join('');
}

/** The height that keeps a CSS length's aspect for the variant: 5/8 for the mark, equal for the tile. */
function heightFor(variant: MarkVariant, width: string): string {
    if (variant === 'tile') return width;
    const m = /^(-?[\d.]+)([a-z%]*)$/i.exec(width.trim());
    return m ? `${(Number(m[1]) * 5) / 8}${m[2]}` : 'auto';
}

/** The default width: the mark one line tall beside its words, the tile a little taller. */
function defaultWidth(variant: MarkVariant): string {
    return variant === 'tile' ? '1.5em' : '1.6em';
}

/**
 * The mark as an SVG string. Sized in em by default, so it follows the
 * font size of the text beside it; a stylesheet can still set its size,
 * since width and height are attributes, not inline styles (no CSP needed).
 */
export function markSvg(options: MarkSvgOptions = {}): string {
    const variant = options.variant ?? 'mono';
    if (variant !== 'mono' && variant !== 'brand' && variant !== 'tile') throw new TypeError(`markSvg: unknown variant ${String(variant)}`);
    const width = options.width ?? defaultWidth(variant);
    const color = options.color ?? 'currentColor';
    const pixel = !!options.pixel;
    const crisp = pixel ? ' shape-rendering="crispEdges"' : '';
    const label = options.title ? `<title>${escape(options.title)}</title>` : '';
    const a11y = options.title ? 'role="img"' : 'aria-hidden="true" focusable="false"';
    const cls = options.className ? ` class="${escape(options.className)}"` : '';
    const size = `width="${escape(width)}" height="${escape(heightFor(variant, width))}"`;
    const tag = pixel ? ' data-oc-pixel=""' : '';
    if (variant === 'tile') {
        const t = pixel ? MARK_PIXEL_TILE : MARK_TILE;
        const side = t.viewBox.split(' ')[2];
        return (
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${t.viewBox}" ${size} ${a11y} data-oc-mark="tile"${tag}${cls}${crisp}>${label}` +
            `<rect width="${side}" height="${side}" rx="${t.radius}" fill="${t.fill}"/>` +
            `<g transform="${t.transform}">${faces('brand', color, false, pixel)}</g></svg>`
        );
    }
    const viewBox = pixel ? MARK_PIXEL.viewBox : MARK_VIEWBOX;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${viewBox}" ${size} ${a11y} data-oc-mark="${variant}"${tag}${cls}${crisp}>${label}${faces(variant, color, options.flat, pixel)}</svg>`;
}

/** The mark as a `data:image/svg+xml` URI, for CSS backgrounds and `<img>`. Mono needs an explicit `color`. */
export function markDataUri(options: MarkSvgOptions = {}): string {
    if ((options.variant ?? 'mono') === 'mono' && (!options.color || options.color === 'currentColor')) {
        throw new TypeError('markDataUri: a mono mark in an image needs a colour; an image inherits none');
    }
    return `data:image/svg+xml,${encodeURIComponent(markSvg({ ...options, width: options.width ?? (options.pixel ? '32' : '16') }))}`;
}

const SVG_NS = 'http://www.w3.org/2000/svg';

/**
 * The mark as an `<svg>` element, built node by node: no HTML parsing, so
 * it works under Trusted Types and any Content-Security-Policy. Same
 * drawing and attributes as markSvg.
 */
export function markElement(doc: Document, options: Omit<MarkSvgOptions, 'className'> & { className?: string } = {}): SVGSVGElement {
    const variant = options.variant ?? 'mono';
    if (variant !== 'mono' && variant !== 'brand' && variant !== 'tile') throw new TypeError(`markElement: unknown variant ${String(variant)}`);
    const width = options.width ?? defaultWidth(variant);
    const color = options.color ?? 'currentColor';
    const pixel = !!options.pixel;
    const tile = pixel ? MARK_PIXEL_TILE : MARK_TILE;
    const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>) => {
        const node = doc.createElementNS(SVG_NS, tag);
        for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
        return node;
    };
    const svg = el('svg', {
        viewBox: variant === 'tile' ? tile.viewBox : pixel ? MARK_PIXEL.viewBox : MARK_VIEWBOX,
        width,
        height: heightFor(variant, width),
        'data-oc-mark': variant,
    });
    if (pixel) {
        svg.setAttribute('data-oc-pixel', '');
        svg.setAttribute('shape-rendering', 'crispEdges');
    }
    if (options.className) svg.setAttribute('class', options.className);
    if (options.title) {
        svg.setAttribute('role', 'img');
        const title = el('title', {});
        title.textContent = options.title;
        svg.append(title);
    } else {
        svg.setAttribute('aria-hidden', 'true');
        svg.setAttribute('focusable', 'false');
    }
    const parent = variant === 'tile' ? el('g', { transform: tile.transform }) : svg;
    if (variant === 'tile') {
        const side = tile.viewBox.split(' ')[2]!;
        svg.append(el('rect', { width: side, height: side, rx: String(tile.radius), fill: tile.fill }), parent);
    }
    for (const face of ORDER) {
        const fill: Record<string, string> = {};
        if (variant === 'mono') {
            fill.fill = color;
            if (opacity(face, !!options.flat) !== 1) fill['fill-opacity'] = String(opacity(face, !!options.flat));
        } else fill.fill = MARK_FACES[face];
        if (pixel) {
            const g = el('g', fill);
            for (const [x, y, w] of MARK_PIXEL_RUNS[face]) g.append(el('rect', { x: String(x), y: String(y), width: String(w), height: '1' }));
            parent.append(g);
        } else parent.append(el('polygon', { points: MARK_POINTS[face], ...fill }));
    }
    return svg;
}
