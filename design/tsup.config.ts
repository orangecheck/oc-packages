import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        tokens: 'src/tokens/index.ts',
        primitives: 'src/primitives/index.ts',
        composites: 'src/composites/index.ts',
        chrome: 'src/chrome/index.ts',
        components: 'src/components/index.ts',
        format: 'src/format/index.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    // Peers + sibling family packages stay external; CSS is copied separately
    // by the `copy:css` script (tsup does not process .css imports here).
    external: [
        'react',
        'react-dom',
        'next',
        'next/link',
        'next-themes',
        'lucide-react',
        '@orangecheck/auth-client',
    ],
});
