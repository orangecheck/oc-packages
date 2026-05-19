/**
 * `OcVault` — the high-level facade.
 *
 * Holds the unwrapped key and the decrypted entries in process memory, and
 * answers the two questions a developer integration asks: "list what's
 * here" and "resolve this `ocv://` reference." The key is derived here from
 * the passphrase and never leaves the process.
 */

import {
    decryptFields,
    isLiveEntry,
    toSummary,
    unpackEntryFromCloud,
    unwrapVaultKey,
    type VaultEntry,
    type VaultEntryFields,
    type VaultEntrySummary,
    type WrappedKey,
} from './crypto';
import type { VaultExport } from './export';
import { parseExport } from './export';
import { SecretRefError, parseSecretRef, resolveSecretRef, type SecretRef } from './refs';
import type { VaultClient } from './sync';

/** A decrypted entry — the record plus its decrypted inner fields. */
export interface DecryptedEntry {
    entry: VaultEntry;
    fields: VaultEntryFields;
}

export class OcVault {
    private constructor(
        /** The unwrapped 32-byte vault key. In-memory only. */
        readonly key: Uint8Array,
        /** Every live (non-trashed) decrypted entry. */
        readonly entries: DecryptedEntry[],
        /** The OrangeCheck identity this vault belongs to, when known. */
        readonly identity: string | null
    ) {}

    /**
     * Open a live vault over a `VaultClient`: fetch the escrow, unwrap the
     * key with the passphrase, pull every blob, decrypt.
     */
    static async open(opts: { client: VaultClient; passphrase: string }): Promise<OcVault> {
        const escrow = await opts.client.fetchEscrow();
        if (!escrow) {
            throw new Error('no vault is set up for this identity — create one at vault.ochk.io');
        }
        const key = unwrapVaultKey(escrow, opts.passphrase);
        const identity = await opts.client.fetchIdentity();
        const refs = await opts.client.listBlobs();
        const blobs = await opts.client.fetchBlobs(refs);
        return new OcVault(key, OcVault.decodeBlobs(blobs.map((b) => b.ciphertext), key), identity);
    }

    /**
     * Open from a portable export file — fully offline, no network. The
     * export holds ciphertext only, so the escrowed `WrappedKey` and the
     * passphrase are still required to derive the key.
     */
    static fromExport(
        exportFile: string | VaultExport,
        escrow: WrappedKey,
        passphrase: string
    ): OcVault {
        const parsed = parseExport(exportFile);
        const key = unwrapVaultKey(escrow, passphrase);
        const entries = parsed.entries
            .filter(isLiveEntry)
            .map((entry) => ({ entry, fields: decryptFields(entry, key) }));
        return new OcVault(key, entries, parsed.identity);
    }

    /** Open from entries and a raw key you already hold (e.g. the extension). */
    static fromEntries(entries: VaultEntry[], key: Uint8Array): OcVault {
        const decrypted = entries
            .filter(isLiveEntry)
            .map((entry) => ({ entry, fields: decryptFields(entry, key) }));
        return new OcVault(key, decrypted, null);
    }

    private static decodeBlobs(packed: string[], key: Uint8Array): DecryptedEntry[] {
        const out: DecryptedEntry[] = [];
        for (const ciphertext of packed) {
            try {
                const entry = unpackEntryFromCloud(ciphertext, key);
                if (isLiveEntry(entry)) {
                    out.push({ entry, fields: decryptFields(entry, key) });
                }
            } catch {
                // a blob this key cannot decrypt (wrong key / corrupt) — skip
            }
        }
        return out;
    }

    /** Metadata summaries for every entry — no secret values. */
    list(): VaultEntrySummary[] {
        return this.entries.map((d) => toSummary(d.entry, d.fields));
    }

    /** Find one decrypted entry by its id or its name (case-insensitive). */
    find(item: string): DecryptedEntry | null {
        const lower = item.toLowerCase();
        return (
            this.entries.find((d) => d.entry.id.toLowerCase() === lower) ??
            this.entries.find((d) => d.entry.name.toLowerCase() === lower) ??
            null
        );
    }

    /** Resolve one `ocv://` reference to its value. */
    resolve(ref: string | SecretRef): string {
        const parsed = typeof ref === 'string' ? parseSecretRef(ref) : ref;
        if (parsed.vault.toLowerCase() !== 'personal') {
            throw new SecretRefError(
                `vault "${parsed.vault}" — vault-core v1 resolves the personal vault only`
            );
        }
        return resolveSecretRef(this.entries, parsed);
    }

    /**
     * Resolve a map of `{ name: ocv://reference }` to `{ name: value }` —
     * the shape an `.env`-style file or a CI matrix uses.
     */
    resolveAll(refs: Record<string, string>): Record<string, string> {
        const out: Record<string, string> = {};
        for (const [name, ref] of Object.entries(refs)) out[name] = this.resolve(ref);
        return out;
    }
}
