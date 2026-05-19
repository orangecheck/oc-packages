import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        cli: 'src/cli.ts',
    },
    format: ['esm'],
    banner: {
        js: '#!/usr/bin/env node',
    },
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    external: ['@orangecheck/vault-core', 'commander'],
});
