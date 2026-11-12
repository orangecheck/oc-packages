import { defineConfig } from 'tsup';

export default defineConfig({
    entry: { index: 'src/index.ts', payments: 'src/payments.ts' },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
});
