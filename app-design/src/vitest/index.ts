import { createRequire } from 'node:module';
import { join } from 'node:path';

/*
 * What a site's vitest config needs to render this package in a test. The
 * package imports `next/link`, `next/router` and `next/compat/router` bare, as
 * Next's bundler resolves them; Node's resolver outside Next refuses an
 * extensionless subpath of a package with no exports map. Each is aliased to
 * the site's own file, and the package is transformed rather than
 * externalised so the aliases reach imports made from inside it. No React,
 * no vitest import: merge the result into the site's config.
 *
 *     import { defineConfig, mergeConfig } from 'vitest/config';
 *     import { appDesignVitest } from '@orangecheck/app-design/vitest';
 *
 *     export default mergeConfig(appDesignVitest(), defineConfig({ test: { environment: 'jsdom' } }));
 */

const NEXT_MODULES = ['next/link', 'next/router', 'next/compat/router'] as const;

export interface AppDesignVitest {
    resolve: { alias: Record<string, string> };
    test: { server: { deps: { inline: RegExp[] } } };
}

/** `root`: the site's directory, where its `next` is installed. Default: the working directory. */
export function appDesignVitest(root: string = process.cwd()): AppDesignVitest {
    const require = createRequire(join(root, 'package.json'));
    const alias: Record<string, string> = {};
    for (const id of NEXT_MODULES) {
        try {
            alias[id] = require.resolve(`${id}.js`);
        } catch {
            // A site without Next renders no link or router: nothing to alias.
        }
    }
    return { resolve: { alias }, test: { server: { deps: { inline: [/@orangecheck[\\/]app-design/] } } } };
}
