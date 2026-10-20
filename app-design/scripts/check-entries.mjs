#!/usr/bin/env node
/*
 * Every entry in package.json's exports points at a built file, and the
 * optional peer stays optional: only ./session may load
 * @orangecheck/auth-client, so a site without it can import everything
 * else. ./code and ./format load no React, so a Next config or an OG
 * renderer can import them. Run after `yarn build`.
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
        if (entry === './code' || entry === './format') check(!deps.has('react'), `${entry} loads React`);
    }
}

if (failures) {
    console.error(`\n${failures} entry failure(s)`);
    process.exit(1);
}
console.log(`✓ entries: ${checks} checks; the optional peer stays in ./session, ./code and ./format load no React`);
