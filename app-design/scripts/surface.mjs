/*
 * The public surface of a built app-design, read by the TypeScript checker from
 * its .d.ts: what check-surface compares with 1.29.3's snapshot, and what
 * check-surface-1.29.3 regenerates from npm's published tarball. propTypes and
 * narrowings compare each component prop's type, for a prop that lost a string
 * option or became required. That started as review-me's prop-narrowing tool.
 */
import { existsSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';

const require = createRequire(import.meta.url);
const ts = require('typescript');

function programFor(dist, pkgJson) {
    // Every entry, a folder of files (./art/*) too; the ones with types are read for their exports.
    const entries = Object.keys(JSON.parse(readFileSync(pkgJson, 'utf8')).exports).filter((k) => k !== './package.json');
    const files = Object.fromEntries(entries.filter((e) => !e.includes('*')).map((e) => [e, join(dist, `${e === '.' ? 'index' : e.slice(2)}.d.ts`)]).filter(([, f]) => existsSync(f)));
    const p = ts.createProgram(Object.values(files), { skipLibCheck: true, jsx: ts.JsxEmit.ReactJSX, moduleResolution: ts.ModuleResolutionKind.Bundler, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 });
    return { entries, files, program: p, checker: p.getTypeChecker() };
}

// Own props only: those declared in this package's .d.ts, not React's or Radix's HTML attributes.
const own = (prop) => (prop.declarations ?? []).some((d) => !d.getSourceFile().fileName.includes('node_modules'));

/** Every entry's exports (value, component, function or type) and each component's own prop names. */
export function surface(dist, pkgJson) {
    const { entries, files, program, checker } = programFor(dist, pkgJson);
    const propsOf = (type) => {
        if (!type) return undefined;
        const names = checker.getPropertiesOfType(checker.getApparentType(type)).filter(own).map((p) => p.getName()).sort();
        return names.length ? names : undefined;
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

/** Each component's own props, with whether each is optional and the string options it accepts. */
export function propTypes(dist, pkgJson) {
    const { files, program, checker } = programFor(dist, pkgJson);
    const out = {};
    for (const [entry, file] of Object.entries(files)) {
        const mod = checker.getSymbolAtLocation(program.getSourceFile(file));
        for (const s of mod ? checker.getExportsOfModule(mod) : []) {
            const name = s.getName();
            if (!/^[A-Z]/.test(name)) continue;
            const target = s.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(s) : s;
            const decl = target.valueDeclaration ?? target.declarations?.[0];
            if (!decl) continue;
            // The components surface() counts: callable, or React's exotic forwardRef and memo objects.
            const t = checker.getTypeOfSymbolAtLocation(target, decl);
            const sig = t.getCallSignatures()[0];
            if (!sig && !t.getProperties().some((x) => x.getName() === '$$typeof')) continue;
            const p = sig?.getParameters()[0];
            const props = {};
            // A component that takes no props has none to narrow; it still counts as compared.
            for (const prop of p ? checker.getPropertiesOfType(checker.getApparentType(checker.getTypeOfSymbolAtLocation(p, decl))).filter(own) : []) {
                const ptype = checker.getTypeOfSymbolAtLocation(prop, prop.valueDeclaration ?? prop.declarations[0]);
                const parts = ptype.isUnion() ? ptype.types : [ptype];
                props[prop.getName()] = {
                    optional: Boolean(prop.flags & ts.SymbolFlags.Optional),
                    literals: parts.filter((x) => x.isStringLiteral()).map((x) => x.value).sort(),
                    text: checker.typeToString(ptype),
                };
            }
            out[`${entry} ${name}`] = props;
        }
    }
    return out;
}

/** A prop that no longer accepts a string option it did, or that was optional and is now required. */
export function narrowings(before, after) {
    const found = [];
    for (const [key, props] of Object.entries(before)) {
        const now = after[key];
        if (!now) continue;
        for (const [prop, was] of Object.entries(props)) {
            const is = now[prop];
            if (!is) continue;
            const lost = was.literals.length && is.literals.length ? was.literals.filter((l) => !is.literals.includes(l)) : [];
            if (lost.length) found.push(`${key} ${prop}: no longer accepts ${lost.map((l) => `'${l}'`).join(', ')} (was ${was.text}, now ${is.text})`);
            if (was.optional && !is.optional) found.push(`${key} ${prop}: optional before, required now (${is.text})`);
        }
    }
    return found;
}
