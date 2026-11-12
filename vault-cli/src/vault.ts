/**
 * Opening the cached vault — the one place a passphrase is handled.
 *
 * The passphrase comes from `$OCV_PASSPHRASE` (CI) or a hidden terminal
 * prompt. It unwraps the key in memory; it is never stored.
 */

import { createInterface } from 'node:readline';

import {
    OcVault,
    WrongPassphrase,
    isLiveEntry,
    unpackEntryFromCloud,
    unwrapVaultKey,
    type VaultEntry,
} from '@orangecheck/vault-core';

import { readCache, type VaultCache } from './config';

const CLOSED = Symbol('closed');
const INTERRUPTED = Symbol('interrupted');

/** Read a passphrase without showing it; or why there is none, once input closes or Ctrl-C ends it. */
async function promptPassphrase(): Promise<string | typeof CLOSED | typeof INTERRUPTED> {
    // On stderr, so stdout carries only what the command prints. Terminal mode whenever stdin
    // is a terminal, so the terminal itself never echoes what is typed.
    const rl = createInterface({
        input: process.stdin,
        output: process.stderr,
        terminal: Boolean(process.stdin.isTTY),
    });
    const query = 'Vault passphrase: ';
    const rlAny = rl as unknown as {
        output: NodeJS.WriteStream;
        _writeToOutput: (s: string) => void;
    };
    // readline writes the prompt, each character typed, and on a redraw the prompt with the
    // whole line: only the prompt is shown, every other character as *.
    rlAny._writeToOutput = (s: string) => {
        if (s === '\r\n') return;
        rlAny.output.write(
            s.startsWith(query) ? query + '*'.repeat(s.length - query.length) : '*'.repeat(s.length)
        );
    };
    // The first line, or why there is none: a pending question never settles once input closes.
    const answer = await new Promise<string | typeof CLOSED | typeof INTERRUPTED>((resolve) => {
        rl.once('line', resolve);
        rl.once('close', () => resolve(CLOSED));
        // Ctrl-C on a terminal; without a listener readline closes and it reads as closed input.
        rl.once('SIGINT', () => resolve(INTERRUPTED));
        rl.setPrompt(query);
        rl.prompt();
    });
    rl.close();
    process.stderr.write('\n');
    return answer;
}

/** The cache, or a fatal error telling the user to log in. */
export function requireCache(): VaultCache {
    const cache = readCache();
    if (!cache) {
        console.error('Not logged in. Run `oc-vault login` first.');
        process.exit(1);
    }
    return cache;
}

/**
 * Open the cached vault: take the passphrase, unwrap the key, decode the
 * cached ciphertext blobs into a live `OcVault`.
 */
export async function openVault(cache: VaultCache): Promise<OcVault> {
    const passphrase = process.env.OCV_PASSPHRASE ?? (await promptPassphrase());
    if (passphrase === INTERRUPTED) {
        console.error('No passphrase given: interrupted.');
        process.exit(1);
    }
    if (passphrase === CLOSED) {
        console.error('No passphrase given: input closed before a line.');
        process.exit(1);
    }
    if (!passphrase) {
        console.error('No passphrase given.');
        process.exit(1);
    }
    let key: Uint8Array;
    try {
        key = unwrapVaultKey(cache.escrow, passphrase);
    } catch (err) {
        if (err instanceof WrongPassphrase) {
            console.error('Wrong passphrase.');
            process.exit(1);
        }
        throw err;
    }
    const entries: VaultEntry[] = [];
    for (const blob of cache.blobs) {
        try {
            const entry = unpackEntryFromCloud(blob, key);
            if (isLiveEntry(entry)) entries.push(entry);
        } catch {
            // a blob this key cannot decrypt — skip
        }
    }
    return OcVault.fromEntries(entries, key);
}
