#!/usr/bin/env node
/*
 * check-surface reads scripts/surface-1.29.3.json as given, so an edit to the
 * snapshot could hide a removal (review-me's mutant took StatGrid's `empty`
 * from both the build and the snapshot, and check-surface passed). This holds
 * the snapshot to what npm published:
 *   1. npm pack @orangecheck/app-design@1.29.3 into a temporary directory;
 *   2. its sha512 must equal the integrity pinned below, as the registry gives it;
 *   3. the surface is regenerated from it with surface.mjs, check-surface's own reader;
 *   4. any difference from the committed snapshot fails.
 * It also compares every component prop's type between that tarball and this
 * build (propTypes): a prop that lost a string option, or that was optional and
 * is now required, fails. The CHANGELOG says no prop breaks; check-surface
 * compares names only.
 *
 * It needs the network, so it is a step of its own in the Packages workflow,
 * not part of yarn test. Run after `yarn build`. With --self-test it also runs
 * two mutants on the same tarball, and fails unless each is caught: StatGrid's
 * `empty` cut from the snapshot, and 'ghost' cut from Button's variant in a
 * copy of this build's .d.ts.
 */
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { cpSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { narrowings, propTypes, surface } from './surface.mjs';

const VERSION = '1.29.3';
const INTEGRITY = 'sha512-7x+NuE3IXmYOzvs9QUzFdrpiGOz97ckzvnWjVzh/ObZJ9gy4MiSpV4sbOJgHT+1vA5JjGNSWFgzIsGI8X9V46g==';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const selfTest = process.argv.includes('--self-test');
let failures = 0;
const fail = (msg) => {
    console.error(`✗ surface-${VERSION}: ${msg}`);
    failures++;
};

/** Differences between two surfaces, as readable lines. */
function differences(a, b) {
    const out = [];
    const ea = new Set(a.entries);
    const eb = new Set(b.entries);
    for (const e of ea) if (!eb.has(e)) out.push(`entry ${e} only in the tarball`);
    for (const e of eb) if (!ea.has(e)) out.push(`entry ${e} only in the snapshot`);
    for (const entry of new Set([...Object.keys(a.exports), ...Object.keys(b.exports)])) {
        const xa = a.exports[entry] ?? {};
        const xb = b.exports[entry] ?? {};
        for (const name of new Set([...Object.keys(xa), ...Object.keys(xb)])) {
            if (JSON.stringify(xa[name]) !== JSON.stringify(xb[name])) out.push(`${entry} ${name}: tarball ${JSON.stringify(xa[name])}, snapshot ${JSON.stringify(xb[name])}`);
        }
    }
    return out;
}

// The tarball sits inside the package while it is read, so its .d.ts resolve React and Radix from node_modules.
const work = mkdtempSync(join(tmpdir(), `app-design-${VERSION}-`));
const published = join(root, `.published-${VERSION}`);
rmSync(published, { recursive: true, force: true });
try {
    execFileSync('npm', ['pack', `@orangecheck/app-design@${VERSION}`, '--pack-destination', work, '--silent'], { stdio: ['ignore', 'pipe', 'inherit'] });
    const tgz = readdirSync(work).find((f) => f.endsWith('.tgz'));
    if (!tgz) throw new Error(`npm pack left no tarball in ${work}`);
    const bytes = readFileSync(join(work, tgz));
    const integrity = `sha512-${createHash('sha512').update(bytes).digest('base64')}`;
    if (integrity !== INTEGRITY) fail(`the tarball's integrity is ${integrity}, not the pinned ${INTEGRITY}`);
    mkdirSync(published, { recursive: true });
    execFileSync('tar', ['xzf', join(work, tgz), '-C', published, '--strip-components=1']);

    const snapshot = JSON.parse(readFileSync(join(root, 'scripts/surface-1.29.3.json'), 'utf8'));
    const regenerated = surface(join(published, 'dist'), join(published, 'package.json'));
    const diff = differences(regenerated, snapshot);
    for (const d of diff.slice(0, 20)) fail(`the snapshot disagrees with npm's ${VERSION}: ${d}`);
    if (diff.length > 20) fail(`… and ${diff.length - 20} more differences`);

    const before = propTypes(join(published, 'dist'), join(published, 'package.json'));
    const after = propTypes(join(root, 'dist'), join(root, 'package.json'));
    const narrowed = narrowings(before, after);
    for (const n of narrowed) fail(`a prop narrowed since ${VERSION}: ${n}`);
    const exports = Object.values(regenerated.exports).reduce((n, e) => n + Object.keys(e).length, 0);
    if (!failures) console.log(`✓ surface-${VERSION}: npm's tarball matches its pinned integrity; the snapshot equals its surface (${regenerated.entries.length} entries, ${exports} exports); ${Object.keys(before).length} components keep every string option and optional prop`);

    if (selfTest) {
        // Mutant 1, review-me's: StatGrid's `empty` gone from the snapshot (as a build without it would be snapshotted).
        const mutant = JSON.parse(JSON.stringify(snapshot));
        let cut = 0;
        for (const exps of Object.values(mutant.exports)) {
            const props = exps.StatGrid?.props;
            if (props?.includes('empty')) {
                exps.StatGrid.props = props.filter((p) => p !== 'empty');
                cut++;
            }
        }
        const caught = differences(regenerated, mutant).filter((d) => d.includes('StatGrid'));
        if (cut === 0 || caught.length === 0) fail(`self-test: a snapshot without StatGrid's empty (${cut} cut) was not caught`);
        else console.log(`  self-test: a snapshot without StatGrid's empty is caught (${caught.length} entries differ)`);

        // Mutant 2: 'ghost' cut from Button's variant, in a copy of this build's .d.ts.
        const copy = join(root, `.mutant-${VERSION}`);
        rmSync(copy, { recursive: true, force: true });
        try {
            cpSync(join(root, 'dist'), copy, { recursive: true, filter: (f) => !/\.(m?js|map)$/.test(f) });
            let edits = 0;
            for (const f of readdirSync(copy).filter((x) => x.endsWith('.d.ts'))) {
                const text = readFileSync(join(copy, f), 'utf8');
                // The variant union on buttonVariants' declaration, its own line under the declaration's head.
                const next = text.replace(/(declare const buttonVariants: \(props\?: \(\{\n\s*variant\?: )([^\n]*)/g, (_, head, union) => {
                    const cut = union.replace(/\s*\|\s*"ghost"|"ghost"\s*\|\s*/, '');
                    if (cut !== union) edits++;
                    return head + cut;
                });
                if (next !== text) writeFileSync(join(copy, f), next);
            }
            const ghost = narrowings(before, propTypes(copy, join(root, 'package.json'))).filter((n) => n.includes('Button variant') && n.includes("'ghost'"));
            if (edits === 0 || ghost.length === 0) fail(`self-test: a build whose Button lost 'ghost' (${edits} edits) was not caught`);
            else console.log(`  self-test: a build whose Button lost 'ghost' is caught (${ghost.length} findings, e.g. ${ghost[0].slice(0, 90)}…)`);
        } finally {
            rmSync(copy, { recursive: true, force: true });
        }
    }
} finally {
    rmSync(work, { recursive: true, force: true });
    rmSync(published, { recursive: true, force: true });
}

if (failures) {
    console.error(`\n${failures} surface-${VERSION} failure(s)`);
    process.exit(1);
}
