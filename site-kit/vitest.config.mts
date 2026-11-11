import { appDesignVitest } from '@orangecheck/app-design/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

// app-design's chrome imports next/* bare, as Next's bundler resolves them; csp.test renders its ThemeProvider.
// Each run's temp files go in a folder of its own, removed when the run ends.
export default mergeConfig(
    appDesignVitest(),
    defineConfig({ test: { globalSetup: ['../scripts/test-tmp-root.mjs'] } }),
);
