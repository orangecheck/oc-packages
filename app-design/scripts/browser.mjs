/*
 * What the Chrome checks share: a Chrome to drive, the package's CSS compiled
 * the way a site compiles it, and client bundles built from the source.
 */
import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

export const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);

/** CI runners carry Chrome (CHROME_BIN); locally, Playwright's. */
export function findChrome() {
    const found = [process.env.OCA_CHROME, process.env.CHROME_BIN, '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
    const cache = join(homedir(), '.cache/ms-playwright');
    if (existsSync(cache)) {
        for (const d of readdirSync(cache).sort().reverse()) {
            found.push(join(cache, d, 'chrome-headless-shell-linux64/chrome-headless-shell'), join(cache, d, 'chrome-linux64/chrome'));
        }
    }
    return found.find((p) => p && existsSync(p));
}

/** Each `name: jsx` becomes dir/name.js, an IIFE that renders into #root. */
export function bundle(dir, sources) {
    const esbuild = require('esbuild');
    for (const [name, code] of Object.entries(sources)) {
        writeFileSync(join(dir, `${name}.jsx`), code);
        esbuild.buildSync({
            entryPoints: [join(dir, `${name}.jsx`)],
            outfile: join(dir, `${name}.js`),
            bundle: true,
            format: 'iife',
            jsx: 'automatic',
            nodePaths: [join(pkg, 'node_modules')],
            define: { 'process.env.NODE_ENV': '"production"' },
            alias: { 'next/link': join(pkg, 'node_modules/next/link.js'), 'next/compat/router': join(pkg, 'node_modules/next/compat/router.js') },
            // next/link reads process.env outside its bundler.
            banner: { js: 'var process = { env: { NODE_ENV: "production" } };' },
            logLevel: 'error',
        });
    }
}

/** The package's CSS as a site compiles it, scanning dist and the bundles, with Inter beside it. */
export function compileCss(dir, bundles = []) {
    writeFileSync(
        join(dir, 'input.css'),
        `@import '${join(pkg, 'node_modules/tailwindcss/index.css')}';\n` +
            `@custom-variant dark (&:is(.dark *));\n` +
            `@source '${join(pkg, 'dist')}';\n` +
            bundles.map((b) => `@source '${join(dir, `${b}.js`)}';\n`).join('') +
            `@import '${join(pkg, 'src/styles.css')}';\n`
    );
    const tw = spawnSync(process.execPath, [join(pkg, 'node_modules/@tailwindcss/cli/dist/index.mjs'), '-i', join(dir, 'input.css'), '-o', join(dir, 'out.css')], { encoding: 'utf8' });
    if (tw.status !== 0) throw new Error(`tailwind: ${tw.stderr}`);
    cpSync(join(pkg, 'src/styles/fonts'), join(dir, 'fonts'), { recursive: true });
}

/** A page in the app's scope; returns its file URL. */
export function writePage(dir, name, body, { script = '', head = '' } = {}) {
    writeFileSync(
        join(dir, `${name}.html`),
        `<!doctype html><html data-oc-app="ochk"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="out.css">${head}</head><body>${body}${script}</body></html>`
    );
    return pathToFileURL(join(dir, `${name}.html`)).href;
}

/** In the page: a CSS colour painted over another as sRGB bytes, a box-shadow's ring, the contrast between two. */
function colourKit() {
    window.__rgb = (fg, bg = '#fff') => {
        const c = document.createElement('canvas');
        c.width = c.height = 1;
        const x = c.getContext('2d', { willReadFrequently: true });
        x.fillStyle = bg;
        x.fillRect(0, 0, 1, 1);
        x.fillStyle = fg;
        x.fillRect(0, 0, 1, 1);
        return [...x.getImageData(0, 0, 1, 1).data.slice(0, 3)];
    };
    // Of the layers that draw, the widest spread; null when none draws.
    window.__ring = (shadow) => {
        if (!shadow || shadow === 'none') return null;
        const layers = shadow.split(/,(?![^(]*\))/).map((l) => {
            const t = l.trim();
            const colour = t.match(/^(rgba?|oklch|oklab|color|lab|lch|hsla?)\([^)]*\)|^#[\da-f]+/i)?.[0] ?? '';
            const px = (t.slice(colour.length).match(/-?[\d.]+px/g) ?? []).map(parseFloat);
            return { colour, spread: px[3] ?? 0, clear: /^rgba\([^)]*,\s*0\)$/.test(colour) || /\/\s*0\)$/.test(colour) };
        });
        return layers.filter((l) => !l.clear && l.spread > 0).sort((a, b) => b.spread - a.spread)[0]?.colour ?? null;
    };
    window.__contrast = (a, b) => {
        const lum = (rgb) => {
            const [r, g, bl] = rgb.map((v) => ((v /= 255) <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
            return 0.2126 * r + 0.7152 * g + 0.0722 * bl;
        };
        const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m);
        return (x + 0.05) / (y + 0.05);
    };
}
export const COLOUR_KIT = `(${colourKit})();`;
