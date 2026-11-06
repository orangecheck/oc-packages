import { defineConfig } from 'vitest/config';

// A relay a caller names is asked its NIP-11 page over fetch. The setup answers
// those GETs offline, so no test reaches the network for one.
export default defineConfig({
    test: {
        setupFiles: ['./src/__tests__/nip11-offline.ts'],
    },
});
