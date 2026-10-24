import { defineConfig } from 'tsup';

export default defineConfig({
    entry: {
        index: 'src/index.ts',
        server: 'src/server.ts',
        popup: 'src/popup.ts',
        integrator: 'src/integrator.ts',
        'connect-consent': 'src/connect-consent.ts',
        button: 'src/button.ts',
        react: 'src/react.tsx',
    },
    format: ['cjs', 'esm'],
    dts: true,
    splitting: false,
    sourcemap: true,
    clean: true,
    treeshake: true,
    minify: false,
    external: ['react', 'react-dom', 'react/jsx-runtime', '@orangecheck/auth-client', '@orangecheck/auth-core'],
    // The mark is drawn into the button files, so each can be copied onto a site's own origin as one file.
    noExternal: ['@orangecheck/mark'],
    onSuccess: 'cp src/button.css dist/button.css',
});
