#!/usr/bin/env node
// A published file may load only what installing the package brings.
// me-client 0.53.1 shipped button.d.ts and react.d.ts importing
// @orangecheck/mark, a devDependency, so an integrator's types read MarkVariant
// as any, or failed with TS2307. For each package directory given, this reads
// every code and declaration file `npm pack` would ship and refuses a bare
// import that is not a Node builtin, the package itself, or one of its
// dependencies, peers or optional dependencies. Type references count too. A
// relative import must load a file the tarball ships, so a narrowed "files"
// list cannot drop a chunk.
//
//   node scripts/check-packed-imports.mjs <package dir>...
//
// Run it after the build, on the files the tarball will hold. Reads imports
// with TypeScript's parser (check-dep-floors.mjs), from the repository root's
// install.
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { builtinModules } from 'node:module';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import ts from 'typescript';

import { localCandidates, specifiersIn } from './check-dep-floors.mjs';

const CODE = /\.(?:[mc]?js|d\.[mc]?ts)$/;
const BUILTIN = new Set(builtinModules);

/** The package a specifier loads: null for a relative path, a Node builtin, or a name this check cannot read. */
export function packageOf(spec) {
    if (spec.startsWith('./') || spec.startsWith('../') || spec === '.' || spec === '..') return null;
    if (spec.startsWith('node:')) return null;
    const m = /^((?:@[a-z0-9][a-z0-9._~-]*\/)?[a-z0-9][a-z0-9._~-]*)(?:\/.*)?$/.exec(spec);
    if (!m) return undefined;
    return BUILTIN.has(m[1]) ? null : m[1];
}

/** Packages a declaration file names in a `/// <reference types>` directive. */
function typeReferences(file) {
    if (!/\.d\.[mc]?ts$/.test(file)) return [];
    const sf = ts.createSourceFile(file, readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, false, ts.ScriptKind.TS);
    return sf.typeReferenceDirectives.map((d) => d.fileName);
}

/** What `npm pack` would put in the tarball, without running the package's scripts. */
function packedFiles(dir) {
    const out = execFileSync('npm', ['pack', '--dry-run', '--json', '--ignore-scripts'], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
    });
    return JSON.parse(out)[0].files.map((f) => f.path);
}

export function problemsIn(at, files = packedFiles(at)) {
    const dir = resolve(at);
    const json = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'));
    const installed = new Set(
        [json.dependencies, json.peerDependencies, json.optionalDependencies].flatMap((f) => Object.keys(f ?? {})),
    );
    const code = files.filter((f) => CODE.test(f));
    if (!code.length) return [`${json.name}: packs no code or declaration file; build it first`];
    const problems = [];
    const shipped = new Set(files.map((f) => join(dir, f)));
    for (const file of code) {
        const path = join(dir, file);
        for (const { spec } of specifiersIn(path)) {
            if (!spec.startsWith('./') && !spec.startsWith('../') && spec !== '.' && spec !== '..') continue;
            if (!localCandidates(path, spec).some((c) => shipped.has(c))) {
                problems.push(`${json.name}: ${file} loads ${spec}, which the tarball does not ship`);
            }
        }
        const specs = [
            ...specifiersIn(path).map((s) => s.spec),
            ...typeReferences(path).map((t) => (t.startsWith('@types/') ? t : `@types/${t}`)),
        ];
        for (const spec of specs) {
            const name = packageOf(spec);
            if (name === null || name === json.name || installed.has(name)) continue;
            // A type reference is met by the @types package or by the package it describes.
            const described = /^@types\/(?:([^_]+)__)?(.+)$/.exec(name ?? '');
            if (described) {
                const pkg = described[1] ? `@${described[1]}/${described[2]}` : described[2];
                if (BUILTIN.has(pkg) || pkg === 'node' || installed.has(pkg)) continue;
            }
            const why =
                name === undefined
                    ? 'which this check cannot read as a package name'
                    : json.devDependencies?.[name]
                      ? 'a devDependency only'
                      : 'not a dependency';
            problems.push(`${json.name}: ${file} loads ${spec}, ${why}`);
        }
    }
    return problems;
}

function main() {
    const dirs = process.argv.slice(2);
    if (!dirs.length) {
        console.error('usage: node scripts/check-packed-imports.mjs <package dir>...');
        process.exit(2);
    }
    const problems = dirs.flatMap((d) => problemsIn(resolve(d)));
    if (problems.length) {
        console.error(`packed imports: ${problems.length} problem(s)`);
        for (const p of problems) console.error(`  ${p}`);
        process.exit(1);
    }
    console.log(`packed imports: ${dirs.length} package(s), every packed file loads only what installing brings`);
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
