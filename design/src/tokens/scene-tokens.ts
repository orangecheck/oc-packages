/**
 * scene-tokens — the token→uniform rail for GPU-rendered backdrops.
 *
 * A WebGL layer cannot read OKLCH custom properties the way CSS can:
 * `getComputedStyle(...).getPropertyValue('--brand')` returns the raw
 * `oklch(…)` string (or an unresolved `color-mix(…)` expression) that no
 * rgb-regex survives. The zero-dependency bridge: a hidden probe element per
 * slot styled `color: color-mix(in srgb, var(--slot), var(--slot))` — the
 * browser performs the OKLCH→sRGB conversion + gamut mapping natively and
 * serializes the computed value as `color(srgb r g b)` (or legacy `rgb(…)`)
 * floats, parsed with one regex.
 *
 * Probes are mounted INSIDE the `.oc-aurora` element so per-skin re-hue hooks
 * (ember's `[data-oc-theme='ember'] .oc-aurora { --au-green; --au-blue }`)
 * apply for free. Change detection is one MutationObserver on <html>
 * (class + data-oc-theme + data-oc-motion) resampling in a double-rAF — it
 * catches next-themes mode flips, system scheme changes, cross-tab cookie
 * pickup, and skin swaps, framework-free (works in Storybook).
 */

export interface OcSceneRGB {
    r: number;
    g: number;
    b: number;
}

export interface OcSceneTokens {
    /** The four aurora hue slots (sRGB 0..1), --au-orange/-green/-blue/-violet. */
    palette: [OcSceneRGB, OcSceneRGB, OcSceneRGB, OcSceneRGB];
    /** Resolved page background (sRGB 0..1). */
    background: OcSceneRGB;
    /** `<html>` carries `.dark`. */
    isDark: boolean;
    /** Ambient-motion switch is off (`data-oc-motion="off"`). */
    motionOff: boolean;
}

const SLOTS = ['--au-orange', '--au-green', '--au-blue', '--au-violet', '--background'] as const;

/** `color(srgb r g b [/ a])` or `rgb(r, g, b)` → 0..1 floats. Null on anything else. */
function parseColor(value: string): OcSceneRGB | null {
    let m = value.match(/color\(srgb\s+([\d.]+)\s+([\d.]+)\s+([\d.]+)/);
    if (m?.[1] != null && m[2] != null && m[3] != null) {
        return { r: +m[1], g: +m[2], b: +m[3] };
    }
    m = value.match(/rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)/);
    if (m?.[1] != null && m[2] != null && m[3] != null) {
        return { r: +m[1] / 255, g: +m[2] / 255, b: +m[3] / 255 };
    }
    return null;
}

/** OKLab round-trip (Ottosson, public domain) — used to pin lightness bands and
 *  cap chroma so gold/phosphor/lightning carry equal visual weight per mode. */
function srgbToOklab({ r, g, b }: OcSceneRGB): { L: number; a: number; b: number } {
    const lin = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
    const lr = lin(r);
    const lg = lin(g);
    const lb = lin(b);
    const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
    const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
    const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
    return {
        L: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
        a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
        b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    };
}

function oklabToSrgb(L: number, a: number, bb: number): OcSceneRGB {
    const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * bb, 3);
    const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * bb, 3);
    const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * bb, 3);
    const lr = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
    const lg = -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s;
    const lb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
    const un = (c: number) =>
        Math.min(1, Math.max(0, c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055));
    return { r: un(lr), g: un(lg), b: un(lb) };
}

/** Pin L into the mode's band + cap chroma (~C≤0.14) so every skin's field
 *  reads with equal weight — the raw brand tokens vary wildly in both. */
export function normalizeHue(c: OcSceneRGB, isDark: boolean): OcSceneRGB {
    const { L, a, b } = srgbToOklab(c);
    const C = Math.hypot(a, b);
    const targetL = isDark
        ? Math.min(0.75, Math.max(0.55, L))
        : Math.min(0.95, Math.max(0.82, L + 0.25));
    const scale = C > 1e-6 ? Math.min(C, 0.14) / C : 0;
    return oklabToSrgb(targetL, a * scale, b * scale);
}

/**
 * Read the scene tokens by probing INSIDE `host` (normally the `.oc-aurora`
 * element). Returns null if any slot fails to parse — callers treat null as
 * "keep the CSS floor", never as an error.
 */
export function readOcSceneTokens(host: HTMLElement): OcSceneTokens | null {
    if (typeof document === 'undefined') return null;
    const probe = document.createElement('div');
    probe.setAttribute('aria-hidden', 'true');
    probe.style.cssText = 'position:absolute;width:0;height:0;overflow:hidden;pointer-events:none;';
    const cells: HTMLElement[] = SLOTS.map((slot) => {
        const cell = document.createElement('span');
        // color-mix(in srgb, X, X) === X, but forces serialization to color(srgb …)
        cell.style.color = `color-mix(in srgb, var(${slot}), var(${slot}))`;
        probe.appendChild(cell);
        return cell;
    });
    host.appendChild(probe);
    try {
        const parsed = cells.map((cell) => parseColor(getComputedStyle(cell).color));
        const [orange, green, blue, violet, background] = parsed;
        if (!orange || !green || !blue || !violet || !background) return null;
        const root = document.documentElement;
        return {
            palette: [orange, green, blue, violet],
            background,
            isDark: root.classList.contains('dark'),
            motionOff: root.getAttribute('data-oc-motion') === 'off',
        };
    } finally {
        host.removeChild(probe);
    }
}

/**
 * Observe every signal that can recolor or pause a scene: mode class, skin
 * attribute, and the ambient-motion attribute. The callback fires inside a
 * double-rAF so computed styles have settled. Returns an unsubscribe.
 */
export function subscribeOcTheme(cb: () => void): () => void {
    if (typeof document === 'undefined') return () => {};
    let raf1 = 0;
    let raf2 = 0;
    const schedule = () => {
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
        raf1 = requestAnimationFrame(() => {
            raf2 = requestAnimationFrame(cb);
        });
    };
    const mo = new MutationObserver(schedule);
    mo.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['class', 'data-oc-theme', 'data-oc-motion'],
    });
    return () => {
        mo.disconnect();
        cancelAnimationFrame(raf1);
        cancelAnimationFrame(raf2);
    };
}
