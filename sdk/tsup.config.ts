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
    // The old `external: []` was inlining ~400 KB of bip322-js + bitcoinjs +
    // noble/scure into every consumer that imports `@orangecheck/sdk`, and
    // bitcoinjs-message in particular pulls in secp256k1 native bindings
    // that don't belong baked into a browser bundle.
    external: [
        '@bitcoinerlab/secp256k1',
        '@noble/curves',
        '@noble/hashes',
        '@scure/base',
        'bip322-js',
        'bitcoinjs-message',
        'buffer',
    ],
});
