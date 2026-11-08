/*
 * yarn test: every check, in this order, OCA_CHECK_JOBS at a time (3 on CI's four cores, 1 elsewhere,
 * so a shared box runs them in turn). The first failure stops the rest, as the && chain did.
 */
import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const pkg = join(dirname(fileURLToPath(import.meta.url)), '..');

const CHECKS = [
    ['scripts/check-contrast.mjs'],
    ['--disable-warning=MODULE_TYPELESS_PACKAGE_JSON', 'scripts/check-releases.mjs'],
    ['scripts/check-swagger.mjs'],
    ['scripts/check-og.mjs'],
    ['scripts/check-licenses.mjs'],
    ['scripts/check-isolation.mjs'],
    ['scripts/check-shell.mjs'],
    ['scripts/check-mirror.mjs'],
    ['scripts/check-code.mjs'],
    ['scripts/check-entries.mjs'],
    ['scripts/check-square.mjs'],
    ['scripts/check-surface.mjs'],
    ['scripts/check-registry.mjs'],
    ['scripts/check-render.mjs'],
    ['scripts/check-dom.mjs'],
    ['scripts/check-format.mjs'],
    ['scripts/check-fixtures.mjs'],
    ['scripts/check-layout.mjs'],
    ['scripts/check-focus.mjs'],
    ['scripts/check-tabbar.mjs'],
    ['scripts/check-account.mjs'],
    ['scripts/check-header.mjs'],
    ['scripts/check-blocks.mjs'],
    ['scripts/check-budget.mjs'],
    ['scripts/check-next.mjs'],
    ['scripts/art/bake.mjs', '--check'],
    ['scripts/logo/bake.mjs', '--check'],
    ['scripts/check-logo.mjs'],
    ['scripts/check-portrait.mjs'],
    ['scripts/portrait/build.mjs', '--check'],
    ['scripts/og/subset-mono.mjs', '--check'],
    ['scripts/check-compile-scope.mjs'],
    // These count frames, and a busy CPU stretches the frames: each runs with nothing beside it.
    ['scripts/check-idle.mjs'],
    ['scripts/check-idle-motion.mjs'],
];
const ALONE = new Set(['scripts/check-idle.mjs', 'scripts/check-idle-motion.mjs']);

const jobs = Math.max(1, Number(process.env.OCA_CHECK_JOBS) || (process.env.CI ? 3 : 1));
const name = (args) => args.filter((a) => !a.startsWith('--disable-warning')).join(' ');
const running = new Set();
let next = 0;
let failed = null;

function fill() {
    while (!failed && next < CHECKS.length && running.size < jobs) {
        const alone = ALONE.has(name(CHECKS[next]));
        if (running.size > 0 && (alone || [...running].some((c) => c.alone))) return;
        start(CHECKS[next++], alone);
    }
}

function start(args, alone) {
    const t0 = Date.now();
    const child = spawn(process.execPath, args, { cwd: pkg, stdio: ['ignore', 'pipe', 'pipe'] });
    const out = [];
    child.stdout.on('data', (d) => out.push(d));
    child.stderr.on('data', (d) => out.push(d));
    child.alone = alone;
    running.add(child);
    child.on('close', (code, signal) => {
        running.delete(child);
        const secs = ((Date.now() - t0) / 1000).toFixed(0);
        if (child.stopped) {
            console.log(`  · ${name(args)} stopped after ${secs}s`);
        } else if (code === 0) {
            process.stdout.write(Buffer.concat(out));
            console.log(`  · ${name(args)} ${secs}s`);
            fill();
        } else if (!failed) {
            process.stdout.write(Buffer.concat(out));
            failed = `${name(args)} (${signal ?? `exit ${code}`}, ${secs}s)`;
            process.exitCode = 1;
            for (const c of running) {
                c.stopped = true;
                c.kill('SIGTERM');
            }
        }
        if (running.size === 0 && (failed || next >= CHECKS.length)) finish();
    });
}

function finish() {
    if (failed) {
        console.error(`✗ ${failed}; ${CHECKS.length - next} not started`);
        process.exit(1);
    }
    console.log(`✓ ${CHECKS.length} checks, ${jobs} at a time`);
}

fill();
