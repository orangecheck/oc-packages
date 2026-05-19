/**
 * Local config + cache.
 *
 * `oc-vault login` writes a cache holding the escrowed (passphrase-wrapped)
 * key and the packed cloud-blob ciphertext — nothing in it is plaintext, so
 * every later command runs fully offline. The passphrase is never written;
 * it is supplied per-command and unwraps the key in memory only.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

import type { WrappedKey } from '@orangecheck/vault-core';

/** The on-disk cache — escrow + ciphertext blobs, no plaintext. */
export interface VaultCache {
    baseUrl: string;
    identity: string | null;
    /** The passphrase-wrapped vault key. Safe at rest. */
    escrow: WrappedKey;
    /** Packed cloud-blob ciphertext, one string per entry. */
    blobs: string[];
    /** A long-lived access token, stored only when `login --token` was used. */
    token?: string;
    synced_at: string;
}

/** The config directory — `$XDG_CONFIG_HOME/oc-vault` or `~/.config/oc-vault`. */
export function configDir(): string {
    const base = process.env.XDG_CONFIG_HOME || join(homedir(), '.config');
    return join(base, 'oc-vault');
}

function cachePath(): string {
    return join(configDir(), 'vault.json');
}

/** Read the cache, or null when `oc-vault login` has not been run. */
export function readCache(): VaultCache | null {
    try {
        return JSON.parse(readFileSync(cachePath(), 'utf8')) as VaultCache;
    } catch {
        return null;
    }
}

/** Write the cache with owner-only permissions. */
export function writeCache(cache: VaultCache): void {
    mkdirSync(configDir(), { recursive: true, mode: 0o700 });
    writeFileSync(cachePath(), JSON.stringify(cache, null, 2), { mode: 0o600 });
}

/**
 * Parse a `.env`-style file of `KEY=ocv://…` references. Blank lines and
 * `#` comments are skipped; surrounding quotes are stripped.
 */
export function parseEnvFile(text: string): Record<string, string> {
    const out: Record<string, string> = {};
    for (const rawLine of text.split('\n')) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#')) continue;
        const eq = line.indexOf('=');
        if (eq === -1) continue;
        const key = line.slice(0, eq).trim();
        let value = line.slice(eq + 1).trim();
        if (
            (value.startsWith('"') && value.endsWith('"')) ||
            (value.startsWith("'") && value.endsWith("'"))
        ) {
            value = value.slice(1, -1);
        }
        if (key) out[key] = value;
    }
    return out;
}

/** Every `ocv://` reference appearing in a block of text. */
export function scanRefs(text: string): string[] {
    return text.match(/ocv:\/\/[^\s'"`)}\]]+/g) ?? [];
}
