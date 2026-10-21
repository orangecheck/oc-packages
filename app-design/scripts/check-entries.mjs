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

const imports = (file) => {
    const src = readFileSync(join(root, file), 'utf8');
    return new Set([...src.matchAll(/(?:require\(|from\s+)["']([^"']+)["']/g)].map((m) => m[1]));
};

for (const [entry, target] of Object.entries(pkg.exports)) {
    if (typeof target === 'string') {
        if (!target.includes('*')) check(existsSync(join(root, target)), `${entry} → ${target} is not built`);
        continue;
    }
    for (const [cond, file] of Object.entries(target)) check(existsSync(join(root, file)), `${entry} (${cond}) → ${file} is not built`);
    for (const file of [target.import, target.require]) {
        const deps = imports(file);
        if (entry !== './session') check(!deps.has('@orangecheck/auth-client'), `${entry} loads the optional peer @orangecheck/auth-client`);
        if (entry === './code' || entry === './format' || entry === './vitest') check(!deps.has('react'), `${entry} loads React`);
        if (entry !== './acknowledgement') check(!/kanstein|bramk\.substack/i.test(readFileSync(join(root, file), 'utf8')), `${entry} carries the credit's name`);
    }
}
check(/Kanstein/.test(readFileSync(join(root, pkg.exports['./acknowledgement'].import), 'utf8')), './acknowledgement does not carry the credit');

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
check(imports(pkg.exports['./session'].require).has('@orangecheck/auth-client'), './session does not read auth-client');

if (failures) {
    console.error(`\n${failures} entry failure(s)`);
    process.exit(1);
}
console.log(`✓ entries: ${checks} checks; the optional peer stays in ./session, ./code, ./format and ./vitest load no React, ./vitest aliases next, only ./acknowledgement names the credit`);
