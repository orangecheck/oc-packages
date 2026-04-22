import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        canonical: 'src/canonical.ts',
        seal: 'src/seal.ts',
        types: 'src/types.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    external: ['@orangecheck/lock-crypto'],
});
