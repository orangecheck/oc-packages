// A pull that comes up short writes nothing: `sync` keeps the cache it had and
// `login` caches nothing, each exiting 1 and saying how many entries were
// missed. The built binary against a local stand-in for vault.ochk.io.

import { execFile } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

const bin = fileURLToPath(new URL('../dist/cli.js', import.meta.url));
const run = promisify(execFile);

const IDS = ['a', 'b', 'c'];
let failing: string | null = null;
let server: Server;
let base: string;

beforeAll(async () => {
    server = createServer((req, res) => {
        const send = (status: number, body: unknown) => {
            res.writeHead(status, { 'content-type': 'application/json' });
            res.end(JSON.stringify(body));
        };
        const url = req.url ?? '';
        if (url === '/api/vault-key') return send(200, { escrow: { passphrase: { v: 1 } } });
        if (url === '/api/auth/me') return send(200, { account: { did_oc: 'did:oc:test' } });
        if (url === '/api/blobs') {
            return send(200, {
                blobs: IDS.map((id) => ({ envelope_id: id, updated_at: '2026-11-01T00:00:00Z' })),
            });
        }
        const id = url.split('/api/blobs/')[1];
        if (id && IDS.includes(id)) {
            return id === failing
                ? send(500, { ok: false, reason: 'storage down' })
                : send(200, { ok: true, ciphertext: `ct-${id}` });
        }
        send(404, { ok: false });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

async function cli(home: string, ...args: string[]) {
    try {
        const { stdout, stderr } = await run(process.execPath, [bin, ...args], {
            env: { ...process.env, XDG_CONFIG_HOME: home },
        });
        return { code: 0, stdout, stderr };
    } catch (e) {
        const err = e as { code: number; stdout: string; stderr: string };
        return { code: err.code, stdout: err.stdout, stderr: err.stderr };
    }
}
const cachePath = (home: string) => join(home, 'oc-vault', 'vault.json');
const cached = (home: string) =>
    JSON.parse(readFileSync(cachePath(home), 'utf8')) as { blobs: string[]; synced_at: string };

describe('oc-vault, a pull that comes up short', () => {
    it('sync keeps the cache it had and says so', async () => {
        expect(existsSync(bin), 'run `yarn build` first: this runs dist/cli.js').toBe(true);
        const home = mkdtempSync(join(tmpdir(), 'oc-vault-sync-'));
        failing = null;
        const login = await cli(home, 'login', '--token', 'ocvt_test', '--url', base);
        expect(login.code).toBe(0);
        const before = cached(home);
        expect(before.blobs).toHaveLength(3);

        failing = 'b';
        const sync = await cli(home, 'sync');
        expect(sync.code).toBe(1);
        expect(sync.stderr).toContain("1 of 3 entries couldn't be fetched");
        expect(sync.stderr).toContain(`the cache from ${before.synced_at} (3 entries) is kept`);
        expect(sync.stdout).not.toContain('Synced');
        expect(cached(home)).toEqual(before);
    });

    it('login caches nothing', async () => {
        const home = mkdtempSync(join(tmpdir(), 'oc-vault-login-'));
        failing = 'c';
        const login = await cli(home, 'login', '--token', 'ocvt_test', '--url', base);
        expect(login.code).toBe(1);
        expect(login.stderr).toContain("1 of 3 entries couldn't be fetched, so nothing was cached");
        expect(existsSync(cachePath(home))).toBe(false);
    });
});
