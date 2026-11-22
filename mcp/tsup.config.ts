import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        cli: 'src/cli.ts',
    },
    format: ['esm'],
    // A stdio server started by an MCP client: the shebang makes `orangecheck-mcp` executable.
    banner: {
        js: '#!/usr/bin/env node',
    },
    dts: false,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    external: ['@modelcontextprotocol/server', 'undici', 'zod'],
});
