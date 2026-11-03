// The help a person reads to log in names the token prefix vault.ochk.io
// issues: `ocvt_` (oc-vault-web access-token.ts, vault-core sync.ts). The
// built binary is what ships, so this runs it (CI builds before it tests).

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const bin = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

const run = (...args: string[]) => {
    const r = spawnSync(process.execPath, [bin, ...args], { encoding: 'utf8', env: { ...process.env, HOME: '/nonexistent' } });
    return `${r.stdout}${r.stderr}`;
};

describe('the token the help asks for', () => {
    it.each([['login'], ['sync']])('`oc-vault %s --help` names an ocvt_ token', (cmd) => {
        expect(existsSync(bin), 'run `yarn build` first: this checks dist/cli.js').toBe(true);
        const help = run(cmd, '--help');
        expect(help).toContain('an ocvt_… access token');
        expect(help).not.toMatch(/ocv_/);
    });

    it('`oc-vault login` with no credential names an ocvt_ token', () => {
        const out = run('login');
        expect(out).toContain('pass --token <ocvt_…> or --cookie <oc_session value>');
        expect(out).not.toMatch(/ocv_/);
    });
});
