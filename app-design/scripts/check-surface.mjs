#!/usr/bin/env node
/*
 * The public surface against the CHANGELOG. scripts/surface-1.29.3.json is
 * every entry, export and component prop that 1.29.3 published, read by the
 * TypeScript checker from its built .d.ts. This check reads the same from
 * dist today and fails when:
 *   - a 1.29.3 entry, export or prop is gone and the CHANGELOG's
 *     "### Migrating from 1.x" does not name it, the export in backticks, and
 *     a prop beside its component on one line;
 *   - a new entry, or a new value export (a component, a function, a
 *     constant), is not named in backticks in the [2.0.0] section, when 2.0.0
 *     shipped it, or in a section above [2.0.0] ([Unreleased] included), when
 *     it came after. scripts/surface-2.0.0.json is 2.0.0's surface, written
 *     from a build of the tagged tree (app-design-v2.0.0, d0b93911) until npm
 *     serves 2.0.0.
 * A site lane migrates from that list, so nothing it greps for may be missing.
 * The snapshot itself is held to npm's published 1.29.3 by
 * check-surface-1.29.3.mjs, a CI step of its own, since it needs the network.
 * Run after `yarn build`.
 *
 *   node scripts/check-surface.mjs                      check
 *   node scripts/check-surface.mjs --write <dist> <package.json> <out.json>
 *                                                       write a baseline from a published dist
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { surface } from './surface.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

if (process.argv[2] === '--write') {
    const [dist, pkgJson, file] = process.argv.slice(3);
    writeFileSync(file, `${JSON.stringify(surface(dist, pkgJson), null, 1)}\n`);
    console.log(`surface: wrote ${file}`);
    process.exit(0);
}

if (!existsSync(join(root, 'dist/index.d.ts'))) {
    console.error('✗ surface: dist is missing; run yarn build first');
    process.exit(1);
}
const before = JSON.parse(readFileSync(join(root, 'scripts/surface-1.29.3.json'), 'utf8'));
const shipped = JSON.parse(readFileSync(join(root, 'scripts/surface-2.0.0.json'), 'utf8'));
const now = surface(join(root, 'dist'), join(root, 'package.json'));
const log = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const section = log.slice(log.indexOf('## [2.0.0]'), log.indexOf('\n## [', log.indexOf('## [2.0.0]') + 1));
// Every section above [2.0.0], [Unreleased] included: where an entry or export 2.0.0 did not ship is named.
const since = log.slice(log.indexOf('## [Unreleased]'), log.indexOf('## [2.0.0]'));
const migrating = section.slice(section.indexOf('### Migrating from 1.x'), section.indexOf('\n### ', section.indexOf('### Migrating from 1.x') + 1));
// Named: inside a code span, as the whole span or as a token in it (`<ThemeColorMeta />`, `Faq variant`).
const named = (text, name) =>
    [...text.matchAll(/`([^`\n]+)`/g)].some(([, span]) => {
        for (let i = span.indexOf(name); i >= 0; i = span.indexOf(name, i + 1)) {
            const edge = (c) => c === undefined || !/[A-Za-z0-9_$]/.test(c);
            if (edge(span[i - 1]) && edge(span[i + name.length])) return true;
        }
        return false;
    });

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ surface: ${msg}`);
        failures++;
    }
};
check(section.length > 0 && migrating.startsWith('### Migrating from 1.x'), 'the CHANGELOG has no [2.0.0] section with a "### Migrating from 1.x"');

for (const entry of before.entries) {
    if (!now.entries.includes(entry)) check(named(migrating, entry.replace(/^\.\//, '')), `entry ${entry} is gone and Migrating does not name it`);
}
for (const [entry, exps] of Object.entries(before.exports)) {
    for (const [name, was] of Object.entries(exps)) {
        const is = now.exports[entry]?.[name];
        if (!is) {
            check(named(migrating, name), `${entry} ${name} is gone and Migrating does not name it`);
            continue;
        }
        for (const prop of was.props ?? []) {
            if (is.props?.includes(prop)) continue;
            const line = migrating.split('\n').find((l) => named(l, name) && named(l, prop));
            check(Boolean(line), `${name}'s prop ${prop} is gone and Migrating names it nowhere beside ${name}`);
        }
    }
}
check(since.startsWith('## [Unreleased]'), 'the CHANGELOG has no [Unreleased] section above [2.0.0]');
// Named where it first shipped: in [2.0.0] for 2.0.0's, above it for one added since.
const where = (in2) => (in2 ? [section, 'the [2.0.0] section'] : [since, '[Unreleased] or a section after 2.0.0']);
for (const entry of now.entries) {
    if (before.entries.includes(entry)) continue;
    const [text, said] = where(shipped.entries.includes(entry));
    check(named(text, entry), `the new entry ${entry} is not named in ${said}`);
}
for (const [entry, exps] of Object.entries(now.exports)) {
    for (const [name, is] of Object.entries(exps)) {
        if (is.kind === 'type' || before.exports[entry]?.[name] || Object.values(before.exports).some((e) => e[name])) continue;
        const [text, said] = where(Boolean(shipped.exports[entry]?.[name] || Object.values(shipped.exports).some((e) => e[name])));
        check(named(text, name), `the new export ${name} (${entry}) is not named in ${said}`);
    }
}

if (failures) {
    console.error(`\n${failures} surface failure(s)`);
    process.exit(1);
}
console.log(`✓ surface: ${checks} checks; every 1.29.3 entry, export and prop is still there or named in Migrating, and every new entry and export is named where it first shipped: [2.0.0], or a section after it`);
