import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        cli: 'src/cli.ts',
    },
    format: ['cjs', 'esm'],
    // cli is also a binary — shebang on ESM output so it runs on PATH.
    banner: (ctx) => (ctx.format === 'esm' ? { js: '#!/usr/bin/env node' } : {}),
    dts: { entry: { index: 'src/index.ts' } },
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    external: ['@orangecheck/sdk'],
});
