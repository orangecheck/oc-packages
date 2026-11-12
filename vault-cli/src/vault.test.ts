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

type Opened = { key?: number[]; exit?: string; errors: string[]; read: boolean; out: string; err: string };

/** Open the vault with stdin from these chunks; `terminal` makes stdin a terminal, as a person typing. */
async function fromStdin(chunks: string[], terminal = false): Promise<Opened> {
    let read = false;
    const stream = Readable.from(chunks);
    stream.on('data', () => (read = true));
    if (terminal) Object.assign(stream, { isTTY: true });
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(stream as never);
    const out: string[] = [];
    const err: string[] = [];
    vi.spyOn(process.stdout, 'write').mockImplementation(((s: string) => out.push(String(s)) > 0) as never);
    vi.spyOn(process.stderr, 'write').mockImplementation(((s: string) => err.push(String(s)) > 0) as never);
    const errors: string[] = [];
    vi.spyOn(console, 'error').mockImplementation((m: string) => void errors.push(m));
    vi.spyOn(process, 'exit').mockImplementation((code) => {
        throw new Error(`exit ${code}`);
    });
    const written = () => ({ out: out.join(''), err: err.join('') });
    try {
        return { key: [...(await openVault(cache)).key], errors, read, ...written() };
    } catch (e) {
        return { exit: (e as Error).message, errors, read, ...written() };
    }
}

// What a terminal shows once cursor moves are taken out: the prompt, *s and line ends.
const shown = (s: string) => s.replace(/\x1b\[[0-9;]*[A-Za-z]/g, '');

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
        expect(await fromStdin(['wrong\n'])).toMatchObject({ key: [...KEY], errors: [], read: false, out: '', err: '' });
    });

    it('asks on stderr and writes nothing to stdout', { timeout: 10_000 }, async () => {
        vi.stubEnv('OCV_PASSPHRASE', undefined);
        expect(await fromStdin([`${PASS}\n`])).toMatchObject({ key: [...KEY], out: '', err: 'Vault passphrase: \n' });
    });
});

describe('openVault asking a person at a terminal', () => {
    it('shows only the prompt and *s, when a typo is taken back', { timeout: 10_000 }, async () => {
        vi.stubEnv('OCV_PASSPHRASE', undefined);
        // A backspace makes readline draw the prompt and the whole line again.
        const r = await fromStdin([`${PASS}x`, '\x7f', '\r'], true);
        expect(r).toMatchObject({ key: [...KEY], errors: [], out: '' });
        expect(r.err).toContain('Vault passphrase: ');
        expect(shown(r.err).replaceAll('Vault passphrase: ', '')).toMatch(/^[*\r\n]+$/);
        // The last redraw: one * per character kept, then the line ends.
        expect(shown(r.err).endsWith(`Vault passphrase: ${'*'.repeat(PASS.length)}\n`)).toBe(true);
    });

    it('exits 1 saying it was interrupted, on Ctrl-C', { timeout: 10_000 }, async () => {
        vi.stubEnv('OCV_PASSPHRASE', undefined);
        expect(await fromStdin(['co', '\x03'], true)).toMatchObject({
            exit: 'exit 1',
            errors: ['No passphrase given: interrupted.'],
            out: '',
        });
    });
});
