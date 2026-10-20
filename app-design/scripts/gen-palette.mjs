#!/usr/bin/env node
/*
 * Writes src/tokens/palette.ts from src/styles/tokens.css: every colour token,
 * light and dark, as data, for what CSS cannot reach (WebGL scenes, canvas
 * charts, OG images, email). `--muted-foreground` is `mutedForeground`;
 * `--oca-chart-1` is `chart1`. An alias (`var(--success)`) is resolved to its
 * colour. `yarn build` runs it, and check-mirror fails while the file
 * disagrees with tokens.css.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const PALETTE_FILE = join(here, '../src/tokens/palette.ts');

function block(css, selectorStart) {
    const open = css.indexOf('{', css.indexOf(selectorStart));
    const body = css.slice(open + 1, css.indexOf('}', open)).replace(/\/\*[\s\S]*?\*\//g, '');
    const vars = {};
    for (const m of body.matchAll(/--([a-z0-9-]+):\s*([^;]+);/gi)) vars[m[1]] = m[2].trim();
    return vars;
}

function resolve(vars) {
    const out = {};
    for (const name of Object.keys(vars)) {
        let v = vars[name];
        for (let hops = 0; hops < 4 && /^var\(--([a-z0-9-]+)\)$/i.test(v); hops++) v = vars[v.match(/^var\(--([a-z0-9-]+)\)$/i)[1]] ?? '';
        if (/^#[0-9a-f]{6}$/i.test(v)) out[name] = v.toLowerCase();
    }
    return out;
}

const camel = (name) => name.replace(/-([a-z0-9])/g, (_, c) => c.toUpperCase());

/** The two palettes, keyed as appColors keys them. */
export function buildPalette(css = readFileSync(join(here, '../src/styles/tokens.css'), 'utf8')) {
    const lightVars = block(css, ":root[data-oc-app='ochk'],");
    const modes = { light: resolve(lightVars), dark: resolve({ ...lightVars, ...block(css, ":root.dark[data-oc-app='ochk'],") }) };
    const out = {};
    for (const [mode, vars] of Object.entries(modes)) {
        const keyed = {};
        for (const [name, hex] of Object.entries(vars)) {
            // The family prefix drops unless a plain token already has that name.
            const bare = name.replace(/^oca-/, '');
            const key = camel(name.startsWith('oca-') && vars[bare] !== undefined ? name : bare);
            if (keyed[key]) throw new Error(`palette: --${name} and another token both become "${key}"`);
            keyed[key] = hex;
        }
        out[mode] = Object.fromEntries(Object.entries(keyed).sort(([a], [b]) => a.localeCompare(b)));
    }
    return out;
}

export function renderPalette(palette = buildPalette()) {
    const obj = (o) => Object.entries(o).map(([k, v]) => `    ${k}: '${v}',`).join('\n');
    return `// Generated from styles/tokens.css by scripts/gen-palette.mjs. Do not edit: change tokens.css and run yarn build.

/** Every colour token in light mode, resolved to its colour. */
export const lightPalette = {
${obj(palette.light)}
} as const;

/** Every colour token in dark mode, resolved to its colour. */
export const darkPalette = {
${obj(palette.dark)}
} as const;
`;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    writeFileSync(PALETTE_FILE, renderPalette());
    const p = buildPalette();
    console.log(`palette: ${Object.keys(p.light).length} light and ${Object.keys(p.dark).length} dark colours`);
}
