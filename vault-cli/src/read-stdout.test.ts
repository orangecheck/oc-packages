// `oc-vault read` prints the value and nothing else on stdout, so `$(oc-vault read …)`
// and a pipe get the secret alone; the passphrase prompt goes to stderr. The built binary.

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { encryptFields, generateEntryId, packEntryForCloud, wrapVaultKey } from '@orangecheck/vault-core';
import { describe, expect, it } from 'vitest';

const bin = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

const PASS = 'correct horse battery';
const KEY = new Uint8Array(32).fill(7);
const VALUE = 's3cret-value';

/** A config dir holding a cache with one password entry named db. */
function home(): string {
    const dir = mkdtempSync(join(tmpdir(), 'oc-vault-read-'));
    const now = '2026-11-01T00:00:00Z';
    const { nonce, ciphertext } = encryptFields({ password: VALUE }, KEY);
    const entry = { id: generateEntryId(), type: 'password' as const, name: 'db', nonce, ciphertext, created_at: now, updated_at: now };
    mkdirSync(join(dir, 'oc-vault'), { recursive: true });
    writeFileSync(
        join(dir, 'oc-vault', 'vault.json'),
        JSON.stringify({ baseUrl: 'https://vault.example', identity: null, escrow: wrapVaultKey(KEY, PASS), blobs: [packEntryForCloud(entry, KEY)], synced_at: now })
    );
    return dir;
}

function read(dir: string, input: string) {
    const env: NodeJS.ProcessEnv = { ...process.env, XDG_CONFIG_HOME: dir };
    delete env.OCV_PASSPHRASE;
    return spawnSync(process.execPath, [bin, 'read', 'ocv://personal/db'], { input, env, encoding: 'utf8' });
}

describe('oc-vault read, with stdout piped', () => {
    it('prints only the value on stdout, and asks on stderr', { timeout: 30_000 }, () => {
        expect(existsSync(bin), 'run `yarn build` first: this runs dist/cli.js').toBe(true);
        const r = read(home(), `${PASS}\n`);
        expect(r.status, r.stderr).toBe(0);
        expect(r.stdout).toBe(`${VALUE}\n`);
        expect(r.stderr).toContain('Vault passphrase: ');
        expect(r.stderr).not.toContain(PASS);
    });

    it('prints nothing on stdout when stdin closes before a line', { timeout: 30_000 }, () => {
        const r = read(home(), '');
        expect(r.status).toBe(1);
        expect(r.stdout).toBe('');
        expect(r.stderr).toContain('No passphrase given: input closed before a line.');
    });
});
