#!/usr/bin/env node
/*
 * appColors (src/tokens) is the palette for places CSS cannot reach: OG
 * images, canvas, charts, email. Each value must equal its variable in
 * tokens.css, or an OG card and the page it links to disagree. Reads the
 * built module, so run it after `yarn build`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '../dist/tokens.js');
if (!existsSync(dist)) {
    console.error('✗ mirror: dist/tokens.js is missing; run yarn build first');
    process.exit(1);
}
const { appColors } = createRequire(import.meta.url)(dist);
const css = readFileSync(join(here, '../src/styles/tokens.css'), 'utf8');

function block(selectorStart) {
    const open = css.indexOf('{', css.indexOf(selectorStart));
    const vars = {};
    for (const m of css.slice(open + 1, css.indexOf('}', open)).matchAll(/--([a-z0-9-]+):\s*(#[0-9a-f]{6})\b/gi)) {
        vars[m[1]] = m[2].toLowerCase();
    }
    return vars;
}
const light = block(":root[data-oc-app='ochk'],");
const modes = { light, dark: { ...light, ...block(":root.dark[data-oc-app='ochk'],") }, brand: light };

let failures = 0;
let checked = 0;
for (const [mode, colors] of Object.entries(appColors)) {
    for (const [key, value] of Object.entries(colors)) {
        // mutedForeground → --muted-foreground; accentInk → --oca-accent-ink.
        const kebab = key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`);
        const vars = modes[mode];
        const want = vars[kebab] ?? vars[`oca-${kebab}`];
        checked++;
        if (!want) {
            console.error(`✗ mirror: appColors.${mode}.${key} has no variable in tokens.css`);
            failures++;
        } else if (want !== String(value).toLowerCase()) {
            console.error(`✗ mirror: appColors.${mode}.${key} is ${value}, tokens.css says ${want}`);
            failures++;
        }
    }
}
if (failures) {
    console.error(`\n${failures} mirror failure(s)`);
    process.exit(1);
}
console.log(`✓ mirror: ${checked} appColors values match tokens.css`);
