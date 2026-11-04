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
 *     constant), is not named in backticks in the [2.0.0] section.
 * A site lane migrates from that list, so nothing it greps for may be missing.
 * Run after `yarn build`.
 *
 *   node scripts/check-surface.mjs                      check
 *   node scripts/check-surface.mjs --write <dist> <package.json> <out.json>
 *                                                       write a baseline from a published dist
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const require = createRequire(import.meta.url);
const ts = require('typescript');

/** Every entry's exports (value, component, function or type) and each component's own prop names. */
export function surface(dist, pkgJson) {
    // Every entry, a folder of files (./art/*) too; the ones with types are read for their exports.
    const entries = Object.keys(JSON.parse(readFileSync(pkgJson, 'utf8')).exports).filter((k) => k !== './package.json');
    const files = Object.fromEntries(entries.filter((e) => !e.includes('*')).map((e) => [e, join(dist, `${e === '.' ? 'index' : e.slice(2)}.d.ts`)]).filter(([, f]) => existsSync(f)));
    const program = ts.createProgram(Object.values(files), { skipLibCheck: true, jsx: ts.JsxEmit.ReactJSX, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
    const checker = program.getTypeChecker();
    // Own props only: those declared in this package's .d.ts, not React's or Radix's HTML attributes.
    const propsOf = (type) => {
        if (!type) return undefined;
        const own = checker
            .getPropertiesOfType(checker.getApparentType(type))
            .filter((p) => (p.declarations ?? []).some((d) => !d.getSourceFile().fileName.includes('node_modules')))
            .map((p) => p.getName())
            .sort();
        return own.length ? own : undefined;
    };
    const out = { entries: entries.sort(), exports: {} };
    for (const [entry, file] of Object.entries(files)) {
        const mod = checker.getSymbolAtLocation(program.getSourceFile(file));
        const exp = {};
        for (const s of mod ? checker.getExportsOfModule(mod) : []) {
            const name = s.getName();
            const target = s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;
            if (target.flags & (ts.SymbolFlags.Interface | ts.SymbolFlags.TypeAlias) && !(target.flags & ts.SymbolFlags.Value)) {
                exp[name] = { kind: 'type' };
                continue;
            }
            const decl = target.valueDeclaration ?? target.declarations?.[0];
            const t = decl ? checker.getTypeOfSymbolAtLocation(target, decl) : undefined;
            const sig = t?.getCallSignatures()[0];
            const component = /^[A-Z]/.test(name) && (sig || t?.getProperties().some((p) => p.getName() === '$$typeof'));
            if (component) {
                const p = sig?.getParameters()[0];
                exp[name] = { kind: 'component', props: p ? propsOf(checker.getTypeOfSymbolAtLocation(p, decl)) : undefined };
            } else exp[name] = { kind: sig ? 'function' : 'value' };
        }
        out.exports[entry] = Object.fromEntries(Object.entries(exp).sort(([a], [b]) => a.localeCompare(b)));
    }
    return out;
}

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
const now = surface(join(root, 'dist'), join(root, 'package.json'));
const log = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');
const section = log.slice(log.indexOf('## [2.0.0]'), log.indexOf('\n## [', log.indexOf('## [2.0.0]') + 1));
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
for (const entry of now.entries) {
    if (!before.entries.includes(entry)) check(named(section, entry), `the new entry ${entry} is not named in the [2.0.0] section`);
}
for (const [entry, exps] of Object.entries(now.exports)) {
    for (const [name, is] of Object.entries(exps)) {
        if (is.kind === 'type' || before.exports[entry]?.[name] || Object.values(before.exports).some((e) => e[name])) continue;
        check(named(section, name), `the new export ${name} (${entry}) is not named in the [2.0.0] section`);
    }
}

if (failures) {
    console.error(`\n${failures} surface failure(s)`);
    process.exit(1);
}
console.log(`✓ surface: ${checks} checks; every 1.29.3 entry, export and prop is still there or named in Migrating, and every new entry and export is in [2.0.0]`);
