#!/usr/bin/env node
/*
 * Builds and starts a Next site that uses ./analytics and ./og the way the
 * family does (pages router, site-kit left out of transpilePackages, so Next
 * loads it outside its bundle on the server), and asks a static page and a
 * getServerSideProps page for a 200 with the analytics scripts in the HTML,
 * and the og route for a 1200×630 PNG.
 * Also refuses any Next import in the built analytics entry: 0.3.0 imported
 * `next/router.js`, a second copy of the router's module, and a bare
 * `next/router` does not resolve under Node's ESM loader. Run after `yarn build`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const fail = (msg) => {
    console.error(`✗ next: ${msg}`);
    process.exit(1);
};

for (const f of ['analytics.js', 'analytics.mjs']) {
    const src = readFileSync(join(pkg, 'dist', f), 'utf8');
    const hit = src.match(/(?:from\s*|require\(\s*|import\(\s*)["'](next(?:\/[\w./-]*)?)["']/);
    if (hit) fail(`dist/${f} imports ${hit[1]}; ./analytics must not import Next`);
}

const freePort = () =>
    new Promise((resolve) => {
        const s = createServer().listen(0, () => {
            const { port } = s.address();
            s.close(() => resolve(port));
        });
    });

const site = mkdtempSync(join(tmpdir(), 'site-kit-next-'));
let server;
try {
    mkdirSync(join(site, 'node_modules', '@orangecheck'), { recursive: true });
    for (const dep of readdirSync(join(pkg, 'node_modules'))) {
        if (dep === '@orangecheck' || dep.startsWith('.')) continue;
        symlinkSync(join(pkg, 'node_modules', dep), join(site, 'node_modules', dep));
    }
    for (const dep of readdirSync(join(pkg, 'node_modules', '@orangecheck'))) {
        symlinkSync(join(pkg, 'node_modules', '@orangecheck', dep), join(site, 'node_modules', '@orangecheck', dep));
    }
    symlinkSync(pkg, join(site, 'node_modules', '@orangecheck', 'site-kit'));
    mkdirSync(join(site, 'pages'));
    writeFileSync(join(site, 'package.json'), '{"private":true}\n');
    writeFileSync(join(site, 'next.config.mjs'), 'export default {};\n');
    writeFileSync(
        join(site, 'pages', '_app.js'),
        "import { useFamilyPageviews } from '@orangecheck/site-kit/analytics';\n" +
            'export default function App({ Component, pageProps }) {\n' +
            '    useFamilyPageviews();\n' +
            '    return <Component {...pageProps} />;\n' +
            '}\n'
    );
    writeFileSync(
        join(site, 'pages', '_document.js'),
        "import { Head, Html, Main, NextScript } from 'next/document';\n" +
            "import { FamilyAnalytics } from '@orangecheck/site-kit/analytics';\n" +
            'export default function Document() {\n' +
            '    return <Html><Head><FamilyAnalytics /></Head><body><Main /><NextScript /></body></Html>;\n' +
            '}\n'
    );
    mkdirSync(join(site, 'pages', 'api'));
    // As stamp and pledge write it, the 0.3 options included.
    writeFileSync(
        join(site, 'pages', 'api', 'og.js'),
        "import { createOgHandler } from '@orangecheck/site-kit/og';\n" +
            "export default createOgHandler({ wordmark: 'oc·stamp', badge: 'V1 · PREVIEW', defaultTitle: 'sign anything.', host: 'STAMP.OCHK.IO', footer: '§', mark: <svg width=\"20\" height=\"20\" />, cards: { create: 'Create a stamp' } });\n"
    );
    writeFileSync(join(site, 'pages', 'index.js'), 'export default function Home() { return <p>static</p>; }\n');
    writeFileSync(
        join(site, 'pages', 'ssr.js'),
        "import { createSeo, defineSite } from '@orangecheck/site-kit/seo';\n" +
            "const { Seo } = createSeo(defineSite({ url: 'https://stamp.ochk.io', name: 'OC Stamp', defaultTitle: 'OC Stamp', defaultDescription: 'd', ogRoute: '/api/og', ogCards: { create: 'Create a stamp' } }));\n" +
            'export default function Ssr({ at }) { return <><Seo title="Create a stamp · OC Stamp" canonical="/ssr" /><p>ssr {at}</p></>; }\n' +
            'export async function getServerSideProps() { return { props: { at: Date.now() } }; }\n'
    );
    const next = join(pkg, 'node_modules', 'next', 'dist', 'bin', 'next');
    const env = { ...process.env, NEXT_TELEMETRY_DISABLED: '1' };
    const build = spawnSync(process.execPath, [next, 'build', '--webpack'], { cwd: site, encoding: 'utf8', env });
    if (build.status !== 0) fail(`the fixture site did not build\n${build.stdout}\n${build.stderr}`);

    const port = await freePort();
    let log = '';
    server = spawn(process.execPath, [next, 'start', '-p', String(port)], { cwd: site, env });
    server.stdout.on('data', (d) => (log += d));
    server.stderr.on('data', (d) => (log += d));
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; ; i++) {
        try {
            await fetch(base);
            break;
        } catch {
            if (i > 100) fail(`next start did not answer\n${log}`);
            await new Promise((r) => setTimeout(r, 200));
        }
    }
    for (const path of ['/', '/ssr']) {
        const res = await fetch(base + path);
        const html = await res.text();
        if (res.status !== 200) fail(`${path} answered ${res.status} under next start\n${log}`);
        if (!html.includes('data-oc-analytics="plausible"')) fail(`${path} has no analytics script`);
        if (path === '/ssr' && !html.includes('property="og:image" content="https://stamp.ochk.io/api/og?page=create"')) {
            fail('/ssr does not share its own card in og:image');
        }
    }
    const pngs = {};
    for (const path of ['/api/og', '/api/og?title=hello&eyebrow=x', '/api/og?page=create']) {
        const res = await fetch(base + path);
        const png = Buffer.from(await res.arrayBuffer());
        if (res.status !== 200) fail(`${path} answered ${res.status} under next start\n${log}`);
        if (res.headers.get('content-type') !== 'image/png') fail(`${path} answered ${res.headers.get('content-type')}`);
        if (png.readUInt32BE(16) !== 1200 || png.readUInt32BE(20) !== 630) fail(`${path} is not 1200×630`);
        pngs[path] = png;
    }
    if (!pngs['/api/og?title=hello&eyebrow=x'].equals(pngs['/api/og'])) fail("/api/og drew a request's own text");
    if (pngs['/api/og?page=create'].equals(pngs['/api/og'])) fail('/api/og?page=create did not draw its card');
    console.log("✓ next: a static and a getServerSideProps page answer 200 under next start, with the analytics scripts, og:image naming the page's card by key, and /api/og a 1200×630 PNG that draws only the site's cards");
} finally {
    server?.kill();
    rmSync(site, { recursive: true, force: true });
}
