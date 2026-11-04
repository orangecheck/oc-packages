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
            // The baked art comes in as base64, as tsup's build inlines it.
            loader: { '.png': 'base64' },
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
    // Tailwind also scans its working directory for sources, so it runs in the package: run from
    // $HOME it read the whole home directory (38 GB, 11-03), and from anywhere else it picks up
    // whatever classes lie there.
    const tw = spawnSync(process.execPath, [join(pkg, 'node_modules/@tailwindcss/cli/dist/index.mjs'), '-i', join(dir, 'input.css'), '-o', join(dir, 'out.css')], { cwd: pkg, encoding: 'utf8' });
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
    // A box-shadow's layers that draw (a colour and a spread), widest first.
    window.__layers = (shadow) => {
        if (!shadow || shadow === 'none') return [];
        const layers = shadow.split(/,(?![^(]*\))/).map((l) => {
            const t = l.trim();
            const colour = t.match(/^(rgba?|oklch|oklab|color|lab|lch|hsla?)\([^)]*\)|^#[\da-f]+/i)?.[0] ?? '';
            const px = (t.slice(colour.length).match(/-?[\d.]+px/g) ?? []).map(parseFloat);
            return { colour, spread: px[3] ?? 0, clear: /^rgba\([^)]*,\s*0\)$/.test(colour) || /\/\s*0\)$/.test(colour) };
        });
        return layers.filter((l) => !l.clear && l.spread > 0).sort((a, b) => b.spread - a.spread);
    };
    // The ring: of the layers that draw, the widest; null when none draws.
    window.__ring = (shadow) => window.__layers(shadow)[0]?.colour ?? null;
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

/**
 * A screenshot's pixels, for checks that read a column of them: Chrome's PNG (8-bit RGB or RGBA,
 * not interlaced) inflated and unfiltered here, so no image library is needed.
 */
export function decodePng(buf) {
    const { inflateSync } = require('node:zlib');
    let pos = 8;
    let width = 0;
    let height = 0;
    let channels = 4;
    const idat = [];
    while (pos < buf.length) {
        const len = buf.readUInt32BE(pos);
        const type = buf.toString('ascii', pos + 4, pos + 8);
        const body = buf.subarray(pos + 8, pos + 8 + len);
        if (type === 'IHDR') {
            width = body.readUInt32BE(0);
            height = body.readUInt32BE(4);
            if (body[8] !== 8 || body[12] !== 0) throw new Error('decodePng: only 8-bit, non-interlaced PNGs');
            channels = body[9] === 6 ? 4 : body[9] === 2 ? 3 : 0;
            if (!channels) throw new Error(`decodePng: colour type ${body[9]}`);
        }
        if (type === 'IDAT') idat.push(body);
        pos += 12 + len;
    }
    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * channels;
    const data = Buffer.alloc(width * height * 4, 255);
    let prev = Buffer.alloc(stride);
    for (let y = 0, i = 0; y < height; y++) {
        const filter = raw[i++];
        const line = Buffer.from(raw.subarray(i, i + stride));
        i += stride;
        for (let x = 0; x < stride; x++) {
            const a = x >= channels ? line[x - channels] : 0;
            const b = prev[x];
            const c = x >= channels ? prev[x - channels] : 0;
            const p = a + b - c;
            const pred = filter === 1 ? a : filter === 2 ? b : filter === 3 ? (a + b) >> 1 : filter === 4 ? (Math.abs(p - a) <= Math.abs(p - b) && Math.abs(p - a) <= Math.abs(p - c) ? a : Math.abs(p - b) <= Math.abs(p - c) ? b : c) : 0;
            line[x] = (line[x] + pred) & 255;
        }
        for (let x = 0; x < width; x++) for (let k = 0; k < channels; k++) data[(y * width + x) * 4 + k] = line[x * channels + k];
        prev = line;
    }
    return { width, height, data };
}
