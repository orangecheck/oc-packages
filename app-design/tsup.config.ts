import { readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { defineConfig, type Options } from 'tsup';

const entry = {
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
    acknowledgement: 'src/acknowledgement/index.tsx',
    vitest: 'src/vitest/index.ts',
    og: 'src/og/index.tsx',
    fonts: 'src/fonts/index.tsx',
};

/** Every source module, for the ESM build: one module each, so a site's bundler keeps only what a page uses. */
function modules(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return name === 'pages' || name === 'vitest' ? [] : modules(path);
        return /\.tsx?$/.test(name) && !/\.(stories|test)\.tsx?$|\.d\.ts$/.test(name) ? [path] : [];
    });
}

const shared: Options = {
    // ./og carries its fonts inline, so a share-card route reads no file.
    loader: { '.woff': 'base64' },
    sourcemap: true,
    clean: false,
    treeshake: true,
    minify: false,
    // Peers stay external, and sonner, which sites also import for `toast`: one copy, one toaster.
    // qrcode keeps the browser build a site's bundler picks. CSS is copied by `copy:css`.
    external: ['react', 'react-dom', 'next', 'next/link', 'next-themes', 'lucide-react', '@orangecheck/auth-client', 'sonner', 'qrcode'],
    // Every module is a client component: the package ships hooks and Radix. Set on esbuild itself, so
    // the split build's shared chunks carry it too.
    banner: { js: "'use client';" },
};

export default defineConfig([
    // CommonJS and the types: one file per entry, for require() and the editor.
    { ...shared, entry, format: ['cjs'], dts: true, splitting: false },
    // ESM, what Next loads: split per module, with Radix and the small helpers inside the package, so a
    // page carries only the parts it imports, and the 404 function needs nothing from node_modules but peers.
    {
        ...shared,
        entry: { ...entry, ...Object.fromEntries(modules('src').map((p) => [`m/${p.slice(4).replace(/\.tsx?$/, '')}`, p])) },
        format: ['esm'],
        dts: false,
        splitting: true,
        noExternal: [/^@radix-ui\//, 'class-variance-authority', 'clsx', 'tailwind-merge', '@orangecheck/mark'],
    },
]);
