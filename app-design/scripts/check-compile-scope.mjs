#!/usr/bin/env node
/*
 * compileCss (browser.mjs) runs Tailwind in the package, whatever directory its
 * caller runs in. Tailwind v4 also scans its working directory for sources: a
 * check run from $HOME read the whole home directory (38 GB of memory, 11-03).
 * Here a child process runs compileCss from an empty directory holding one decoy
 * page. None of the decoy's classes may reach the CSS, the package's own must,
 * and it finishes in well under a minute.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

import { pkg } from './browser.mjs';

const cwd = mkdtempSync(join(tmpdir(), 'app-design-scope-cwd-'));
const out = mkdtempSync(join(tmpdir(), 'app-design-scope-out-'));
let failures = 0;
const check = (ok, msg) => {
    if (!ok) {
        console.error(`✗ compile scope: ${msg}`);
        failures++;
    }
};
// The decoy's values are assembled here, so this file, which sits in the package Tailwind scans,
// does not hold the decoy's classes itself.
const [space, hex] = [`${1234.5}px`, `#${'0a0b'}0d`];
try {
    writeFileSync(join(cwd, 'decoy.html'), `<div class="mt-[${space}] bg-[${hex}]">decoy</div>\n`);
    const kit = pathToFileURL(join(pkg, 'scripts/browser.mjs')).href;
    const started = Date.now();
    const run = spawnSync(process.execPath, ['--input-type=module', '-e', `import { compileCss } from ${JSON.stringify(kit)}; compileCss(${JSON.stringify(out)});`], {
        cwd,
        encoding: 'utf8',
        timeout: 120_000,
    });
    const secs = (Date.now() - started) / 1000;
    check(run.status === 0, `compileCss from ${cwd} exited ${run.status} (${run.signal ?? ''}): ${run.stderr.trim().slice(0, 300)}`);
    check(secs < 60, `compileCss took ${secs.toFixed(1)}s from an empty directory`);
    const css = existsSync(join(out, 'out.css')) ? readFileSync(join(out, 'out.css'), 'utf8') : '';
    check(css.includes('.oca-band-ink'), 'the CSS lacks the package\'s own oca-band-ink: it compiled nothing');
    check(!css.includes(space) && !css.includes(hex), "the CSS holds the decoy's classes: Tailwind scanned the caller's directory, not the package");
    if (!failures) console.log(`✓ compile scope: compileCss from another directory scans only the package (${secs.toFixed(1)}s)`);
} finally {
    rmSync(cwd, { recursive: true, force: true });
    rmSync(out, { recursive: true, force: true });
}
if (failures) process.exit(1);
