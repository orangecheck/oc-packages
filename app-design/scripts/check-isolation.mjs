#!/usr/bin/env node
/*
 * The package must never reach a family site. Two ways it could:
 *
 * 1. A CSS rule that matches without the attribute. Every rule outside @theme,
 *    @utility, @keyframes and @font-face has to mention [data-oc-app='ochk'].
 *    (Utilities only exist where a class names them, so they are safe.)
 * 2. An import of the family design system, which would drag its skins and the
 *    shared oc_skin cookie in.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'src');
const files = [];
(function walk(d) {
    for (const e of readdirSync(d)) {
        const p = join(d, e);
        if (statSync(p).isDirectory()) walk(p);
        else files.push(p);
    }
})(root);

/** Split a selector list on commas outside parentheses (:not(a, b) is one selector). */
function splitTopLevel(list) {
    const out = [];
    let depth = 0;
    let cur = '';
    for (const ch of list) {
        if (ch === '(') depth++;
        else if (ch === ')') depth--;
        if (ch === ',' && depth === 0) {
            out.push(cur.trim());
            cur = '';
        } else cur += ch;
    }
    if (cur.trim()) out.push(cur.trim());
    return out;
}

let failures = 0;
const fail = (msg) => {
    console.error(`✗ ${msg}`);
    failures++;
};

for (const f of files.filter((p) => p.endsWith('.css'))) {
    // Strip comments and the at-rules whose bodies are not selectors.
    let css = readFileSync(f, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    for (const at of ['@theme inline', '@theme', '@utility [a-z0-9-]+', '@keyframes [a-z0-9-]+', '@font-face']) {
        const re = new RegExp(`${at}\\s*\\{`, 'g');
        let m;
        while ((m = re.exec(css))) {
            let depth = 0;
            let i = m.index + m[0].length - 1;
            for (; i < css.length; i++) {
                if (css[i] === '{') depth++;
                else if (css[i] === '}' && --depth === 0) break;
            }
            css = css.slice(0, m.index) + css.slice(i + 1);
            re.lastIndex = m.index;
        }
    }
    css = css.replace(/@import[^;]+;/g, '');
    // What is left: rule preludes. Each selector list must be scoped.
    for (const m of css.matchAll(/([^{};]+)\{/g)) {
        const prelude = m[1].trim();
        // @layer / @media wrap rules; their own prelude is not a selector.
        if (!prelude || prelude.startsWith('@')) continue;
        if (/^(from|to|\d+%)/.test(prelude)) continue;
        const selectors = splitTopLevel(prelude);
        for (const s of selectors) {
            if (!s.includes("[data-oc-app='ochk']")) {
                fail(`${relative(root, f)}: unscoped selector "${s}"`);
            }
        }
    }
}

for (const f of files.filter((p) => /\.(ts|tsx)$/.test(p))) {
    const src = readFileSync(f, 'utf8');
    if (/from ['"]@orangecheck\/design/.test(src)) fail(`${relative(root, f)} imports @orangecheck/design`);
    if (/oc_skin|data-oc-theme/.test(src)) fail(`${relative(root, f)} touches the family skin axis`);
}

if (failures) {
    console.error(`\n${failures} isolation failure(s)`);
    process.exit(1);
}
console.log(`✓ isolation: every rule scoped to [data-oc-app='ochk'], no family imports (${files.length} files)`);
