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
    // Keep the heavy deps out of the bundle — consumers will resolve them
    // via their own npm install, and bundlers can de-dupe across packages.
    // The old `external: []` was inlining ~400 KB of signature-verification
    // and noble/scure code into every consumer that imports `@orangecheck/sdk`.
    external: ['@noble/curves', '@noble/hashes', '@orangecheck/bip322', '@scure/base', 'buffer'],
});
