import { defineConfig } from 'vitest/config';

// Each run's temp files go in a folder of its own, removed when the run ends.
export default defineConfig({
    test: { globalSetup: ['../scripts/test-tmp-root.mjs'] },
});
