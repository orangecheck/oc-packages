#!/usr/bin/env node
/*
 * What each entry costs a page, and that the costly ones stay apart:
 *
 * - Every ESM entry in package.json's exports, bundled the way a site's
 *   bundler ships it (minified, peers left out), then gzipped. Each has a
 *   ceiling a little over today's size, so growth is a decision, not drift.
 * - ./motion's own code (what a page adds by importing it, beyond the
 *   helpers every page already has from ./primitives, ./components, ./brand
 *   and ./tokens) has a ceiling of its own, and so does its data: the
 *   portrait poster drawn in the page, and the portrait's dots, which load
 *   only when a portrait mounts and the page is idle.
 * - Importing `.` or `./components` reaches none of ./motion's own modules.
 *
 * Run after `yarn build`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { gzipSync } from 'node:zlib';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const esbuild = require('esbuild');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
if (!existsSync(join(root, 'dist/motion.mjs'))) {
    console.error('✗ budget: dist is missing; run yarn build first');
    process.exit(1);
}

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ budget: ${msg}`);
        failures++;
    }
};
const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

// Ceilings in bytes, minified and gzipped, every chunk an entry can load: about 15% over each entry's size
// on 2026-11-03 (app-design 2.0.0-pre). A new entry needs a line here.
const CEILING = {
    '.': 173_500,
    './tokens': 1_500,
    './primitives': 95_000,
    './brand': 23_500,
    './components': 121_000,
    './chrome': 76_000,
    './family': 2_000,
    './code': 5_000,
    './format': 1_500,
    './mdx': 47_000,
    './session': 61_000,
    './acknowledgement': 11_000,
    './vitest': 500,
    './og': 187_500,
    './fonts': 500,
    './motion': 49_500,
};
// ./motion on its own: the eight scenes and their loop. 12.0 KB at the DitherImage commit; 12.8 KB now. The
// 0.8 KB buys the crowd's phone grid, outline ghosts and pair of posters (0.5 KB), the reduced-motion listener
// and the matchMedia guard (0.2 KB), a scene that throws falling back to its still, in a frame or in its first
// layout (0.25 KB), the portrait's second ground (0.2 KB), and list semantics and pass-through props on
// StackCards and Wipe (0.1 KB); the dither's cheaper noise and a shared colour parser gave back 0.2 KB. A page
// pays only for the scenes it imports. Apart: the bust's two poster paths, and each lazy chunk of dots (the
// bust's stipple, 23.8 KB, and the deck portrait kept as an option, 18.1 KB), which load only when a portrait
// asks for them once the page is idle.
const MOTION_OWN = 13 * 1024;
const MOTION_POSTER = 5 * 1024;
const MOTION_LAZY = 26 * 1024;

const peers = [...Object.keys(pkg.peerDependencies ?? {}), ...builtinModules, 'node:*', 'react/jsx-runtime', 'next/link', 'next/router', 'next/compat/router', 'next/head', 'next/image', 'next/dynamic', 'next/og', 'next/font/local'];

/** Every file an ESM file reaches inside dist, statically and by dynamic import. */
function reach(file) {
    const seen = new Map();
    const walk = (f, lazy) => {
        if (seen.has(f)) {
            if (!lazy) seen.get(f).lazy = false;
            return;
        }
        const src = readFileSync(f, 'utf8');
        seen.set(f, { src, lazy });
        for (const [, spec] of src.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)) walk(join(dirname(f), spec), lazy);
        for (const [, spec] of src.matchAll(/import\(\s*["'](\.[^"']+)["']\s*\)/g)) walk(join(dirname(f), spec), true);
    };
    walk(file, false);
    return seen;
}

/** A bundle as a site ships it: minified, peers outside, `outside` files outside too; gzipped bytes. */
async function shipped(entry, outside = new Set()) {
    const r = await esbuild.build({
        entryPoints: [entry],
        bundle: true,
        minify: true,
        write: false,
        format: 'esm',
        splitting: true,
        metafile: true,
        outdir: join(root, '.budget'),
        external: peers,
        loader: { '.woff': 'base64', '.woff2': 'base64' },
        logLevel: 'silent',
        plugins: [
            {
                name: 'outside',
                setup(b) {
                    b.onResolve({ filter: /^\./ }, (a) => {
                        const path = join(a.resolveDir, a.path);
                        return outside.has(path) ? { path, external: true } : undefined;
                    });
                },
            },
        ],
    });
    // The entry and its static chunks count; a chunk only a dynamic import reaches is reported apart.
    const main = r.outputFiles.find((f) => f.path.endsWith(entry.split('/').pop().replace(/\.mjs$/, '.js')));
    const outputs = r.metafile.outputs;
    const key = (f) => Object.keys(outputs).find((k) => f.path.endsWith(k.replace(/^.*\.budget\//, '/')));
    const eager = new Set();
    const walk = (k) => {
        if (!k || eager.has(k)) return;
        eager.add(k);
        for (const i of outputs[k].imports) if (i.kind === 'import-statement' && outputs[i.path]) walk(i.path);
    };
    walk(main && key(main));
    const total = r.outputFiles.filter((f) => f.path.endsWith('.js') && eager.has(key(f))).reduce((n, f) => n + gzipSync(f.contents).length, 0);
    return { main: main ? gzipSync(main.contents).length : 0, total };
}

const rows = [];
for (const [entry, target] of Object.entries(pkg.exports)) {
    if (typeof target === 'string') continue;
    const { total } = await shipped(join(root, target.import));
    rows.push([entry, total]);
    const ceiling = CEILING[entry];
    check(ceiling !== undefined, `${entry} has no ceiling in check-budget.mjs`);
    if (ceiling !== undefined) check(total <= ceiling, `${entry} ships ${kb(total)} gzipped, over its ${kb(ceiling)} ceiling`);
}

// ./motion's own: what is left once the base entries' files are taken as already on the page.
const base = new Set(['./primitives', './components', './brand', './tokens'].flatMap((e) => [...reach(join(root, pkg.exports[e].import)).keys()]));
const motion = reach(join(root, pkg.exports['./motion'].import));
const own = [...motion.keys()].filter((f) => !base.has(f));
const isPoster = (f) => /src\/motion\/portrait-poster\.ts/.test(motion.get(f).src.slice(0, 600));
const lazy = own.filter((f) => motion.get(f).lazy);
const poster = own.filter((f) => !motion.get(f).lazy && isPoster(f));
const gz = (files) => files.reduce((n, f) => n + gzipSync(esbuild.transformSync(motion.get(f).src, { minify: true, format: 'esm' }).code).length, 0);
const code = await shipped(join(root, pkg.exports['./motion'].import), new Set([...base, ...lazy, ...poster]));
check(code.total <= MOTION_OWN, `./motion's own code ships ${kb(code.total)} gzipped, over its ${kb(MOTION_OWN)} ceiling`);
check(gz(poster) <= MOTION_POSTER, `./motion's portrait poster is ${kb(gz(poster))} gzipped, over ${kb(MOTION_POSTER)}`);
check(lazy.length >= 2, "./motion's dots (the bust and the deck portrait) are no longer separate chunks: they would load with the entry");
for (const f of lazy) check(gz([f]) <= MOTION_LAZY, `./motion's lazy ${f.split('/').pop()} is ${kb(gz([f]))} gzipped, over ${kb(MOTION_LAZY)}`);

// Apart: `.` and `./components` reach none of ./motion's own modules (ESM), and their CJS builds carry none of it.
for (const entry of ['.', './components']) {
    const reached = reach(join(root, pkg.exports[entry].import));
    const pulled = own.filter((f) => reached.has(f));
    check(pulled.length === 0, `${entry} pulls in ./motion's own modules: ${pulled.map((f) => f.split('/').pop()).join(', ')}`);
    const cjs = readFileSync(join(root, pkg.exports[entry].require), 'utf8');
    check(!/oca-portrait|ParticlePortrait|CrowdDissolve|oca-marquee/.test(cjs), `${entry} (require) carries ./motion's code`);
}

if (failures) {
    console.error(`\n${failures} budget failure(s)`);
    process.exit(1);
}
const width = Math.max(...rows.map(([e]) => e.length));
console.log(rows.map(([e, n]) => `  ${e.padEnd(width)}  ${kb(n).padStart(9)}`).join('\n'));
console.log(`  ./motion own code ${kb(code.total)}, posters ${kb(gz(poster))}, lazy dots ${lazy.map((f) => kb(gz([f]))).join(' + ')}`);
console.log(`✓ budget: ${checks} checks; every entry under its ceiling, ./motion's own code under ${kb(MOTION_OWN)}, and \`.\` and ./components reach none of it`);
