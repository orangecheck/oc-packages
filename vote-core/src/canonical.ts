// Canonical JSON per SPEC §7: RFC 8785 with our additional constraints.
//
// Rules:
//   - UTF-8 JSON, keys sorted lexicographically at every level.
//   - No insignificant whitespace.
//   - Arrays preserve insertion order. (For polls, the creator's options[] order is
//     preserved verbatim; do NOT sort options[] at canonicalization time.)
//   - Numbers: integers plain; no float variants in any OC Vote object.
//   - Strings: \uXXXX escapes only for U+0000..U+001F, `"`, and `\`. Everything else literal.
//   - Final byte is LF (0x0a).

export function canonicalize(value: unknown): string {
    return serialize(value);
}

/** Returns canonical bytes (LF-terminated) as a UTF-8 string. */
export function canonicalBytes(value: unknown): string {
    return serialize(value) + '\n';
}

function serialize(v: unknown): string {
    if (v === null) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') {
        if (!Number.isFinite(v)) {
            throw new Error('canonicalize: non-finite number');
        }
        return String(v);
    }
    if (typeof v === 'string') return escapeString(v);
    if (Array.isArray(v)) return '[' + v.map(serialize).join(',') + ']';
    if (typeof v === 'object') {
        const keys = Object.keys(v as Record<string, unknown>).sort();
        return (
            '{' +
            keys
                .map(
                    (k) =>
                        escapeString(k) +
                        ':' +
                        serialize((v as Record<string, unknown>)[k])
                )
                .join(',') +
            '}'
        );
    }
    throw new Error('canonicalize: unsupported type ' + typeof v);
}

function escapeString(s: string): string {
    let out = '"';
    for (const ch of s) {
        const cp = ch.codePointAt(0)!;
        if (ch === '"') out += '\\"';
        else if (ch === '\\') out += '\\\\';
        else if (cp < 0x20) {
            out += '\\u' + cp.toString(16).padStart(4, '0');
        } else {
            out += ch;
        }
    }
    return out + '"';
}
