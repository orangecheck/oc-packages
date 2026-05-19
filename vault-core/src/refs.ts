/**
 * `ocv://` secret references — the only secret-shaped string that belongs
 * in a committed file.
 *
 *   ocv://<vault>/<item>/<field>[?attr=otp]
 *
 *  - vault — `personal`, or a team name / id.
 *  - item  — an entry's `name` (case-insensitive) or its 32-hex `id`.
 *  - field — a field name inside the decrypted entry; omitted → the type's
 *            primary field (see `PRIMARY_FIELD`).
 *  - ?attr=otp — emit the live TOTP code instead of the stored value.
 *
 * A component containing `/`, `?`, or whitespace must use the entry `id`.
 */

import { PRIMARY_FIELD, fieldValue } from './fields';
import { totp } from './totp';
import type { DecryptedEntry } from './vault';

export const OCV_SCHEME = 'ocv://';

/** Thrown for a malformed reference or a reference that resolves to nothing. */
export class SecretRefError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SecretRefError';
    }
}

/** A parsed `ocv://` reference. */
export interface SecretRef {
    /** The reference as written. */
    raw: string;
    /** `personal` or a team name / id. */
    vault: string;
    /** An entry name or 32-hex id. */
    item: string;
    /** A field name; absent means the entry type's primary field. */
    field?: string;
    /** `otp` to emit a live TOTP code; absent means the field's value. */
    attr?: string;
}

/** True when `s` looks like an `ocv://` reference (cheap prefix test). */
export function isSecretRef(s: string): boolean {
    return typeof s === 'string' && s.startsWith(OCV_SCHEME);
}

/** Parse an `ocv://` reference. Throws `SecretRefError` when malformed. */
export function parseSecretRef(ref: string): SecretRef {
    if (!isSecretRef(ref)) {
        throw new SecretRefError(`not an ocv:// reference: ${ref}`);
    }
    const body = ref.slice(OCV_SCHEME.length);
    const qIndex = body.indexOf('?');
    const path = qIndex === -1 ? body : body.slice(0, qIndex);
    const query = qIndex === -1 ? '' : body.slice(qIndex + 1);

    const parts = path.split('/').map((p) => decodeURIComponent(p));
    if (parts.length < 2 || parts.length > 3 || parts.some((p) => p === '')) {
        throw new SecretRefError(
            `malformed reference — expected ocv://vault/item[/field]: ${ref}`
        );
    }

    let attr: string | undefined;
    for (const pair of query.split('&')) {
        if (!pair) continue;
        const eq = pair.indexOf('=');
        const k = decodeURIComponent(eq === -1 ? pair : pair.slice(0, eq));
        const v = eq === -1 ? '' : decodeURIComponent(pair.slice(eq + 1));
        if (k === 'attr' || k === 'attribute') attr = v.toLowerCase();
    }

    return {
        raw: ref,
        vault: parts[0]!,
        item: parts[1]!,
        field: parts[2],
        attr,
    };
}

/** Locate the one entry a reference names within `entries`. */
function findEntry(entries: DecryptedEntry[], item: string): DecryptedEntry {
    const lower = item.toLowerCase();
    const byId = entries.filter((e) => e.entry.id.toLowerCase() === lower);
    if (byId.length === 1) return byId[0]!;

    const byName = entries.filter((e) => e.entry.name.toLowerCase() === lower);
    if (byName.length === 1) return byName[0]!;
    if (byName.length > 1) {
        throw new SecretRefError(
            `"${item}" matches ${byName.length} entries — reference it by its id instead`
        );
    }
    throw new SecretRefError(`no entry named "${item}"`);
}

/**
 * Resolve a reference against a set of already-decrypted entries. `entries`
 * must be the entries of the reference's `vault` — scoping the vault is the
 * caller's responsibility (see `OcVault.resolve`).
 */
export function resolveSecretRef(
    entries: DecryptedEntry[],
    ref: string | SecretRef
): string {
    const parsed = typeof ref === 'string' ? parseSecretRef(ref) : ref;
    const { entry, fields } = findEntry(entries, parsed.item);

    // `env` entries hold a bundle in `fields.vars`. With no field, the
    // whole bundle is emitted as `KEY=value` lines (the natural `.env`
    // shape); with a field, a single var is resolved (case-insensitive).
    if (entry.type === 'env') {
        const vars =
            fields.vars && typeof fields.vars === 'object'
                ? (fields.vars as Record<string, unknown>)
                : {};
        if (!parsed.field) {
            const lines: string[] = [];
            for (const [k, v] of Object.entries(vars)) {
                if (typeof v === 'string') lines.push(`${k}=${v}`);
            }
            return lines.join('\n');
        }
        const lower = parsed.field.toLowerCase();
        for (const [k, v] of Object.entries(vars)) {
            if (k.toLowerCase() === lower && typeof v === 'string') return v;
        }
        throw new SecretRefError(`${parsed.raw} — env entry has no var "${parsed.field}"`);
    }

    if (parsed.attr === 'otp') {
        const seed =
            entry.type === 'totp'
                ? fieldValue(fields, 'secret')
                : fieldValue(fields, parsed.field ?? 'totp');
        if (!seed) {
            throw new SecretRefError(`${parsed.raw} — entry carries no TOTP secret`);
        }
        const digits = typeof fields.digits === 'number' ? fields.digits : undefined;
        const period = typeof fields.period === 'number' ? fields.period : undefined;
        return totp(seed, { digits, period });
    }

    const field = parsed.field ?? PRIMARY_FIELD[entry.type];
    const value = fieldValue(fields, field);
    if (value === undefined) {
        throw new SecretRefError(`${parsed.raw} — entry has no field "${field}"`);
    }
    return value;
}
