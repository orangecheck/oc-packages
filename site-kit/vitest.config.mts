import { appDesignVitest } from '@orangecheck/app-design/vitest';
import { defineConfig, mergeConfig } from 'vitest/config';

// app-design's chrome imports next/* bare, as Next's bundler resolves them; csp.test renders its ThemeProvider.
export default mergeConfig(appDesignVitest(), defineConfig({}));
