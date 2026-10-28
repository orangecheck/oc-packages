// The canonical bytes OC Chat hashes for channel descriptors and posts (SPEC §0):
// keys sorted at every depth, compact, LF-terminated. Arrays keep their order.

import { b64urlEncode, utf8Encode } from '@orangecheck/lock-crypto';

export function canonicalBytes(value: unknown): Uint8Array {
    const sort = (v: unknown): unknown => {
        if (Array.isArray(v)) return v.map(sort);
        if (v && typeof v === 'object') {
            const out: Record<string, unknown> = {};
            for (const k of Object.keys(v as Record<string, unknown>).sort()) {
                out[k] = sort((v as Record<string, unknown>)[k]);
            }
            return out;
        }
        return v;
    };
    return utf8Encode(JSON.stringify(sort(value)) + '\n');
}

/** base64url without padding, the d-tag suffix encoding. */
export function b64urlNoPad(bytes: Uint8Array): string {
    return b64urlEncode(bytes).replace(/=+$/, '');
}
