/**
 * Every page of a built site against the Content-Security-Policy it is served
 * with: `oc-site-kit csp-check`, after `next build`.
 *
 * It serves the build (`next start` on a free port) or reads a running one,
 * GETs every page in .next/server/pages-manifest.json (dynamic segments filled
 * with a placeholder, API routes skipped, under the site's basePath) and, for
 * each answer with HTML, hashes every inline script the browser would run and
 * looks for it in the header that came with it. Unit tests cannot see this:
 * the text that matters is what the build serves.
 */
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { join } from 'node:path';

import { cspGaps } from './scan';

export interface CspCheckOptions {
    /** The site's directory, holding .next. Default: the working directory. */
    root?: string;
    /** A running server to read instead of starting `next start`. */
    base?: string;
    /** Fewer pages read than this and the check proves nothing: code 2. Default 10. */
    minPages?: number;
    /** Each line it reports. Default: console.log, and console.error for a failure. */
    log?: (line: string, failure: boolean) => void;
}

export interface CspCheckResult {
    /** Pages with HTML that were read. */
    read: number;
    /** Pages with 'unsafe-inline', an unlisted inline script or an inline handler. */
    failed: number;
    /** 0 clean, 1 a page failed, 2 the check could not run or proved nothing. */
    code: 0 | 1 | 2;
}

const sha256 = (text: string) => createHash('sha256').update(text, 'utf8').digest('base64');

function freePort(): Promise<number> {
    return new Promise((resolve, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const address = server.address();
            const port = typeof address === 'object' && address ? address.port : 0;
            server.close(() => resolve(port));
        });
    });
}

/** `next start` in its own process group, ready once / answers; stop() ends the group. */
async function serve(root: string): Promise<{ base: string; stop: () => void }> {
    const next = createRequire(join(root, 'package.json')).resolve('next/dist/bin/next');
    const port = await freePort();
    const child = spawn(process.execPath, [next, 'start', '-p', String(port), '-H', '127.0.0.1'], {
        cwd: root,
        detached: true,
        stdio: ['ignore', 'ignore', 'inherit'],
    });
    const stop = () => {
        try {
            if (child.pid) process.kill(-child.pid, 'SIGTERM');
        } catch {
            // Already gone.
        }
    };
    process.once('exit', stop);
    let failed: Error | null = null;
    child.once('error', (e) => (failed = e));
    const base = `http://127.0.0.1:${port}`;
    for (let i = 0; i < 120 && child.exitCode === null && !failed; i++) {
        if (await fetch(base).catch(() => null)) return { base, stop };
        await new Promise((r) => setTimeout(r, 500));
    }
    stop();
    throw new Error(`next start did not answer on ${base}${failed ? `: ${(failed as Error).message}` : ''}`);
}

/** Every page route of the build, with its basePath, as a request path. */
function pageRoutes(root: string): string[] {
    const read = (f: string) => JSON.parse(readFileSync(join(root, '.next', f), 'utf8'));
    const basePath: string = read('routes-manifest.json').basePath ?? '';
    return Object.keys(read('server/pages-manifest.json'))
        .filter((r) => !r.startsWith('/api/') && !['/_app', '/_document', '/_error'].includes(r))
        .map((r) => basePath + r.replace(/\[\[?(?:\.\.\.)?[^\]]+\]\]?/g, 'csp-check'))
        .sort();
}

/** Reads every page of the build against its policy. See the module comment. */
export async function cspCheck({
    root = process.cwd(),
    base,
    minPages = 10,
    log = (line, failure) => (failure ? console.error(line) : console.log(line)),
}: CspCheckOptions = {}): Promise<CspCheckResult> {
    const routes = pageRoutes(root);
    const served = base ? null : await serve(root);
    const origin = base ?? served!.base;
    let read = 0;
    let failed = 0;
    let broken = false;
    try {
        for (const route of routes) {
            const res = await fetch(origin + route, { redirect: 'manual' });
            const type = res.headers.get('content-type') ?? '';
            if (!type.includes('text/html')) {
                log(`skip ${route}: ${res.status} ${type || 'no content-type'}`, false);
                continue;
            }
            const csp = res.headers.get('content-security-policy');
            if (!csp) {
                log(`NO POLICY ${route} (${res.status})`, true);
                broken = true;
                continue;
            }
            const gaps = cspGaps(await res.text(), csp, sha256);
            read++;
            const problems = [
                gaps.unsafeInline ? "script-src allows 'unsafe-inline'" : null,
                ...gaps.unlisted.map(
                    (s) => `inline script not in script-src: sha256-${sha256(s)} ${JSON.stringify(s.slice(0, 80))}`
                ),
                ...gaps.handlers.map((h) => `inline handler: ${h}`),
            ].filter((p): p is string => p !== null);
            if (problems.length) {
                failed++;
                log(`FAIL ${route} (${res.status})\n  ${problems.join('\n  ')}`, true);
            }
        }
    } finally {
        served?.stop();
    }
    log(`${read} pages read, ${failed} failing`, false);
    if (read < minPages) {
        log(`Fewer than ${minPages} pages read: the check proves nothing.`, true);
        broken = true;
    }
    return { read, failed, code: failed ? 1 : broken ? 2 : 0 };
}
