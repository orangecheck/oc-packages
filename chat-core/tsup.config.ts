import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        io: 'src/io.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    external: [
        '@noble/curves',
        '@noble/hashes',
        '@orangecheck/auth-core',
        '@orangecheck/lock-core',
        '@orangecheck/lock-crypto',
        '@orangecheck/lock-device',
        '@orangecheck/stamp-ots',
    ],
});
