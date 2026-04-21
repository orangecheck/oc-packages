import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        badge: 'src/badge.tsx',
        gate: 'src/gate.tsx',
        challenge: 'src/challenge.tsx',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    external: ['react', 'react-dom', '@orangecheck/sdk'],
});
