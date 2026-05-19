/**
 * Portable export — a single JSON file holding every entry, still
 * encrypted. The file is a snapshot, not a live link; anyone holding the
 * vault key can decrypt its entries offline with this package alone (no
 * vault.ochk.io required).
 *
 * Format is pinned to oc-vault-web's `oc-vault-export` v1.
 */

import type { VaultEntry } from './crypto';

export const EXPORT_FORMAT = 'oc-vault-export' as const;
export const EXPORT_VERSION = 1 as const;

/** The shape of an `oc-vault-export` v1 file. */
export interface VaultExport {
    format: typeof EXPORT_FORMAT;
    version: typeof EXPORT_VERSION;
    exported_at: string;
    /** Plaintext sender address from the session; may be null. */
    identity: string | null;
    entry_count: number;
    /** Entries with their nonce + ciphertext intact — still sealed under `K`. */
    entries: VaultEntry[];
}

/** Build an export payload from a set of entries. */
export function buildExport(entries: VaultEntry[], identity: string | null): VaultExport {
    return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exported_at: new Date().toISOString(),
        identity,
        entry_count: entries.length,
        entries: entries.map((e) => ({
            id: e.id,
            type: e.type,
            name: e.name,
            nonce: e.nonce,
            ciphertext: e.ciphertext,
            created_at: e.created_at,
            updated_at: e.updated_at,
        })),
    };
}

/**
 * Parse + validate an `oc-vault-export` file (a JSON string or an already
 * parsed object). Throws on a wrong format / version or a malformed entry.
 */
export function parseExport(input: string | unknown): VaultExport {
    let obj: unknown;
    if (typeof input === 'string') {
        try {
            obj = JSON.parse(input);
        } catch {
            throw new Error('export file is not valid JSON');
        }
    } else {
        obj = input;
    }
    if (!obj || typeof obj !== 'object') throw new Error('export file is not an object');

    const e = obj as Partial<VaultExport>;
    if (e.format !== EXPORT_FORMAT) {
        throw new Error(`not an OC Vault export (format: ${String(e.format)})`);
    }
    if (e.version !== EXPORT_VERSION) {
        throw new Error(`unsupported export version: ${String(e.version)}`);
    }
    if (!Array.isArray(e.entries)) throw new Error('export file has no entries array');
    for (const entry of e.entries) {
        if (
            !entry ||
            typeof entry.id !== 'string' ||
            typeof entry.nonce !== 'string' ||
            typeof entry.ciphertext !== 'string'
        ) {
            throw new Error('export file contains a malformed entry');
        }
    }
    return {
        format: EXPORT_FORMAT,
        version: EXPORT_VERSION,
        exported_at: typeof e.exported_at === 'string' ? e.exported_at : '',
        identity: typeof e.identity === 'string' ? e.identity : null,
        entry_count: e.entries.length,
        entries: e.entries as VaultEntry[],
    };
}
