import type { StorybookConfig } from '@storybook/react-vite';

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
        return viteConfig;
    },
};

export default config;
