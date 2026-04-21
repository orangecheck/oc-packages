import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        strfry: 'src/strfry.ts',
    },
    format: ['cjs', 'esm'],
    // The strfry entry is also a CLI binary — shebang on the JS output.
    banner: (ctx) => (ctx.format === 'esm' ? { js: '#!/usr/bin/env node' } : {}),
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    external: ['@orangecheck/sdk'],
});
