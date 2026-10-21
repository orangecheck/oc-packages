#!/usr/bin/env node
/*
 * Builds a Next site that uses the package the way the family does (pages
 * router, a basePath, app-design in transpilePackages) and reads the server's
 * HTML: a router link must carry the base path, and the tool shell's sign-in
 * must return to the route it is on. 1.2.2 imported `next/link.js`,
 * which Next left external at SSR, so links lost the router and every link on
 * the docs dropped /docs. Rendering the dist outside Next cannot see that.
 *
 * Since 1.12.0 it also holds the split ESM build to what it is for: an _app
 * that mounts only ErrorBoundary and Toaster stays small; the 404 page, which
 * Vercel runs as a function shipping only what _app, _document and the page
 * trace (and a static page's trace leaves out node_modules), imports nothing
 * from node_modules that those traces do not carry; and FontPreloads names
 * the very file the stylesheet does, base path and hash. Run after `yarn build`.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, realpathSync, rmSync, statSync, symlinkSync, writeFileSync } from 'node:fs';
import { builtinModules, createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');

// A specifier Next's aliases do not know stays external at SSR and loses the router.
const loose = readdirSync(join(pkg, 'dist'))
    .filter((f) => /\.(m?js)$/.test(f))
    .filter((f) => /["']next\/[\w/-]+\.js["']/.test(readFileSync(join(pkg, 'dist', f), 'utf8')));
if (loose.length) {
    console.error(`✗ next: ${loose.join(', ')} import next/*.js; import the bare specifier`);
    process.exit(1);
}

const site = mkdtempSync(join(tmpdir(), 'app-design-next-'));
try {
    mkdirSync(join(site, 'node_modules', '@orangecheck'), { recursive: true });
    for (const dep of readdirSync(join(pkg, 'node_modules'))) {
        if (dep === '@orangecheck' || dep.startsWith('.')) continue;
        symlinkSync(join(pkg, 'node_modules', dep), join(site, 'node_modules', dep));
    }
    for (const dep of readdirSync(join(pkg, 'node_modules', '@orangecheck'))) {
        symlinkSync(join(pkg, 'node_modules', '@orangecheck', dep), join(site, 'node_modules', '@orangecheck', dep));
    }
    symlinkSync(pkg, join(site, 'node_modules', '@orangecheck', 'app-design'));
    mkdirSync(join(site, 'pages'));
    writeFileSync(join(site, 'package.json'), '{"private":true}\n');
    writeFileSync(
        join(site, 'next.config.mjs'),
        // The trace may reach this package's node_modules, which the fixture's are links into.
        "export default { basePath: '/b', transpilePackages: ['@orangecheck/app-design'], outputFileTracingRoot: '/' };\n"
    );
    writeFileSync(
        join(site, 'pages', 'index.js'),
        "import { TextLink } from '@orangecheck/app-design/components';\n" +
            "export default function Home() { return <TextLink href=\"/x\">x</TextLink>; }\n"
    );
    mkdirSync(join(site, 'pages', 'sdk', 'pkg'), { recursive: true });
    writeFileSync(
        join(site, 'pages', 'sdk', 'pkg', 'README.js'),
        "import { DocsShell } from '@orangecheck/app-design/chrome';\n" +
            "import { ProtocolGrid, TextLink } from '@orangecheck/app-design/components';\n" +
            "export default function Readme() {\n" +
            "    return <DocsShell nav={[]} current=\"/sdk/pkg/README\"><TextLink href=\"../other/Thing#x\">rel</TextLink><ProtocolGrid link=\"docs\" protocols={['vote']} /></DocsShell>;\n" +
            "}\n"
    );
    writeFileSync(
        join(site, 'pages', 'verify.js'),
        "import { SessionAccountView, ToolShell } from '@orangecheck/app-design/chrome';\n" +
            "export default function Verify() {\n" +
            "    return <ToolShell protocol=\"stamp\" tools={[]} account={<SessionAccountView state=\"out\" signInPath=\"/signin\" />}>v</ToolShell>;\n" +
            "}\n"
    );
    // The shell every page shares: a boundary, the toaster, the family's styles and fonts.
    writeFileSync(
        join(site, 'pages', '_app.js'),
        "import '@orangecheck/app-design/styles.css';\n" +
            "import { ErrorBoundary } from '@orangecheck/app-design/components';\n" +
            "import { Toaster } from '@orangecheck/app-design/primitives';\n" +
            "export default function App({ Component, pageProps }) { return <ErrorBoundary><Component {...pageProps} /><Toaster /></ErrorBoundary>; }\n"
    );
    writeFileSync(
        join(site, 'pages', '_document.js'),
        "import { Head, Html, Main, NextScript } from 'next/document';\n" +
            "import { FontPreloads } from '@orangecheck/app-design/fonts';\n" +
            "export default function Document() { return <Html data-oc-app=\"ochk\"><Head><FontPreloads /></Head><body><Main /><NextScript /></body></Html>; }\n"
    );
    // A 404 the way a site draws one: the family header and the error page.
    writeFileSync(
        join(site, 'pages', '404.js'),
        "import { SiteHeader } from '@orangecheck/app-design/chrome';\n" +
            "import { OCHK_IO_NAV } from '@orangecheck/app-design/family';\n" +
            "import { ErrorPage } from '@orangecheck/app-design/components';\n" +
            "export default function NotFound() { return <><SiteHeader family=\"home\" nav={OCHK_IO_NAV} /><ErrorPage code={404} /></>; }\n"
    );
    const next = join(pkg, 'node_modules', 'next', 'dist', 'bin', 'next');
    const run = spawnSync(process.execPath, [next, 'build', '--webpack'], {
        cwd: site,
        encoding: 'utf8',
        env: { ...process.env, NEXT_TELEMETRY_DISABLED: '1' },
    });
    if (run.status !== 0) {
        console.error(`✗ next: the fixture site did not build\n${run.stdout}\n${run.stderr}`);
        process.exit(1);
    }
    const html = readFileSync(join(site, '.next', 'server', 'pages', 'index.html'), 'utf8');
    const href = html.match(/<a [^>]*href="([^"]*)"/)?.[1];
    if (href !== '/b/x') {
        console.error(`✗ next: a router link rendered href="${href}" under basePath /b; expected /b/x`);
        process.exit(1);
    }
    // The tool shell: home on the protocol's page, and sign-in returning to this route, base path and all.
    const tool = readFileSync(join(site, '.next', 'server', 'pages', 'verify.html'), 'utf8');
    const signIn = tool.match(/<a [^>]*href="([^"]*)"[^>]*>Sign in</)?.[1];
    if (signIn !== '/signin?return_to=%2Fb%2Fverify') {
        console.error(`✗ next: sign-in rendered href="${signIn}" on /b/verify; expected /signin?return_to=%2Fb%2Fverify`);
        process.exit(1);
    }
    const home = tool.match(/<a [^>]*href="([^"]*)"[^>]*>(?:(?!<\/a>)[\s\S])*<span class="sr-only"> home<\/span>/)?.[1];
    if (home !== 'https://ochk.io/stamp') {
        console.error(`✗ next: the tool shell's home rendered href="${home}"; expected https://ochk.io/stamp`);
        process.exit(1);
    }
    // The docs: a relative link resolves against the page, and a docs card is a router link, both under the base path.
    const readme = readFileSync(join(site, '.next', 'server', 'pages', 'sdk', 'pkg', 'README.html'), 'utf8');
    const rel = readme.match(/<a [^>]*href="([^"]*)"[^>]*>rel</)?.[1];
    const card = readme.match(/<a [^>]*href="([^"]*)"[^>]*>vote</)?.[1];
    if (rel !== '/b/sdk/other/Thing#x' || card !== '/b/vote') {
        console.error(`✗ next: in the docs, a relative link rendered ${rel} (want /b/sdk/other/Thing#x) and a docs card ${card} (want /b/vote)`);
        process.exit(1);
    }
    // The split build: an _app with only a boundary and the toaster carries little of the package.
    const manifest = JSON.parse(readFileSync(join(site, '.next', 'build-manifest.json'), 'utf8'));
    const appChunk = manifest.pages['/_app'].find((f) => /pages\/_app-/.test(f));
    const appKb = statSync(join(site, '.next', appChunk)).size / 1024;
    if (appKb > 120) {
        console.error(`✗ next: _app's own chunk is ${appKb.toFixed(0)} kB for a boundary and a toaster; the package is not splitting`);
        process.exit(1);
    }
    // The 404 function: every package the 404 page imports at run time is in what the function ships.
    const pagesDir = join(site, '.next', 'server', 'pages');
    const trace = (page) => JSON.parse(readFileSync(join(pagesDir, `${page}.js.nft.json`), 'utf8')).files;
    // Real paths on both sides: the fixture's node_modules are links into this package's.
    const shipped = new Set(['_app', '_document', '404'].flatMap(trace).map((f) => resolve(pagesDir, f)).filter(existsSync).map((f) => realpathSync(f)));
    const siteRequire = createRequire(pathToFileURL(join(site, 'package.json')));
    const builtin = new Set(builtinModules.flatMap((m) => [m, `node:${m}`]));
    const missing = new Set();
    for (const file of [join(pagesDir, '404.js'), ...trace('404').filter((f) => f.startsWith('../chunks/')).map((f) => join(pagesDir, f))]) {
        if (!existsSync(file)) continue;
        for (const [, how, spec] of readFileSync(file, 'utf8').matchAll(/(import|require)\("([^".][^"]*)"\)/g)) {
            if (builtin.has(spec) || spec.startsWith('next/') || spec === '@builder.io/partytown/integration') continue;
            let target = null;
            try {
                target = how === 'import' ? fileURLToPath(import.meta.resolve(spec, pathToFileURL(join(site, 'package.json')))) : siteRequire.resolve(spec);
            } catch {}
            if (!target || !shipped.has(realpathSync(target))) missing.add(spec);
        }
    }
    if (missing.size) {
        console.error(`✗ next: the 404 page imports ${[...missing].join(', ')} at run time, which the 404 function does not ship`);
        process.exit(1);
    }
    // FontPreloads names the file the stylesheet does: same hash, under the base path.
    const page = readFileSync(join(site, '.next', 'server', 'pages', 'index.html'), 'utf8');
    const preload = page.match(/<link rel="preload" as="font"[^>]*href="([^"]+)"/)?.[1];
    const css = readdirSync(join(site, '.next', 'static', 'css')).map((f) => readFileSync(join(site, '.next', 'static', 'css', f), 'utf8')).join('');
    const sheetFont = css.match(/url\(([^)]*inter-latin\.[0-9a-f]+\.woff2)\)/)?.[1]?.replace(/["']/g, '');
    if (!preload || !sheetFont || preload !== sheetFont || !preload.startsWith('/b/_next/static/media/')) {
        console.error(`✗ next: FontPreloads named ${preload}; the stylesheet loads ${sheetFont}`);
        process.exit(1);
    }
    console.log(
        `✓ next: router links, relative links and docs cards carry the base path, and sign-in returns to the route; _app ${appKb.toFixed(0)} kB, the 404 function has what the page imports, the font preload is the stylesheet's file, in a real Next build`
    );
} finally {
    rmSync(site, { recursive: true, force: true });
}
