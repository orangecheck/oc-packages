import { execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Next's server loads a package from node_modules with Node's own loaders, not
 * webpack. `import 'next/head'` resolved in the bundler and failed there
 * (next has no exports map), so every built entry is loaded the same way here.
 * Needs `yarn build` first; CI builds before it tests.
 */
const DIST = join(__dirname, '..', 'dist');
const ENTRIES = ['seo', 'headers', 'auth', 'og', 'sitemap', 'analytics'];

describe('built entries load under plain Node', () => {
    it('dist exists', () => {
        expect(existsSync(join(DIST, 'seo.mjs')), 'run yarn build before the tests').toBe(true);
    });

    it.each(ENTRIES)('%s: ESM import and CJS require', (entry) => {
        const esm = execFileSync(process.execPath, ['--input-type=module', '-e', `const m = await import(${JSON.stringify(join(DIST, `${entry}.mjs`))}); console.log(Object.keys(m).length);`], { encoding: 'utf8' });
        const cjs = execFileSync(process.execPath, ['-e', `console.log(Object.keys(require(${JSON.stringify(join(DIST, `${entry}.js`))})).length);`], { encoding: 'utf8' });
        expect(Number(esm.trim())).toBeGreaterThan(0);
        expect(Number(cjs.trim())).toBe(Number(esm.trim()));
    });
});
