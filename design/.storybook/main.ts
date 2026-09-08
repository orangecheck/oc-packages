import path from 'node:path';

import type { StorybookConfig } from '@storybook/react-vite';

const here = path.resolve(process.cwd(), '.storybook');

const config: StorybookConfig = {
    stories: ['../src/**/*.stories.@(ts|tsx)'],
    /**
     * No addons. @storybook/addon-essentials stopped at 8.6.14 — Storybook 9
     * folded docs, controls, actions, viewport and backgrounds into core, so
     * the package does not exist for 10 and listing it breaks the build.
     * @storybook/addon-themes was also declared here and never used: the
     * theme decorator in preview.tsx is hand-written against OC_THEMES.
     */
    addons: [],
    framework: { name: '@storybook/react-vite', options: {} },
    core: { disableTelemetry: true },
    async viteFinal(viteConfig) {
        // Tailwind 4 via the Vite plugin so @theme / @apply / @source resolve.
        const { default: tailwindcss } = await import('@tailwindcss/vite');
        viteConfig.plugins = viteConfig.plugins ?? [];
        viteConfig.plugins.push(tailwindcss());

        // Stub Next.js client deps so @orangecheck/ui composites render without
        // a Next runtime/router.
        viteConfig.resolve = viteConfig.resolve ?? {};
        viteConfig.resolve.alias = {
            ...(viteConfig.resolve.alias ?? {}),
            'next/link': path.join(here, 'stubs/next-link.tsx'),
            'next/router': path.join(here, 'stubs/next-router.ts'),
        };
        return viteConfig;
    },
};

export default config;
