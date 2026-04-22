import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        // Split entries so users can `import { ocGateFastify } from '@orangecheck/gate/fastify'`
        // without pulling the Express adapter (or its types) into their edge bundle.
        express: 'src/express.ts',
        next: 'src/next.ts',
        fastify: 'src/fastify.ts',
        hono: 'src/hono.ts',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    external: ['@orangecheck/sdk'],
});
