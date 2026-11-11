import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        seo: 'src/seo/index.tsx',
        headers: 'src/headers/index.ts',
        auth: 'src/auth/index.ts',
        og: 'src/og/index.tsx',
        sitemap: 'src/sitemap/index.ts',
        analytics: 'src/analytics/index.tsx',
        'analytics-event': 'src/analytics-event/index.ts',
        rate: 'src/rate/index.ts',
        document: 'src/document/index.tsx',
        csp: 'src/csp/index.ts',
        rewrites: 'src/rewrites/index.ts',
        'session-recheck': 'src/session-recheck/index.ts',
        cli: 'src/cli.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    external: ['react', 'react-dom', 'next', 'next/head.js', 'next/og.js', '@orangecheck/auth-core', '@orangecheck/app-design/og', '@orangecheck/app-design/tokens'],
});
