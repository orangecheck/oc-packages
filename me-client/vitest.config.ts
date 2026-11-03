import { defineConfig } from 'vitest/config';

// tsconfig.json leaves the tests out, so the build never compiles them. The
// typecheck reads tsconfig.vitest.json instead, which takes every test file, so
// each expectTypeOf assertion and every test's types are checked, not only the
// *.test-d.ts files.
export default defineConfig({
    test: {
        typecheck: {
            tsconfig: './tsconfig.vitest.json',
            include: ['src/**/*.test-d.ts', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
        },
    },
});
