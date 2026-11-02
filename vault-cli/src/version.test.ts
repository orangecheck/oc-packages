// `oc-vault --version` is the version of the package that is installed. The
// built binary is what ships, so this runs it (CI builds before it tests).

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const bin = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string };

describe('oc-vault --version', () => {
    it('prints package.json’s version', () => {
        expect(existsSync(bin), 'run `yarn build` first: this checks dist/cli.js').toBe(true);
        expect(execFileSync(process.execPath, [bin, '--version'], { encoding: 'utf8' }).trim()).toBe(pkg.version);
    });
});
