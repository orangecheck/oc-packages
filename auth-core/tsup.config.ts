import { defineConfig } from 'tsup';

export default defineConfig({
    // display-name, family-origins and identifiers import nothing, so a browser bundle can take them without jose.
    entry: {
        index: 'src/index.ts',
        'display-name': 'src/display-name.ts',
        'family-origins': 'src/family-origins.ts',
        identifiers: 'src/identifiers.ts',
        // Server-only (node:crypto). The one entry that takes stamp-core.
        'relay-assertion': 'src/relay-assertion.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    external: ['jose'],
});
