import path from 'node:path';

import type { StorybookConfig } from '@storybook/react-vite';

const here = path.resolve(process.cwd(), '.storybook');

const config: StorybookConfig = {
    stories: ['../src/**/*.stories.@(ts|tsx)'],
    addons: ['@storybook/addon-essentials'],
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
