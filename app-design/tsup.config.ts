import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        tokens: 'src/tokens/index.ts',
        primitives: 'src/primitives/index.ts',
        brand: 'src/brand/index.ts',
        components: 'src/components/index.ts',
        chrome: 'src/chrome/index.ts',
        family: 'src/family/index.ts',
        code: 'src/code/index.ts',
        format: 'src/format/index.ts',
        mdx: 'src/mdx/index.tsx',
        session: 'src/session/index.tsx',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    // Peers stay external; CSS is copied by `copy:css` (tsup does not process it).
    external: ['react', 'react-dom', 'next', 'next/link', 'next-themes', 'lucide-react', '@orangecheck/auth-client'],
    // Every module is a client component: the package ships hooks and Radix.
    banner: { js: "'use client';" },
});
