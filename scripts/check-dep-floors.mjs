#!/usr/bin/env node
// Every @orangecheck range a package declares must hold what it imports at the
// range's floor. auth-client 2.37 declared peer auth-core ^2.3.0 but imported
// /family-origins (2.21) and /identifiers (2.22), so ten sites locked on 2.19
// satisfied the range and failed to build. For each package this checks:
//   1. every @orangecheck import is declared (dependency, peer or dev);
//   2. at the floor of every declared range, the subpath is exported and each
//      named import is exported from it (read from the published .d.ts);
//   3. what an installed @orangecheck dependency imports from a package it does
//      not bring along (a peer) is installed here, and exported both by the
//      version this package's yarn.lock resolves for its own range and by that
//      range's floor. Every locked copy of the dependency is read, plus the
//      newest in range. yarn 1 installs no peers, and a peer range can be wider
//      than its imports allow (auth-client 2.37).
//
//   node scripts/check-dep-floors.mjs [--root <dir>]
//
// --root reads another tree of packages (the tests build fixtures with it).
//
// Reads the npm registry; a floor not yet published is read from this
// repository when its package.json carries that version.
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

const at = process.argv.indexOf('--root');
const ROOT = at > 0 ? resolve(process.argv[at + 1]) : resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SCOPE = '@orangecheck/';
// Deprecated on npm and never released again, so a floor here protects nobody.
const FROZEN = new Map([['@orangecheck/ui', 'unmaintained; use @orangecheck/app-design']]);
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

// --- this repository ----------------------------------------------------------

const packages = readdirSync(ROOT)
    .filter((d) => existsSync(join(ROOT, d, 'package.json')))
    .map((d) => ({ dir: d, json: JSON.parse(readFileSync(join(ROOT, d, 'package.json'), 'utf8')) }))
    .filter((p) => typeof p.json.name === 'string' && p.json.name.startsWith(SCOPE) && !FROZEN.has(p.json.name));
const local = new Map(packages.map((p) => [p.json.name, p]));

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

/** Names a specifier list imports: `{ a, b as c, type D }` gives a, b, D; a default import gives "default". */
function importedNames(clause) {
    const names = [];
    const braces = /\{([\s\S]*?)\}/.exec(clause);
    if (braces) {
        for (const part of braces[1].split(',')) {
            const name = part
                .trim()
                .replace(/^type\s+/, '')
                .split(/\s+as\s+/)[0]
                .trim();
            if (name) names.push(name);
        }
    }
    const head = clause
        .replace(/\{[\s\S]*?\}/, '')
        .replace(/^type\s+/, '')
        .trim();
    if (head && !head.startsWith('*') && /^[A-Za-z_$][\w$]*/.test(head)) names.push('default');
    return names;
}

/** Every @orangecheck import in a file, with its subpath and named imports. Comments and doc examples don't count. */
function importsOf(file) {
    // Template literals and block comments hold code samples, not imports.
    const text = readFileSync(file, 'utf8')
        .replace(/`(?:\\[\s\S]|[^\\`])*`/g, '``')
        .replace(/\/\*[\s\S]*?\*\//g, '');
    const found = [];
    const spec = (s) => {
        const m = new RegExp(`^(${SCOPE.replace('/', '\\/')}[a-z0-9-]+)(/.+)?$`).exec(s);
        return m ? { pkg: m[1], sub: m[2] ? `.${m[2]}` : '.' } : null;
    };
    // An import clause only: a default name, a `{ ... }` list, or `* as x`, never a declaration that a later `from` follows.
    const statement =
        /^[ \t]*(import|export)\s+((?:type\s+)?(?:[A-Za-z_$][\w$]*\s*,?\s*)?(?:\{[^}]*\}|\*(?:\s*as\s+[A-Za-z_$][\w$]*)?)?)\s*from\s*["']([^"']+)["']/gm;
    for (const m of text.matchAll(statement)) {
        const s = spec(m[3]);
        if (s) found.push({ ...s, names: m[2].startsWith('*') ? [] : importedNames(m[2]), at: file });
    }
    for (const m of text.matchAll(/^[ \t]*import\s*["']([^"']+)["']/gm)) {
        const s = spec(m[1]);
        if (s) found.push({ ...s, names: [], at: file });
    }
    for (const line of text.split('\n')) {
        if (/^\s*(\*|\/\/|\/\*)/.test(line)) continue;
        for (const m of line.matchAll(/(?:import|require)\(\s*["']([^"']+)["']\s*\)/g)) {
            const s = spec(m[1]);
            if (s) found.push({ ...s, names: [], at: file });
        }
    }
    return found;
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

/** The `types` file a subpath resolves to, or undefined when the subpath is not exported. */
function exportTarget(json, sub) {
    const ex = json.exports;
    if (ex === undefined) return sub === '.' ? (json.types ?? json.typings ?? '') : undefined;
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
    if (entry === undefined || entry === null) return undefined;
    const pick = (e) =>
        typeof e === 'string'
            ? e
            : (e && (pick(e.types) ?? pick(e.import) ?? pick(e.default) ?? pick(e.require))) || null;
    return typeof entry === 'string' ? (entry.endsWith('.d.ts') ? entry : '') : (pick(entry.types) ?? '');
}

const unpacked = new Map();
const TMP = mkdtempSync(join(tmpdir(), 'dep-floors-'));
process.on('exit', () => rmSync(TMP, { recursive: true, force: true }));
/** A version's published files, unpacked once per run. */
async function unpack(name, version, json) {
    const key = `${name}@${version}`;
    if (!unpacked.has(key)) {
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

/** Names a .d.ts exports, following `export * from` into sibling files. Null when the file is missing. */
function dtsExports(file, seen = new Set()) {
    if (seen.has(file)) return new Set();
    seen.add(file);
    const candidates = [file, `${file}.d.ts`, file.replace(/\.(m|c)?js$/, '.d.ts'), join(file, 'index.d.ts')];
    const path = candidates.find((c) => existsSync(c) && statSync(c).isFile());
    if (!path) return null;
    const text = readFileSync(path, 'utf8')
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(/^\s*\/\/.*$/gm, '');
    const names = new Set();
    for (const m of text.matchAll(/export\s+(?:type\s+)?\{([\s\S]*?)\}/g)) {
        for (const part of m[1].split(',')) {
            const bits = part
                .trim()
                .replace(/^type\s+/, '')
                .split(/\s+as\s+/);
            const name = (bits[1] ?? bits[0]).trim();
            if (name) names.add(name);
        }
    }
    for (const m of text.matchAll(
        /export\s+(?:declare\s+)?(?:default\s+)?(?:abstract\s+)?(?:async\s+)?(?:function\*?|const|let|var|class|interface|type|enum|namespace)\s+([A-Za-z_$][\w$]*)/g,
    ))
        names.add(m[1]);
    if (/export\s+default\b|export\s*\{[^}]*\bas\s+default\b/.test(text)) names.add('default');
    for (const m of text.matchAll(/export\s+\*\s+from\s+["'](\.[^"']+)["']/g)) {
        const inner = dtsExports(resolve(dirname(path), m[1]), seen);
        for (const n of inner ?? []) if (n !== 'default') names.add(n);
    }
    for (const m of text.matchAll(/export\s+\*\s+as\s+([A-Za-z_$][\w$]*)\s+from/g)) names.add(m[1]);
    return names;
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

/** The @orangecheck subpaths a published package's files import, by package. */
function distImports(root, self) {
    const out = new Map();
    const walk = (d) => {
        for (const name of readdirSync(d)) {
            const p = join(d, name);
            if (statSync(p).isDirectory()) {
                if (name !== 'node_modules') walk(p);
            } else if (/\.(m|c)?js$|\.d\.(m|c)?ts$/.test(name)) {
                const text = readFileSync(p, 'utf8');
                const re =
                    /(?:from\s*|import\(\s*|require\(\s*|import\s+)["'](@orangecheck\/[a-z0-9-]+)(\/[^"']+)?["']/g;
                for (const m of text.matchAll(re)) {
                    if (m[1] === self) continue;
                    if (!out.has(m[1])) out.set(m[1], new Set());
                    out.get(m[1]).add(m[2] ? `.${m[2]}` : '.');
                }
            }
        }
    };
    walk(root);
    return out;
}

// --- the check ------------------------------------------------------------------

const problems = [];
const say = (pkg, text) => problems.push(`${pkg}: ${text}`);

async function checkFloor(pkg, field, dep, range, uses) {
    const r = readRange(range);
    if (!r) return say(pkg, `${field} ${dep} "${range}" is not a range this check reads (^, ~, >= or exact)`);
    const m = await manifest(dep, r.floor);
    if (!m)
        return say(
            pkg,
            `${field} ${dep} ${range}: its floor ${r.floor} is not published and not this repository's version`,
        );
    for (const use of uses) {
        const target = exportTarget(m.json, use.sub);
        if (target === undefined) {
            say(
                pkg,
                `${field} ${dep} ${range}: ${r.floor} does not export "${use.sub}", imported in ${relative(ROOT, use.at)}`,
            );
            continue;
        }
        if (m.from !== 'npm' || !use.names.length || !target) continue;
        const root = await unpack(dep, r.floor, m.json);
        const names = dtsExports(join(root, target));
        if (!names) continue;
        for (const n of use.names) {
            if (!names.has(n)) {
                say(
                    pkg,
                    `${field} ${dep} ${range}: ${r.floor} "${use.sub}" has no export ${n}, imported in ${relative(ROOT, use.at)}`,
                );
            }
        }
    }
}

for (const p of packages) {
    const name = p.json.name;
    const declared = new Map();
    for (const f of FIELDS) {
        for (const [dep, range] of Object.entries(p.json[f] ?? {})) {
            if (dep.startsWith(SCOPE)) declared.set(`${f}:${dep}`, { field: f, dep, range });
        }
    }
    const uses = new Map();
    for (const file of sourceFiles(join(ROOT, p.dir, 'src'))) {
        for (const use of importsOf(file)) {
            if (use.pkg === name) continue;
            if (!uses.has(use.pkg)) uses.set(use.pkg, []);
            uses.get(use.pkg).push(use);
        }
    }
    // 1 and 2: what it imports, at every floor it declares.
    for (const [dep, list] of uses) {
        const ranges = [...declared.values()].filter((d) => d.dep === dep);
        if (!ranges.length) {
            say(name, `imports ${dep} (${relative(ROOT, list[0].at)}) but declares no range for it`);
            continue;
        }
        for (const d of ranges) await checkFloor(name, d.field, dep, d.range, list);
    }
    // 3: what an installed dependency imports from outside itself is here, at every version this package can hold.
    const lock = lockedVersions(join(ROOT, p.dir, 'yarn.lock'));
    const installed = [...declared.values()].filter((d) => d.field !== 'peerDependencies');
    for (const d of installed) {
        const r = readRange(d.range);
        if (!r) continue;
        // Every copy of the dependency, nested ones included, resolves what it imports from this package's own install.
        for (const version of new Set([...(lock.get(d.dep)?.values() ?? []), await newestIn(d.dep, r)])) {
            if (!version) continue;
            const m = await manifest(d.dep, version);
            if (!m || m.from !== 'npm') continue;
            const own = new Set(Object.keys(m.json.dependencies ?? {}));
            const wants = distImports(await unpack(d.dep, version, m.json), d.dep);
            for (const [needed, subs] of wants) {
                if (needed === name || own.has(needed)) continue;
                const mine = installed.filter((x) => x.dep === needed);
                const held = new Set(
                    mine.flatMap((x) => [lock.get(needed)?.get(x.range), readRange(x.range)?.floor].filter(Boolean)),
                );
                if (!held.size) {
                    say(
                        name,
                        `${d.dep}@${version} imports ${needed}, which ${name} does not install (add it to devDependencies)`,
                    );
                    continue;
                }
                for (const v of held) {
                    const hm = await manifest(needed, v);
                    if (!hm) continue;
                    for (const sub of subs) {
                        if (exportTarget(hm.json, sub) === undefined) {
                            say(
                                name,
                                `${needed} ${v} (locked or declared floor) does not export "${sub}", which ${d.dep}@${version} imports`,
                            );
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
