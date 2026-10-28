import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        io: 'src/io.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    // One copy of each module across the entries, so ./io throws the same
    // UnansweredReadError class the main entry exports.
    splitting: true,
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
        '@orangecheck/nostr-core',
        '@orangecheck/stamp-ots',
    ],
});
