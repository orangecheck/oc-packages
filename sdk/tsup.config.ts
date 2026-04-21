import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        canonical: 'src/canonical.ts',
        verify: 'src/verify.ts',
        attestation: 'src/attestation.ts',
        nostr: 'src/nostr.ts',
        identity: 'src/identity.ts',
        scoring: 'src/scoring.ts',
        challenge: 'src/challenge.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    external: [],
});
