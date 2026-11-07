#!/usr/bin/env node
// design.ochk.io's front page lists CHANGELOG.md's releases through readReleases: every release comes through, the newest is package.json's.
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { readReleases } from '../src/releases.data.ts';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');
const md = readFileSync(join(pkg, 'CHANGELOG.md'), 'utf8');
const { version } = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8'));
const headed = [...md.matchAll(/^## \[(\d[^\]]*)\]/gm)].map((m) => m[1]);
const read = readReleases(md).filter((r) => r.version !== 'Unreleased');
const missing = headed.filter((v) => !read.some((r) => r.version === v));
const empty = read.filter((r) => r.lines.some((l) => !l.trim()));
let failed = 0;
const check = (ok, msg) => ok || (console.error(`check-releases: ${msg}`), (failed = 1));
check(read[0]?.version === version, `the newest release read is ${read[0]?.version}, package.json is ${version}`);
check(!missing.length, `releases not read: ${missing.join(', ')}`);
check(!empty.length, `releases with an empty line: ${empty.map((r) => r.version).join(', ')}`);
if (failed) process.exit(1);
console.log(`check-releases: ${read.length} releases read, the newest ${read[0].version}`);
