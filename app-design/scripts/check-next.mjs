#!/usr/bin/env node
/*
 * Builds a Next site that uses the package the way the family does (pages
 * router, a basePath, app-design in transpilePackages) and reads the server's
 * HTML: a router link must carry the base path, and the tool shell's sign-in
 * must return to the route it is on. 1.2.2 imported `next/link.js`,
 * which Next left external at SSR, so links lost the router and every link on
 * the docs dropped /docs. Rendering the dist outside Next cannot see that.
 * Run after `yarn build`.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

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
        "export default { basePath: '/b', transpilePackages: ['@orangecheck/app-design'] };\n"
    );
    writeFileSync(
        join(site, 'pages', 'index.js'),
        "import { TextLink } from '@orangecheck/app-design/components';\n" +
            "export default function Home() { return <TextLink href=\"/x\">x</TextLink>; }\n"
    );
    writeFileSync(
        join(site, 'pages', 'verify.js'),
        "import { SessionAccountView, ToolShell } from '@orangecheck/app-design/chrome';\n" +
            "export default function Verify() {\n" +
            "    return <ToolShell protocol=\"stamp\" tools={[]} account={<SessionAccountView state=\"out\" signInPath=\"/signin\" />}>v</ToolShell>;\n" +
            "}\n"
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
    console.log('✓ next: a router link carries the base path, and sign-in returns to the route, in a real Next build');
} finally {
    rmSync(site, { recursive: true, force: true });
}
