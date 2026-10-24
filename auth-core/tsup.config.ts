import { defineConfig } from 'tsup';

export default defineConfig({
    // display-name imports nothing, so a browser bundle can take the name rule without jose.
    entry: { index: 'src/index.ts', 'display-name': 'src/display-name.ts' },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    external: ['jose'],
});
