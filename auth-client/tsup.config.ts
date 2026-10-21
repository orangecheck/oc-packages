import { readdirSync } from 'node:fs';

import { defineConfig } from 'tsup';

const external = ['react', 'react-dom', '@orangecheck/auth-core', '@orangecheck/wallet-adapter'];

// Every source file is its own ES module, so a site's bundler keeps only the
// files a page imports: the provider in every page, the sign-in only on /signin.
const modules = readdirSync('src')
    .filter((f) => /\.tsx?$/.test(f) && !/\.test\.tsx?$/.test(f))
    .map((f) => `src/${f}`);

export default defineConfig([
    {
        entry: { index: 'src/index.ts' },
        format: ['cjs'],
        dts: true,
        splitting: false,
        sourcemap: true,
        treeshake: true,
        minify: false,
        external,
    },
    {
        entry: modules,
        format: ['esm'],
        splitting: true,
        sourcemap: true,
        minify: false,
        external,
    },
]);
