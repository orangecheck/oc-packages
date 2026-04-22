import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        strfry: 'src/strfry.ts',
    },
    format: ['cjs', 'esm'],
    // The strfry entry is also a CLI binary. package.json's `bin` points to
    // `./dist/strfry.js` (CJS, because no `"type": "module"`); ship the
    // shebang on BOTH formats so Strfry can exec whichever one is picked.
    banner: { js: '#!/usr/bin/env node' },
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    external: ['@orangecheck/sdk'],
});
