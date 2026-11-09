#!/usr/bin/env node
/*
 * Builds and starts a Next site that uses ./analytics and ./og the way the
 * family does (pages router, site-kit left out of transpilePackages, so Next
 * loads it outside its bundle on the server), and asks a static page and a
 * getServerSideProps page for a 200 with the analytics scripts in the HTML,
 * and the og route for a 1200×630 PNG. Its next.config.ts hashes the page's
 * inline scripts with ./csp while the config loads (app-design's theme script
 * and the analytics) in place of 'unsafe-inline', and `oc-site-kit csp-check`
 * must find every page's scripts in its header. A page view posted to
 * /oc-insights/event, rewritten to ./analytics-event's route, must reach a
 * stand-in upstream with the event, its type, the agent and an address only.
 * Also refuses any Next import in the built analytics entry: 0.3.0 imported
 * `next/router.js`, a second copy of the router's module, and a bare
 * `next/router` does not resolve under Node's ESM loader. Run after `yarn build`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { createServer as createHttpServer } from 'node:http';
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
// Plausible's stand-in: it keeps what reaches it and answers as Plausible does.
const reached = [];
const upstream = createHttpServer((req, res) => {
    let body = '';
    req.on('data', (d) => (body += d));
    req.on('end', () => {
        reached.push({ headers: req.headers, body });
        res.writeHead(202, { 'content-type': 'text/plain' }).end('ok');
    });
});
await new Promise((r) => upstream.listen(0, '127.0.0.1', r));
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
    // TypeScript, so next's config loader compiles it and what it requires, as a family site's does.
    writeFileSync(
        join(site, 'next.config.ts'),
        "import { familyAnalyticsScripts } from '@orangecheck/site-kit/analytics';\n" +
            "import { inlineHashes, themeScript } from '@orangecheck/site-kit/csp';\n" +
            "import { siteHeaders } from '@orangecheck/site-kit/headers';\n" +
            'const scriptHashes = inlineHashes([themeScript(), ...Object.values(familyAnalyticsScripts())]);\n' +
            "export default { transpilePackages: ['@orangecheck/app-design'], async headers() { return siteHeaders({ csp: { scriptHashes } }); }, async rewrites() { return [{ source: '/oc-insights/event', destination: '/api/oc-insights/event' }]; } };\n"
    );
    writeFileSync(
        join(site, 'pages', '_app.js'),
        "import { ThemeProvider } from '@orangecheck/app-design/chrome';\n" +
            "import { useFamilyPageviews } from '@orangecheck/site-kit/analytics';\n" +
            'export default function App({ Component, pageProps }) {\n' +
            '    useFamilyPageviews();\n' +
            '    return <ThemeProvider><Component {...pageProps} /></ThemeProvider>;\n' +
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
    // A site's analytics route, as each site re-exports it; this one's upstream is the stand-in.
    mkdirSync(join(site, 'pages', 'api', 'oc-insights'));
    writeFileSync(
        join(site, 'pages', 'api', 'oc-insights', 'event.js'),
        "import { createAnalyticsEvent } from '@orangecheck/site-kit/analytics-event';\n" +
            `export default createAnalyticsEvent('http://127.0.0.1:${upstream.address().port}/api/event');\n`
    );
    writeFileSync(join(site, 'pages', 'api', 'oc-insights', 'plausible.js'), "export { default } from '@orangecheck/site-kit/analytics-event';\n");
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
    const csp = (await fetch(base)).headers.get('content-security-policy') ?? '';
    if (/script-src[^;]*'unsafe-inline'/.test(csp) || !/script-src[^;]*'sha256-/.test(csp)) {
        fail(`script-src is not on hashes: ${csp}`);
    }
    const check = spawnSync(process.execPath, [join(pkg, 'dist', 'cli.js'), 'csp-check', '--min-pages', '2'], { cwd: site, encoding: 'utf8', env });
    if (check.status !== 0) fail(`csp-check exited ${check.status}\n${check.stdout}\n${check.stderr}`);
    // The page view through the rewrite: the stand-in gets the event, its type, the agent and an address, and nothing of the session.
    const event = '{"n":"pageview","u":"https://stamp.ochk.io/","d":"stamp.ochk.io","r":null}';
    const sent = await fetch(base + '/oc-insights/event', {
        method: 'POST',
        body: event,
        headers: {
            'content-type': 'text/plain',
            'user-agent': 'site-kit-check',
            cookie: 'oc_session=probe-cookie; __Host-oc_session=probe-host',
            authorization: 'Bearer probe-bearer',
            'x-oc-tab-session': 'probe-tab',
            referer: 'https://stamp.ochk.io/private?k=1',
        },
    });
    if (sent.status !== 202 || (await sent.text()) !== 'ok') fail(`/oc-insights/event answered ${sent.status}, not the upstream's 202\n${log}`);
    const got = reached.at(-1);
    if (reached.length !== 1 || got.body !== event) fail(`the upstream got ${reached.length} requests, body ${JSON.stringify(got?.body)}`);
    const leaked = Object.entries(got.headers)
        .filter(([, v]) => /probe/.test(String(v)))
        .map(([k]) => k);
    for (const k of ['cookie', 'authorization', 'x-oc-tab-session', 'referer', 'origin']) if (k in got.headers && !leaked.includes(k)) leaked.push(k);
    if (leaked.length) fail(`the upstream got ${leaked.join(', ')} from the page's request`);
    if (got.headers['user-agent'] !== 'site-kit-check' || got.headers['content-type'] !== 'text/plain' || !/^(127\.0\.0\.1|::1)$/.test(got.headers['x-forwarded-for'] ?? '')) {
        fail(`the upstream did not get the agent, type and address: ${JSON.stringify(got.headers)}`);
    }
    const plain = await fetch(base + '/api/oc-insights/plausible');
    if (plain.status !== 405 || reached.length !== 1) fail(`the re-exported route answered a GET ${plain.status}, not 405`);
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
    console.log('✓ next: /oc-insights/event, rewritten to the kit\'s route, sends the upstream the event, its type, the agent and the address, and no cookie, bearer, tab pin or referer');
    console.log(`✓ next: script-src runs the theme and analytics scripts by hash, and csp-check reads every page clean (${check.stdout.trim().split('\n').pop()})`);
} finally {
    server?.kill();
    upstream.close();
    rmSync(site, { recursive: true, force: true });
}
