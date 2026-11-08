/**
 * A site's inline scripts by hash, so its Content-Security-Policy can drop
 * `'unsafe-inline'` from script-src.
 *
 * A site lists the text of every inline script its pages run (its own head
 * scripts, app-design's `logoScript()`, `familyAnalyticsScripts()` from
 * `./analytics`, and `themeScript()` for app-design's ThemeProvider), and
 * passes `inlineHashes(those)` as `scriptHashes` to `buildCsp` from
 * `./headers`, or writes them into its own policy. `oc-site-kit csp-check`
 * then reads every page of the build and fails on an inline script whose
 * hash the header lacks.
 *
 * For next.config and the tests only: it runs Node, never in a page.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';

export { cspGaps, inlineHandlers, inlineScripts, scriptSources } from './scan';
export { cspCheck, type CspCheckOptions, type CspCheckResult } from './check';

/** A script-src source for an inline script's exact text: `'sha256-…'`. */
export function scriptHash(text: string): string {
    return `'sha256-${createHash('sha256').update(text, 'utf8').digest('base64')}'`;
}

/** The hash of each script, once each; an empty one (a beacon that is off) is skipped. */
export function inlineHashes(scripts: readonly string[]): string[] {
    return [...new Set(scripts.filter((s) => s !== '').map(scriptHash))];
}

/** What app-design's ThemeProvider passes next-themes when a site gives it no props. */
export const THEME_PROPS = {
    attribute: 'class',
    enableSystem: true,
    storageKey: 'theme',
    defaultTheme: 'system',
} as const;

/** ThemeProvider props a site sets, and `root`: the site's directory. Default: the working directory. */
export interface ThemeScriptOptions {
    storageKey?: string;
    defaultTheme?: string;
    forcedTheme?: string;
    root?: string;
}

// Run as ESM from app-design's directory, so next-themes, react and react-dom resolve as the
// page's bundle resolves them there: next-themes' ESM build, whose minified text the page carries.
const RENDER = `const [themes, react, server] = await Promise.all([import('next-themes'), import('react'), import('react-dom/server')]);
const h = react.createElement ?? react.default.createElement;
const render = server.renderToStaticMarkup ?? server.default.renderToStaticMarkup;
process.stdout.write(render(h(themes.ThemeProvider, JSON.parse(process.argv[1]))));`;

/** app-design's directory as the site resolves it, else the site's own. */
function renderFrom(root: string): string {
    try {
        return dirname(createRequire(join(root, 'package.json')).resolve('@orangecheck/app-design/package.json'));
    } catch {
        return root;
    }
}

const rendered = new Map<string, string>();

/**
 * The script next-themes writes for app-design's ThemeProvider, which sets
 * the mode's class before the page paints. It is rendered in a node of its
 * own: the script is a function's source, and next.config's loader compiles
 * every module it requires while the config loads, which reprints that
 * source, so a hash of an in-process render matches no page.
 *
 * `next dev` prints it unminified, so dev keeps `'unsafe-inline'` instead
 * (`inlineSources` in `./headers`, which `buildCsp` uses).
 */
export function themeScript({ root = process.cwd(), ...props }: ThemeScriptOptions = {}): string {
    const all = { ...THEME_PROPS, ...props };
    const key = JSON.stringify([root, all]);
    const hit = rendered.get(key);
    if (hit !== undefined) return hit;
    let html: string;
    try {
        html = execFileSync(process.execPath, ['--input-type=module', '-e', RENDER, JSON.stringify(all)], {
            cwd: renderFrom(root),
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
        });
    } catch (e) {
        const stderr = (e as { stderr?: string }).stderr ?? '';
        throw new Error(`site-kit csp: next-themes did not render from ${root}: ${stderr.trim() || String(e)}`);
    }
    const body = /^<script[^>]*>([\s\S]*)<\/script>$/.exec(html)?.[1];
    if (body === undefined) throw new Error(`site-kit csp: next-themes rendered no script: ${html.slice(0, 80)}`);
    rendered.set(key, body);
    return body;
}
