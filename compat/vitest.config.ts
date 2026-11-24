import { defineConfig } from 'vitest/config';

// COMPAT_HOLLOW=1 swaps every published package for an automock whose functions return
// undefined: every test must then fail (mutants.mjs checks it).
export default defineConfig({
    test: {
        include: ['test/**/*.test.{ts,tsx}'],
        // The component tests run as ochk.io's own pages, which read its /api/auth/me on their origin.
        environmentOptions: { jsdom: { url: 'https://ochk.io/account' } },
        setupFiles: process.env.COMPAT_HOLLOW === '1' ? ['./test/hollow.setup.ts'] : [],
    },
});
