/**
 * The orangecheck mark: an isometric check on a 16×8 grid, three faces.
 *
 * Framework-free and dependency-free: SVG strings for any page, a data URI
 * for CSS and images, and the geometry for a renderer that draws its own.
 * The React component is in `@orangecheck/mark/react`.
 */

/** The three faces as SVG points in the 16×8 box. */
export const MARK_POINTS = {
    top: '0,3 2,2 6,4 14,0 16,1 6,6',
    left: '0,3 6,6 6,8 0,5',
    right: '6,6 16,1 16,3 6,8',
} as const;

export const MARK_VIEWBOX = '0 0 16 8';

/** The faces as drawn. For dark grounds only: the top face is about 1.3:1 on white. */
export const MARK_FACES = { top: '#FED8AB', left: '#FB933C', right: '#EA580B' } as const;

/** One colour, three weights: the check at full strength, the sides as depth. */
export const MARK_MONO_OPACITY = { top: 1, left: 0.7, right: 0.45 } as const;

/** The tile: the faces on an ink square with rounded corners, 24×24. Reads on any ground. */
export const MARK_TILE = {
    viewBox: '0 0 24 24',
    radius: 6.25,
    fill: '#0A0A0A',
    transform: 'translate(4.25 8.1) scale(0.97)',
} as const;

/** Smallest width the bare mark may be drawn at, in CSS pixels (the tile: the same, square). */
export const MARK_MIN_PX = 16;

/** `mono`: the host's text colour. `brand`: as drawn, on dark grounds. `tile`: the faces on their own ink tile. */
export type MarkVariant = 'mono' | 'brand' | 'tile';

export interface MarkSvgOptions {
    variant?: MarkVariant;
    /** An accessible name. Without one the mark is decoration, hidden from assistive technology. */
    title?: string;
    /** Width as a CSS length, `1.5em` by default (the tile `1.25em`); the height follows. Overridable from CSS. */
    width?: string;
    /** The mono colour. Default `currentColor`; a data URI needs a real colour, since an image inherits none. */
    color?: string;
    /** Added to the `<svg>` element. */
    className?: string;
}

const ORDER = ['left', 'right', 'top'] as const;

function escape(s: string): string {
    return s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
}

function faces(variant: MarkVariant, color: string): string {
    return ORDER.map((face) =>
        variant === 'mono'
            ? `<polygon points="${MARK_POINTS[face]}" fill="${escape(color)}"${MARK_MONO_OPACITY[face] === 1 ? '' : ` fill-opacity="${MARK_MONO_OPACITY[face]}"`}/>`
            : `<polygon points="${MARK_POINTS[face]}" fill="${MARK_FACES[face]}"/>`
    ).join('');
}

/** The height that keeps a CSS length's aspect for the variant: half for the mark, equal for the tile. */
function heightFor(variant: MarkVariant, width: string): string {
    if (variant === 'tile') return width;
    const m = /^(-?[\d.]+)([a-z%]*)$/i.exec(width.trim());
    return m ? `${Number(m[1]) / 2}${m[2]}` : 'auto';
}

/**
 * The mark as an SVG string. Sized in em by default, so it follows the
 * font size of the text beside it; a stylesheet can still set its size,
 * since width and height are attributes, not inline styles (no CSP needed).
 */
export function markSvg(options: MarkSvgOptions = {}): string {
    const variant = options.variant ?? 'mono';
    if (variant !== 'mono' && variant !== 'brand' && variant !== 'tile') throw new TypeError(`markSvg: unknown variant ${String(variant)}`);
    const width = options.width ?? (variant === 'tile' ? '1.25em' : '1.5em');
    const color = options.color ?? 'currentColor';
    const label = options.title ? `<title>${escape(options.title)}</title>` : '';
    const a11y = options.title ? 'role="img"' : 'aria-hidden="true" focusable="false"';
    const cls = options.className ? ` class="${escape(options.className)}"` : '';
    const size = `width="${escape(width)}" height="${escape(heightFor(variant, width))}"`;
    if (variant === 'tile') {
        return (
            `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_TILE.viewBox}" ${size} ${a11y} data-oc-mark="tile"${cls}>${label}` +
            `<rect width="24" height="24" rx="${MARK_TILE.radius}" fill="${MARK_TILE.fill}"/>` +
            `<g transform="${MARK_TILE.transform}">${faces('brand', color)}</g></svg>`
        );
    }
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${MARK_VIEWBOX}" ${size} ${a11y} data-oc-mark="${variant}"${cls}>${label}${faces(variant, color)}</svg>`;
}

/** The mark as a `data:image/svg+xml` URI, for CSS backgrounds and `<img>`. Mono needs an explicit `color`. */
export function markDataUri(options: MarkSvgOptions = {}): string {
    if ((options.variant ?? 'mono') === 'mono' && (!options.color || options.color === 'currentColor')) {
        throw new TypeError('markDataUri: a mono mark in an image needs a colour; an image inherits none');
    }
    return `data:image/svg+xml,${encodeURIComponent(markSvg({ ...options, width: options.width ?? '16' }))}`;
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
    const width = options.width ?? (variant === 'tile' ? '1.25em' : '1.5em');
    const color = options.color ?? 'currentColor';
    const el = <K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string>) => {
        const node = doc.createElementNS(SVG_NS, tag);
        for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
        return node;
    };
    const svg = el('svg', {
        viewBox: variant === 'tile' ? MARK_TILE.viewBox : MARK_VIEWBOX,
        width,
        height: heightFor(variant, width),
        'data-oc-mark': variant,
    });
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
    const parent = variant === 'tile' ? el('g', { transform: MARK_TILE.transform }) : svg;
    if (variant === 'tile') svg.append(el('rect', { width: '24', height: '24', rx: String(MARK_TILE.radius), fill: MARK_TILE.fill }), parent);
    for (const face of ORDER) {
        const attrs: Record<string, string> = { points: MARK_POINTS[face] };
        if (variant === 'mono') {
            attrs.fill = color;
            if (MARK_MONO_OPACITY[face] !== 1) attrs['fill-opacity'] = String(MARK_MONO_OPACITY[face]);
        } else attrs.fill = MARK_FACES[face];
        parent.append(el('polygon', attrs));
    }
    return svg;
}
