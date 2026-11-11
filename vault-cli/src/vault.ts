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

/** Read a passphrase without echoing it to the terminal; undefined once input closes first. */
async function promptPassphrase(): Promise<string | undefined> {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const query = 'Vault passphrase: ';
    // Mask every echoed character once the prompt itself is written.
    const rlAny = rl as unknown as {
        output: NodeJS.WriteStream;
        _writeToOutput: (s: string) => void;
    };
    rlAny._writeToOutput = (s: string) => {
        rlAny.output.write(s.includes(query) ? s : '*');
    };
    // The first line, or undefined once input closes: a pending question never settles then.
    const answer = await new Promise<string | undefined>((resolve) => {
        rl.once('line', resolve);
        rl.once('close', () => resolve(undefined));
        rl.setPrompt(query);
        rl.prompt();
    });
    rl.close();
    process.stdout.write('\n');
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
    if (passphrase === undefined) {
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
