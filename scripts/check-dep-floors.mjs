#!/usr/bin/env node
// Every @orangecheck range a package declares must hold what it imports at the
// range's floor. auth-client 2.37 declared peer auth-core ^2.3.0 but imported
// /family-origins (2.21) and /identifiers (2.22), so ten sites locked on 2.19
// satisfied the range and failed to build. For each package this checks:
//   1. every @orangecheck import is declared (dependency, peer or dev);
//   2. at the floor of every declared range, the subpath is exported and each
//      named import is exported from it (read from the published .d.ts);
//   3. what an installed @orangecheck dependency imports from another
//      @orangecheck package, through the subpaths this package's source
//      imports from it (their files and every file those load), subpaths and
//      names, is there in every version it can meet: for a peer, the version this package's yarn.lock resolves for
//      its own range and that range's floor; for the dependency's own
//      dependency, the version the lock resolves for the dependency's range.
//      Every locked copy of the dependency is read, plus the newest in range.
//      yarn 1 installs no peers, and a peer range can be wider than its
//      imports allow (auth-client 2.37).
// Imports and exports are read with TypeScript's parser, so a string or a
// comment never hides or invents one. An export this check cannot read is a
// problem, never a pass.
//
//   node scripts/check-dep-floors.mjs [--root <dir>]
//
// --root reads another tree of packages (the tests build fixtures with it).
//
// Reads the npm registry, and TypeScript from the repository root's install;
// a floor not yet published is read from this repository when its
// package.json carries that version.
import { execFileSync } from 'node:child_process';
import {
    existsSync,
    mkdirSync,
    mkdtempSync,
    readdirSync,
    readFileSync,
    rmSync,
    statSync,
    writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

const at = process.argv.indexOf('--root');
const ROOT = at > 0 ? resolve(process.argv[at + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCOPE = '@orangecheck/';
// Deprecated on npm and never released again, so a floor here protects nobody.
const FROZEN = new Set(['@orangecheck/ui']);
const FIELDS = ['dependencies', 'peerDependencies', 'devDependencies'];

// --- versions ---------------------------------------------------------------

const parse = (v) => {
    const m = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?$/.exec(v);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : null;
};
const cmp = (a, b) => a[0] - b[0] || a[1] - b[1] || a[2] - b[2];

/** The lowest version a range admits, and a test for membership. Only the forms this repository uses. */
function readRange(range) {
    const r = range.trim();
    let m;
    if ((m = /^\^(\d+\.\d+\.\d+)$/.exec(r))) {
        const lo = parse(m[1]);
        const hi = lo[0] > 0 ? [lo[0] + 1, 0, 0] : lo[1] > 0 ? [0, lo[1] + 1, 0] : [0, 0, lo[2] + 1];
        return { floor: m[1], admits: (v) => cmp(v, lo) >= 0 && cmp(v, hi) < 0 };
    }
    if ((m = /^~(\d+\.\d+\.\d+)$/.exec(r))) {
        const lo = parse(m[1]);
        return { floor: m[1], admits: (v) => cmp(v, lo) >= 0 && cmp(v, [lo[0], lo[1] + 1, 0]) < 0 };
    }
    if ((m = /^>=\s*(\d+\.\d+\.\d+)$/.exec(r))) {
        const lo = parse(m[1]);
        return { floor: m[1], admits: (v) => cmp(v, lo) >= 0 };
    }
    if ((m = /^(\d+\.\d+\.\d+)$/.exec(r))) {
        const at = parse(m[1]);
        return { floor: m[1], admits: (v) => cmp(v, at) === 0 };
    }
    return null;
}

// --- reading source -------------------------------------------------------------

function sourceFiles(dir) {
    const out = [];
    const walk = (d) => {
        for (const name of readdirSync(d)) {
            if (name === 'node_modules' || name === 'dist') continue;
            const p = join(d, name);
            if (statSync(p).isDirectory()) walk(p);
            else if (/\.(ts|tsx|mts|cts|js|mjs|cjs|jsx)$/.test(name) && !name.endsWith('.d.ts')) out.push(p);
        }
    };
    if (existsSync(dir)) walk(dir);
    return out;
}

function parsed(file) {
    const kind = /\.tsx$/.test(file)
        ? ts.ScriptKind.TSX
        : /\.jsx$/.test(file)
          ? ts.ScriptKind.JSX
          : /\.[mc]?ts$/.test(file)
            ? ts.ScriptKind.TS
            : ts.ScriptKind.JS;
    return ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false, kind);
}

/** Names an import or export clause takes: `{ a, b as c }` gives a and b, a default import "default", `* as x` none. */
function clauseNames(node) {
    const names = [];
    if (ts.isImportDeclaration(node)) {
        const clause = node.importClause;
        if (clause?.name) names.push('default');
        const bindings = clause?.namedBindings;
        if (bindings && ts.isNamedImports(bindings)) {
            for (const e of bindings.elements) names.push((e.propertyName ?? e.name).text);
        }
    } else if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        for (const e of node.exportClause.elements) names.push((e.propertyName ?? e.name).text);
    }
    return names;
}

/** Every module a file names: declarations, re-exports, import types, import() and require(). */
export function specifiersIn(file) {
    const found = [];
    const add = (spec, names) => found.push({ spec, names });
    const visit = (node) => {
        if (
            (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
            node.moduleSpecifier &&
            ts.isStringLiteral(node.moduleSpecifier)
        ) {
            add(node.moduleSpecifier.text, clauseNames(node));
        } else if (
            ts.isCallExpression(node) &&
            node.arguments.length > 0 &&
            ts.isStringLiteralLike(node.arguments[0]) &&
            (node.expression.kind === ts.SyntaxKind.ImportKeyword ||
                (ts.isIdentifier(node.expression) && node.expression.text === 'require'))
        ) {
            add(node.arguments[0].text, []);
        } else if (
            ts.isImportEqualsDeclaration(node) &&
            ts.isExternalModuleReference(node.moduleReference) &&
            ts.isStringLiteral(node.moduleReference.expression)
        ) {
            add(node.moduleReference.expression.text, []);
        } else if (
            ts.isImportTypeNode(node) &&
            ts.isLiteralTypeNode(node.argument) &&
            ts.isStringLiteral(node.argument.literal)
        ) {
            add(node.argument.literal.text, []);
        }
        ts.forEachChild(node, visit);
    };
    visit(parsed(file));
    return found;
}

/** Every @orangecheck import in a file, with its subpath and the names it takes. */
export function importsIn(file) {
    return specifiersIn(file).flatMap(({ spec, names }) => {
        const m = /^(@orangecheck\/[a-z0-9-]+)(\/.+)?$/.exec(spec);
        return m ? [{ pkg: m[1], sub: m[2] ? `.${m[2]}` : '.', names, at: file }] : [];
    });
}

// --- the registry ---------------------------------------------------------------

const meta = new Map();
async function registry(name) {
    if (!meta.has(name)) {
        const r = await fetch(`https://registry.npmjs.org/${name.replace('/', '%2f')}`);
        if (r.status === 404) meta.set(name, null);
        else if (!r.ok) throw new Error(`registry answered ${r.status} for ${name}`);
        else meta.set(name, await r.json());
    }
    return meta.get(name);
}

let local = new Map();
/** The manifest a version shipped with, from npm, or from this repository when it is the unreleased one here. */
async function manifest(name, version) {
    const m = await registry(name);
    if (m?.versions?.[version]) return { json: m.versions[version], from: 'npm' };
    const here = local.get(name);
    if (here?.json.version === version) return { json: here.json, from: 'workspace' };
    return null;
}

async function newestIn(name, range) {
    const m = await registry(name);
    const versions = Object.keys(m?.versions ?? {})
        .map((v) => [v, parse(v)])
        .filter(([v, p]) => p && !v.includes('-') && range.admits(p))
        .sort((a, b) => cmp(a[1], b[1]));
    return versions.at(-1)?.[0] ?? null;
}

// --- exports ----------------------------------------------------------------------

/**
 * The types file a subpath's export resolves to; undefined when the subpath is
 * not exported, null when it is but no .d.ts can be read from its entry.
 */
export function exportTarget(json, sub) {
    if (json.exports === undefined) return sub === '.' ? (json.types ?? json.typings ?? null) : undefined;
    const entry = exportEntry(json, sub);
    if (entry === undefined) return undefined;
    const types = (e) =>
        typeof e === 'string'
            ? /\.d\.[mc]?ts$/.test(e)
                ? e
                : null
            : e && typeof e === 'object'
              ? (types(e.types) ?? types(e.import) ?? types(e.default) ?? types(e.require) ?? types(e.node))
              : null;
    return types(entry) ?? (sub === '.' ? (json.types ?? json.typings ?? null) : null);
}

/** A subpath's entry in an exports map (patterns filled in), or undefined when it is not exported. */
function exportEntry(json, sub) {
    const ex = json.exports;
    const map = typeof ex === 'string' || !Object.keys(ex).some((k) => k.startsWith('.')) ? { '.': ex } : ex;
    let entry = map[sub];
    if (entry === undefined) {
        for (const [key, value] of Object.entries(map)) {
            if (!key.includes('*')) continue;
            const [pre, post] = key.split('*');
            if (sub.startsWith(pre) && sub.endsWith(post)) {
                const hole = sub.slice(pre.length, sub.length - post.length);
                entry = JSON.parse(JSON.stringify(value).replaceAll('*', hole));
            }
        }
    }
    return entry === null ? undefined : entry;
}

/** Every file a subpath's export names, code and types alike. */
function entryFiles(json, sub) {
    const entry =
        json.exports === undefined
            ? sub === '.'
                ? [json.main, json.module, json.types, json.typings]
                : undefined
            : exportEntry(json, sub);
    const out = [];
    const walk = (e) => {
        if (typeof e === 'string') out.push(e);
        else if (e && typeof e === 'object') Object.values(e).forEach(walk);
    };
    walk(entry);
    return out;
}

let TMP = null;
const unpacked = new Map();
/** A version's published files, unpacked once per run. */
async function unpack(name, version, json) {
    const key = `${name}@${version}`;
    if (!unpacked.has(key)) {
        if (!TMP) {
            TMP = mkdtempSync(join(tmpdir(), 'dep-floors-'));
            process.on('exit', () => rmSync(TMP, { recursive: true, force: true }));
        }
        const dir = join(TMP, String(unpacked.size));
        mkdirSync(dir);
        const r = await fetch(json.dist.tarball);
        if (!r.ok) throw new Error(`tarball ${key}: ${r.status}`);
        const file = join(dir, 'pkg.tgz');
        writeFileSync(file, Buffer.from(await r.arrayBuffer()));
        execFileSync('tar', ['-xzf', file, '-C', dir]);
        unpacked.set(key, join(dir, 'package'));
    }
    return unpacked.get(key);
}

const hasModifier = (node, kind) =>
    ts.canHaveModifiers(node) && (ts.getModifiers(node) ?? []).some((m) => m.kind === kind);

/**
 * The names a .d.ts exports, following `export * from` into sibling files, or
 * null when the file is missing. `open` names a package it re-exports
 * everything from, whose names this check does not read.
 */
export function dtsExports(file, seen = new Set()) {
    if (seen.has(file)) return { names: new Set(), open: [] };
    seen.add(file);
    const candidates = [file, `${file}.d.ts`, file.replace(/\.(m|c)?js$/, '.d.ts'), join(file, 'index.d.ts')];
    const path = candidates.find((c) => existsSync(c) && statSync(c).isFile());
    if (!path) return null;
    const names = new Set();
    const open = [];
    const bind = (n) => {
        if (ts.isIdentifier(n)) names.add(n.text);
        else for (const e of n.elements) if (!ts.isOmittedExpression(e)) bind(e.name);
    };
    for (const st of parsed(path).statements) {
        if (ts.isExportDeclaration(st)) {
            const from = st.moduleSpecifier && ts.isStringLiteral(st.moduleSpecifier) ? st.moduleSpecifier.text : null;
            if (!st.exportClause) {
                if (from?.startsWith('.')) {
                    const inner = dtsExports(resolve(dirname(path), from), seen);
                    for (const n of inner?.names ?? []) if (n !== 'default') names.add(n);
                    open.push(...(inner?.open ?? []));
                } else if (from) open.push(from);
            } else if (ts.isNamespaceExport(st.exportClause)) names.add(st.exportClause.name.text);
            else for (const e of st.exportClause.elements) names.add(e.name.text);
        } else if (ts.isExportAssignment(st)) {
            names.add('default');
        } else if (hasModifier(st, ts.SyntaxKind.ExportKeyword)) {
            if (hasModifier(st, ts.SyntaxKind.DefaultKeyword)) names.add('default');
            else if (ts.isVariableStatement(st)) for (const d of st.declarationList.declarations) bind(d.name);
            else if (st.name && ts.isIdentifier(st.name)) names.add(st.name.text);
            else if (st.name && ts.isStringLiteral(st.name)) names.add(st.name.text);
        }
    }
    return { names, open };
}

/**
 * Why `dep`@`version` does not hold `sub` and the `names` imported from it, or
 * nothing when it does. A shape this check cannot read is a reason, never a pass.
 */
export async function missing(dep, version, json, sub, names, from) {
    const target = exportTarget(json, sub);
    if (target === undefined) return [`${dep} ${version} does not export "${sub}"`];
    if (!names.length || from !== 'npm') return [];
    if (target === null) return [`${dep} ${version} "${sub}": no .d.ts this check can read in its export entry`];
    const found = dtsExports(join(await unpack(dep, version, json), target));
    if (!found) return [`${dep} ${version} "${sub}": its types file ${target} is not in the package`];
    return names
        .filter((n) => !found.names.has(n))
        .map((n) =>
            found.open.length
                ? `${dep} ${version} "${sub}" has no export ${n} this check can read (it re-exports * from ${found.open.join(', ')})`
                : `${dep} ${version} "${sub}" has no export ${n}`,
        );
}

/** What a yarn 1 lockfile resolves for each @orangecheck package, by the range asked for. */
function lockedVersions(file) {
    const out = new Map();
    if (!existsSync(file)) return out;
    let current = [];
    for (const line of readFileSync(file, 'utf8').split('\n')) {
        if (/^\S/.test(line)) {
            current = [...line.matchAll(/"?(@orangecheck\/[a-z0-9-]+)@([^",]+)"?/g)].map((m) => [
                m[1],
                m[2].replace(/:$/, ''),
            ]);
        } else if (current.length) {
            const v = /^\s+version\s+"([^"]+)"/.exec(line);
            if (!v) continue;
            for (const [pkg, range] of current) {
                if (!out.has(pkg)) out.set(pkg, new Map());
                out.get(pkg).set(range, v[1]);
            }
            current = [];
        }
    }
    return out;
}

/** A relative import from `from`, resolved to the published file it loads, or null. */
function resolveLocal(from, spec) {
    const base = resolve(dirname(from), spec);
    const stem = base.replace(/\.(m|c)?js$/, '');
    const candidates = [
        base,
        `${base}.js`,
        `${base}.mjs`,
        `${base}.cjs`,
        `${base}.d.ts`,
        `${stem}.d.ts`,
        `${stem}.d.mts`,
        `${stem}.d.cts`,
    ];
    candidates.push(join(base, 'index.js'), join(base, 'index.mjs'), join(base, 'index.d.ts'));
    return candidates.find((c) => existsSync(c) && statSync(c).isFile()) ?? null;
}

/**
 * What a published package imports from other @orangecheck packages, through
 * the subpaths `subs` this package imports from it: every file their exports
 * name, and every file those load in turn, by a relative path or by the
 * package's own name. Package, then subpath, then names.
 */
export function distImports(root, self, subs, json) {
    const out = new Map();
    const seen = new Set();
    const queue = subs.flatMap((sub) => entryFiles(json, sub)).map((f) => resolve(root, f));
    while (queue.length) {
        const file = queue.pop();
        if (seen.has(file) || !existsSync(file) || !statSync(file).isFile()) continue;
        seen.add(file);
        if (!/\.(m|c)?js$|\.d\.(m|c)?ts$/.test(file)) continue;
        for (const { spec, names } of specifiersIn(file)) {
            if (spec.startsWith('.')) {
                const next = resolveLocal(file, spec);
                if (next) queue.push(next);
                continue;
            }
            const m = /^(@orangecheck\/[a-z0-9-]+)(\/.+)?$/.exec(spec);
            if (!m) continue;
            const sub = m[2] ? `.${m[2]}` : '.';
            // The package importing itself by name loads its own export, so read that file too.
            if (m[1] === self) {
                queue.push(...entryFiles(json, sub).map((f) => resolve(root, f)));
                continue;
            }
            if (!out.has(m[1])) out.set(m[1], new Map());
            const bySub = out.get(m[1]);
            if (!bySub.has(sub)) bySub.set(sub, new Set());
            for (const n of names) bySub.get(sub).add(n);
        }
    }
    return out;
}

// --- the check ------------------------------------------------------------------

async function main() {
    const packages = readdirSync(ROOT)
        .filter((d) => existsSync(join(ROOT, d, 'package.json')))
        .map((d) => ({ dir: d, json: JSON.parse(readFileSync(join(ROOT, d, 'package.json'), 'utf8')) }))
        .filter((p) => typeof p.json.name === 'string' && p.json.name.startsWith(SCOPE) && !FROZEN.has(p.json.name));
    local = new Map(packages.map((p) => [p.json.name, p]));
    const problems = [];
    const say = (pkg, text) => problems.push(`${pkg}: ${text}`);

    for (const p of packages) {
        const name = p.json.name;
        const declared = [];
        for (const f of FIELDS) {
            for (const [dep, range] of Object.entries(p.json[f] ?? {})) {
                if (dep.startsWith(SCOPE)) declared.push({ field: f, dep, range });
            }
        }
        const uses = new Map();
        for (const file of sourceFiles(join(ROOT, p.dir, 'src'))) {
            for (const use of importsIn(file)) {
                if (use.pkg === name) continue;
                if (!uses.has(use.pkg)) uses.set(use.pkg, []);
                uses.get(use.pkg).push(use);
            }
        }
        // 1 and 2: what it imports, at every floor it declares.
        for (const [dep, list] of uses) {
            const ranges = declared.filter((d) => d.dep === dep);
            if (!ranges.length) {
                say(name, `imports ${dep} (${relative(ROOT, list[0].at)}) but declares no range for it`);
                continue;
            }
            for (const d of ranges) {
                const r = readRange(d.range);
                if (!r) {
                    say(name, `${d.field} ${dep} "${d.range}" is not a range this check reads (^, ~, >= or exact)`);
                    continue;
                }
                const m = await manifest(dep, r.floor);
                if (!m) {
                    say(
                        name,
                        `${d.field} ${dep} ${d.range}: its floor ${r.floor} is not published and not this repository's version`,
                    );
                    continue;
                }
                for (const use of list) {
                    for (const why of await missing(dep, r.floor, m.json, use.sub, use.names, m.from)) {
                        say(name, `${d.field} ${dep} ${d.range}: ${why}, imported in ${relative(ROOT, use.at)}`);
                    }
                }
            }
        }
        // 3: what an installed dependency imports is there, in every version it can meet here.
        const lock = lockedVersions(join(ROOT, p.dir, 'yarn.lock'));
        const installed = declared.filter((d) => d.field !== 'peerDependencies');
        for (const d of installed) {
            const r = readRange(d.range);
            // Only what this package loads from it: the subpaths its own source imports.
            const subs = [...new Set((uses.get(d.dep) ?? []).map((u) => u.sub))];
            if (!r || subs.length === 0) continue;
            for (const version of new Set([...(lock.get(d.dep)?.values() ?? []), await newestIn(d.dep, r)])) {
                if (!version) continue;
                const m = await manifest(d.dep, version);
                if (!m || m.from !== 'npm') continue;
                const wants = distImports(await unpack(d.dep, version, m.json), d.dep, subs, m.json);
                for (const [needed, subs] of wants) {
                    if (needed === name) continue;
                    const ownRange = m.json.dependencies?.[needed];
                    let held;
                    if (ownRange !== undefined) {
                        // Its own copy: the one the lock resolves for its range, or the newest that range admits.
                        const rr = readRange(ownRange);
                        const v = lock.get(needed)?.get(ownRange) ?? (rr ? await newestIn(needed, rr) : null);
                        if (!v) {
                            say(
                                name,
                                `${d.dep}@${version} depends on ${needed} "${ownRange}", which this check cannot resolve`,
                            );
                            continue;
                        }
                        held = [v];
                    } else {
                        // A peer resolves to this package's own install: its locked version and its floor.
                        held = [
                            ...new Set(
                                installed
                                    .filter((x) => x.dep === needed)
                                    .flatMap((x) => [lock.get(needed)?.get(x.range), readRange(x.range)?.floor])
                                    .filter(Boolean),
                            ),
                        ];
                        if (!held.length) {
                            say(
                                name,
                                `${d.dep}@${version} imports ${needed}, which ${name} does not install (add it to devDependencies)`,
                            );
                            continue;
                        }
                    }
                    for (const v of held) {
                        const hm = await manifest(needed, v);
                        if (!hm) {
                            say(name, `${needed} ${v} is not published, and ${d.dep}@${version} imports it`);
                            continue;
                        }
                        for (const [sub, names] of subs) {
                            for (const why of await missing(needed, v, hm.json, sub, [...names], hm.from)) {
                                say(name, `${why}, which ${d.dep}@${version} imports`);
                            }
                        }
                    }
                }
            }
        }
    }

    if (problems.length) {
        console.error(`dep floors: ${problems.length} problem(s)`);
        for (const p of problems) console.error(`  ${p}`);
        process.exit(1);
    }
    console.log(`dep floors: ${packages.length} packages, every @orangecheck floor holds what it imports`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main();
