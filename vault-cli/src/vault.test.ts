// The passphrase is the first line of stdin. Each case settles: a prompt left
// waiting once stdin ends would exit 0 having done nothing.

import { Readable } from 'node:stream';

import { wrapVaultKey } from '@orangecheck/vault-core';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import type { VaultCache } from './config';
import { openVault } from './vault';

const PASS = 'correct horse battery';
const KEY = new Uint8Array(32).fill(7);
let cache: VaultCache;

beforeAll(() => {
    cache = { baseUrl: 'https://vault.example', identity: null, escrow: wrapVaultKey(KEY, PASS), blobs: [], synced_at: '2026-01-01T00:00:00Z' };
});

afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
});

async function fromStdin(chunks: string[]): Promise<{ key?: number[]; exit?: string; errors: string[]; read: boolean }> {
    let read = false;
    const stream = Readable.from(chunks);
    stream.on('data', () => (read = true));
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(stream as never);
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((m: string) => void errors.push(m));
    vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`exit ${code}`);
    });
    try {
        return { key: [...(await openVault(cache)).key], errors, read };
    } catch (e) {
        return { exit: (e as Error).message, errors, read };
    }
}

describe('openVault reading the passphrase from stdin', () => {
    it('exits 1 when stdin closes before a line', { timeout: 10_000 }, async () => {
        vi.stubEnv('OCV_PASSPHRASE', undefined);
        expect(await fromStdin([])).toMatchObject({ exit: 'exit 1', errors: ['No passphrase given: input closed before a line.'] });
    });

    it('takes a last line that has no newline', { timeout: 10_000 }, async () => {
        vi.stubEnv('OCV_PASSPHRASE', undefined);
        expect(await fromStdin([PASS])).toMatchObject({ key: [...KEY], errors: [] });
    });

    it('takes only the first line', { timeout: 10_000 }, async () => {
        vi.stubEnv('OCV_PASSPHRASE', undefined);
        expect(await fromStdin([`${PASS}\nsomething else\n`])).toMatchObject({ key: [...KEY], errors: [] });
    });

    it('exits 1 on an empty line, never trying an empty passphrase', { timeout: 10_000 }, async () => {
        vi.stubEnv('OCV_PASSPHRASE', undefined);
        expect(await fromStdin(['\n'])).toMatchObject({ exit: 'exit 1', errors: ['No passphrase given.'] });
    });

    it('takes $OCV_PASSPHRASE without reading stdin', { timeout: 10_000 }, async () => {
        vi.stubEnv('OCV_PASSPHRASE', PASS);
        expect(await fromStdin(['wrong\n'])).toEqual({ key: [...KEY], errors: [], read: false });
    });
});
