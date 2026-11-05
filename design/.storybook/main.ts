import path from 'node:path';

import type { StorybookConfig } from '@storybook/react-vite';

// The palette THEME_COLOR reads (the page's background), by file: main.ts loads as native ESM, which cannot follow
// tokens/index.ts's extensionless import.
import { darkPalette, lightPalette } from '../../app-design/src/tokens/palette.ts';

const here = path.resolve(process.cwd(), '.storybook');

const config: StorybookConfig = {
    stories: [
        // The family's one system (@orangecheck/app-design), first: what a visitor opens on.
        { directory: '../../app-design/src', files: '**/*.stories.@(ts|tsx)', titlePrefix: 'orangecheck' },
        // The classic system (@orangecheck/design), frozen: browsable for the owner tools still on it.
        { directory: '../src', files: '**/*.stories.@(ts|tsx)', titlePrefix: 'Classic (frozen)' },
    ],
    /**
     * No addons. @storybook/addon-essentials stopped at 8.6.14 — Storybook 9
     * folded docs, controls, actions, viewport and backgrounds into core, so
     * the package does not exist for 10 and listing it breaks the build.
     * @storybook/addon-themes was also declared here and never used: the
     * theme decorator in preview.tsx is hand-written against OC_THEMES.
     */
    addons: [],
    framework: { name: '@storybook/react-vite', options: {} },
    // app-design's self-hosted faces, for the frame around the stories (manager-head.html links fonts.css).
    staticDirs: [{ from: '../../app-design/src/styles', to: '/oca' }],
    // The browser's chrome takes the family's paper and night, from the tokens every site's _document reads.
    // No data-oc-app on this page: it is Storybook's own frame, and preview.tsx sets it inside each story.
    managerHead: (head) =>
        `${head}\n<meta name="theme-color" media="(prefers-color-scheme: light)" content="${lightPalette.background}" />` +
        `\n<meta name="theme-color" media="(prefers-color-scheme: dark)" content="${darkPalette.background}" />`,
    core: { disableTelemetry: true },
    async viteFinal(viteConfig) {
        // Tailwind 4 via the Vite plugin so @theme / @apply / @source resolve.
        const { default: tailwindcss } = await import('@tailwindcss/vite');
        viteConfig.plugins = viteConfig.plugins ?? [];
        viteConfig.plugins.push(tailwindcss());

        // Stub Next.js client deps so both systems' chrome and composites render
        // without a Next runtime/router.
        viteConfig.resolve = viteConfig.resolve ?? {};
        // app-design resolves its own node_modules; one React, one next-themes.
        viteConfig.resolve.dedupe = ['react', 'react-dom', 'next-themes', 'lucide-react'];
        viteConfig.resolve.alias = {
            ...(viteConfig.resolve.alias ?? {}),
            'next/link': path.join(here, 'stubs/next-link.tsx'),
            'next/router': path.join(here, 'stubs/next-router.ts'),
        };
        return viteConfig;
    },
};

export default config;
