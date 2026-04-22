import { defineConfig } from 'vitest/config';

// jsdom gives us a real `window` so the detection + sign tests can poke at
// globals the way they would in a browser.
export default defineConfig({
    test: {
        environment: 'jsdom',
    },
});
