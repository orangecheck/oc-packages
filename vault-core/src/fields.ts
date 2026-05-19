/**
 * Typed shapes for the decrypted inner fields of each entry type, and the
 * helpers a secret-reference resolver needs to address a field by name.
 *
 * Every shape is UTF-8 JSON inside the AES-GCM `ciphertext` (see
 * `crypto.ts`). `custom` is an array of user-defined extra fields, present
 * on every type except `file`.
 */

import type { VaultEntryFields, VaultEntryType } from './crypto';

/** One user-defined extra field. `secret` fields render masked by default. */
export interface CustomField {
    id: string;
    label: string;
    value: string;
    secret?: boolean;
}

/** One superseded password value, kept when a password entry is edited. */
export interface PasswordHistoryItem {
    value: string;
    changed_at: string;
}

export interface PasswordFields {
    username: string;
    password: string;
    url?: string;
    totp?: string;
    notes?: string;
    passwordHistory?: PasswordHistoryItem[];
    custom?: CustomField[];
}

export interface NoteFields {
    body: string;
    custom?: CustomField[];
}

export interface SeedPhraseFields {
    phrase: string;
    wallet?: string;
    notes?: string;
    custom?: CustomField[];
}

export interface TotpFields {
    issuer: string;
    account: string;
    secret: string;
    digits?: number;
    period?: number;
    custom?: CustomField[];
}

export interface ApiKeyFields {
    service: string;
    key: string;
    url?: string;
    notes?: string;
    custom?: CustomField[];
}

export interface KvFields {
    key: string;
    value: string;
    custom?: CustomField[];
}

export interface CardFields {
    cardholder: string;
    number: string;
    brand?: string;
    exp?: string;
    cvv?: string;
    pin?: string;
    zip?: string;
    notes?: string;
    custom?: CustomField[];
}

export interface IdentityFields {
    fullName?: string;
    email?: string;
    phone?: string;
    company?: string;
    address?: string;
    notes?: string;
    custom?: CustomField[];
}

export interface FileFields {
    filename: string;
    mime: string;
    dataB64: string;
}

/**
 * The "primary" field of each entry type — the one a secret reference
 * resolves to when no field component is given (`ocv://personal/Stripe`
 * → the api-key's `key`).
 */
export const PRIMARY_FIELD: Record<VaultEntryType, string> = {
    password: 'password',
    note: 'body',
    'seed-phrase': 'phrase',
    totp: 'secret',
    'api-key': 'key',
    kv: 'value',
    card: 'number',
    identity: 'email',
    file: 'filename',
};

/**
 * Resolve a field of decrypted entry fields by name — case-insensitively,
 * and including a match against a `custom[]` field's `label`. Returns
 * `undefined` when there is no such field or its value is not a string.
 */
export function fieldValue(fields: VaultEntryFields, name: string): string | undefined {
    const direct = fields[name];
    if (typeof direct === 'string') return direct;

    const lower = name.toLowerCase();
    for (const [k, v] of Object.entries(fields)) {
        if (k.toLowerCase() === lower && typeof v === 'string') return v;
    }

    const custom = fields.custom;
    if (Array.isArray(custom)) {
        for (const c of custom as CustomField[]) {
            if (c && typeof c.label === 'string' && c.label.toLowerCase() === lower) {
                return typeof c.value === 'string' ? c.value : undefined;
            }
        }
    }
    return undefined;
}
