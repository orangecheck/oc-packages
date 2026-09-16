import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

const root = join(__dirname, '..', '..');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    peerDependencies?: Record<string, string>;
    peerDependenciesMeta?: Record<string, { optional?: boolean }>;
};

function sourceFiles(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) return name === '__tests__' ? [] : sourceFiles(path);
        return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [path] : [];
    });
}

function packageName(specifier: string): string {
    const parts = specifier.split('/');
    return specifier.startsWith('@') ? parts.slice(0, 2).join('/') : parts[0]!;
}

// Type-only imports are erased, so a bundler never has to resolve them.
function runtimeSpecifiers(source: string): string[] {
    const found: string[] = [];
    const patterns = [
        /^\s*import\s+(?!type\s)[^'"]*?from\s*['"]([^'"]+)['"]/gm,
        /^\s*import\s*['"]([^'"]+)['"]/gm,
        /^\s*export\s+(?!type\s)[^'"]*?from\s*['"]([^'"]+)['"]/gm,
        /\bimport\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
    ];
    for (const pattern of patterns) {
        for (const match of source.matchAll(pattern)) found.push(match[1]!);
    }
    return found.filter((s) => !s.startsWith('.'));
}

describe('package manifest', () => {
    const imported = new Set(
        sourceFiles(join(root, 'src')).flatMap((file) =>
            runtimeSpecifiers(readFileSync(file, 'utf8')).map(packageName)
        )
    );

    it('finds the lazily imported wallet-adapter', () => {
        expect(imported).toContain('@orangecheck/wallet-adapter');
    });

    // A bundler resolves import('x') at build time too, so an "optional" peer
    // that the source imports fails the consumer's build when it is absent.
    it.each([...imported])('%s is a dependency or a required peer', (name) => {
        const isDependency = name in (pkg.dependencies ?? {});
        const isRequiredPeer =
            name in (pkg.peerDependencies ?? {}) && !pkg.peerDependenciesMeta?.[name]?.optional;
        expect(isDependency || isRequiredPeer).toBe(true);
    });
});
