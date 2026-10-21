import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A site's bundler keeps or drops whole files. When the ESM build was one file,
 * every page carried the sign-in ceremony and the passkey code because _app
 * imports the provider. Needs `yarn build` first; CI builds before it tests.
 */
const root = join(__dirname, '..', '..');
const DIST = join(root, 'dist');

/** Every file a module reaches through its static relative imports, itself included. */
function reach(file: string, seen = new Set<string>()): Set<string> {
    if (seen.has(file)) return seen;
    seen.add(file);
    const source = readFileSync(file, 'utf8');
    for (const [, spec] of source.matchAll(/^\s*(?:import|export)\s[^'"]*?from\s*['"](\.[^'"]+)['"]/gm))
        reach(resolve(dirname(file), spec!), seen);
    return seen;
}

/** The dist file that index.mjs takes an export from. */
function fileExporting(name: string): string {
    const index = readFileSync(join(DIST, 'index.mjs'), 'utf8');
    for (const [, names, spec] of index.matchAll(/import\s*{([^}]*)}\s*from\s*['"](\.[^'"]+)['"]/g))
        if (names!.split(',').some((n) => n.trim() === name)) return join(DIST, spec!);
    throw new Error(`index.mjs does not import ${name}`);
}

describe('built package', () => {
    it('dist exists', () => {
        expect(existsSync(join(DIST, 'index.mjs')), 'run yarn build before the tests').toBe(true);
    });

    it('declares no side effects, so unused files can be dropped', () => {
        expect(JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')).sideEffects).toBe(false);
    });

    it('the provider reaches neither the sign-in ceremony nor passkeys', () => {
        const files = [...reach(fileExporting('OcSessionProvider'))];
        const text = files.map((f) => readFileSync(f, 'utf8')).join('\n');
        expect(text).toContain('function OcSessionProvider');
        expect(text).not.toContain('function OcSignIn');
        expect(text).not.toContain('@simplewebauthn/browser');
    });

    it('the sign-in is still exported from the entry', () => {
        const text = [...reach(fileExporting('OcSignIn'))].map((f) => readFileSync(f, 'utf8')).join('\n');
        expect(text).toContain('function OcSignIn');
    });

    it('ESM and CJS export the same names under plain Node', () => {
        const keys = (code: string, args: string[]) =>
            JSON.parse(execFileSync(process.execPath, [...args, '-e', code], { cwd: root, encoding: 'utf8' })) as string[];
        const esm = keys(
            `const m = await import(${JSON.stringify(join(DIST, 'index.mjs'))}); console.log(JSON.stringify(Object.keys(m).sort()));`,
            ['--input-type=module']
        );
        const cjs = keys(
            `console.log(JSON.stringify(Object.keys(require(${JSON.stringify(join(DIST, 'index.js'))})).sort()));`,
            []
        );
        expect(esm.length).toBeGreaterThan(30);
        expect(esm).toEqual(cjs);
    });
});
