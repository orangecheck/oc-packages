#!/usr/bin/env node
/*
 * Every entry in package.json's exports points at a built file, and the
 * optional peer stays optional: only ./session may load
 * @orangecheck/auth-client, so a site without it can import everything
 * else. ./code, ./format and ./vitest load no React, so a Next config, an
 * OG renderer or a vitest config can import them; ./vitest's aliases point
 * at real files. Only ./acknowledgement names the person the family credits,
 * so a site that does not import it (ochk.app) carries the name nowhere.
 * Run after `yarn build`.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ entries: ${msg}`);
        failures++;
    }
};

/**
 * An entry's whole module graph inside dist: the ESM build is split into
 * shared chunks, so what an entry loads is what its chunks load. Returns the
 * bare specifiers it reaches and the text of every file it reaches.
 */
function graph(file) {
    const seen = new Set();
    const bare = new Set();
    let text = '';
    const walk = (rel) => {
        const path = join(root, rel);
        if (seen.has(path)) return;
        seen.add(path);
        const src = readFileSync(path, 'utf8');
        text += src;
        for (const [, spec] of src.matchAll(/(?:require\(|from\s+|import\s*\(?)["']([^"']+)["']/g)) {
            if (spec.startsWith('.')) walk(join(dirname(rel), spec));
            else bare.add(spec);
        }
    };
    walk(file);
    return { bare, text };
}

for (const [entry, target] of Object.entries(pkg.exports)) {
    if (typeof target === 'string') {
        if (!target.includes('*')) check(existsSync(join(root, target)), `${entry} → ${target} is not built`);
        continue;
    }
    for (const [cond, file] of Object.entries(target)) check(existsSync(join(root, file)), `${entry} (${cond}) → ${file} is not built`);
    for (const file of [target.import, target.require]) {
        const { bare: deps, text } = graph(file);
        if (entry !== './session') check(!deps.has('@orangecheck/auth-client'), `${entry} loads the optional peer @orangecheck/auth-client`);
        if (entry === './code' || entry === './format' || entry === './vitest') check(!deps.has('react'), `${entry} loads React`);
        if (entry !== './acknowledgement') check(!/kanstein|bramk\.substack/i.test(text), `${entry} carries the credit's name`);
        if (file === target.import) {
            // The ESM build carries Radix and the small helpers itself: a page's function needs only peers and sonner.
            const loose = [...deps].filter((d) => /^@radix-ui\/|^(class-variance-authority|clsx|tailwind-merge)$/.test(d));
            check(loose.length === 0, `${entry} (import) loads ${loose.join(', ')} from node_modules`);
        }
    }
}
check(/Kanstein/.test(graph(pkg.exports['./acknowledgement'].import).text), './acknowledgement does not carry the credit');
// One sonner: sites call its toast() themselves, so the package must use the same copy, never one of its own.
check(!/function toast|toasts?\s*=\s*\[\]/.test(graph(pkg.exports['./primitives'].import).text.replace(/\/\/#.*$/gm, '')) && graph(pkg.exports['./primitives'].import).bare.has('sonner'), './primitives bundles its own sonner instead of importing the site\'s');

// ./vitest: run as a vitest config would, from this package's directory, which has next installed.
{
    const { createRequire } = await import('node:module');
    const { appDesignVitest } = createRequire(import.meta.url)(join(root, pkg.exports['./vitest'].require));
    const preset = appDesignVitest(root);
    for (const id of ['next/link', 'next/router', 'next/compat/router']) {
        const file = preset.resolve.alias[id];
        check(Boolean(file) && existsSync(file) && file.endsWith(`${id.replace(/\//g, '/')}.js`), `./vitest: ${id} is not aliased to its file (${file})`);
    }
    const inline = preset.test.server.deps.inline;
    check(inline.some((r) => r.test('/x/node_modules/@orangecheck/app-design/dist/chrome.mjs')) && inline.some((r) => r.test('C:\\x\\node_modules\\@orangecheck\\app-design\\dist\\chrome.mjs')), './vitest: the package is not inlined');
    check(!inline.some((r) => r.test('/x/node_modules/@orangecheck/design/dist/index.mjs')), './vitest: inlines the classic package too');
}
check(
    pkg.peerDependenciesMeta?.['@orangecheck/auth-client']?.optional === true,
    '@orangecheck/auth-client is not marked an optional peer'
);
check(graph(pkg.exports['./session'].require).bare.has('@orangecheck/auth-client') && graph(pkg.exports['./session'].import).bare.has('@orangecheck/auth-client'), './session does not read auth-client');

if (failures) {
    console.error(`\n${failures} entry failure(s)`);
    process.exit(1);
}
console.log(`✓ entries: ${checks} checks; the optional peer stays in ./session, ./code, ./format and ./vitest load no React, ./vitest aliases next, only ./acknowledgement names the credit`);
