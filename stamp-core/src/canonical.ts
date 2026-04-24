// Canonical message + RFC 8785 JSON canonicalization for OC Stamp.
//
// Two distinct canonicalizers live here:
//
//   1. canonicalMessage(input) — the exact byte sequence the signer signs via
//      BIP-322. LF-separated, no trailing LF after signed_at. SPEC §3.1.
//
//   2. canonicalizeEnvelope(env) — RFC 8785 JSON canonicalization of the wire
//      envelope, used for stable serialization / equality checks. SPEC §5.
//
// Only (1) participates in the id derivation. (2) is for test-vector byte
// equality and any future operation that needs deterministic envelope bytes.

import { sha256 } from '@noble/hashes/sha256';

import type { CanonicalMessageInput, StampEnvelope } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Canonical message (SPEC §3.1)
// ─────────────────────────────────────────────────────────────────────────────

export function canonicalMessage(input: CanonicalMessageInput): string {
    // The domain separator `oc-stamp:v1` commits the whole signing ceremony to
    // this spec version. Future incompatible changes MUST bump the version
    // number here so a v1 signature can never be replayed against a v2 domain.
    return [
        'oc-stamp:v1',
        `address: ${input.address}`,
        `content_hash: ${input.content_hash}`,
        `content_length: ${input.content_length}`,
        `content_mime: ${input.content_mime}`,
        `signed_at: ${input.signed_at}`,
    ].join('\n');
}

export function canonicalMessageBytes(input: CanonicalMessageInput): Uint8Array {
    return new TextEncoder().encode(canonicalMessage(input));
}

/**
 * Compute the envelope id as lowercase hex of sha256(canonical_message_bytes).
 * Pure function — the single source of truth for identity derivation.
 */
export function computeEnvelopeId(input: CanonicalMessageInput): string {
    const bytes = canonicalMessageBytes(input);
    return hexEncode(sha256(bytes));
}

// ─────────────────────────────────────────────────────────────────────────────
// Envelope canonicalization (SPEC §5; RFC 8785)
// ─────────────────────────────────────────────────────────────────────────────

export type JsonValue =
    | null
    | boolean
    | number
    | string
    | JsonValue[]
    | { [key: string]: JsonValue };

export function canonicalizeEnvelope(env: StampEnvelope): string {
    return canonicalize(env as unknown as JsonValue);
}

export function canonicalEnvelopeBytes(env: StampEnvelope): Uint8Array {
    return new TextEncoder().encode(canonicalize(env as unknown as JsonValue) + '\n');
}

export function canonicalize(value: JsonValue): string {
    return encode(value);
}

function encode(v: JsonValue): string {
    if (v === null) return 'null';
    if (typeof v === 'boolean') return v ? 'true' : 'false';
    if (typeof v === 'number') return encodeNumber(v);
    if (typeof v === 'string') return encodeString(v);
    if (Array.isArray(v)) {
        const parts: string[] = [];
        for (const item of v) parts.push(encode(item));
        return '[' + parts.join(',') + ']';
    }
    if (typeof v === 'object') {
        const keys = Object.keys(v).sort();
        const parts: string[] = [];
        for (const k of keys) {
            const inner = v[k];
            if (inner === undefined) continue;
            parts.push(encodeString(k) + ':' + encode(inner as JsonValue));
        }
        return '{' + parts.join(',') + '}';
    }
    throw new Error('cannot canonicalize value of type ' + typeof v);
}

function encodeNumber(n: number): string {
    if (!Number.isFinite(n)) throw new Error('non-finite number not JSON-canonicalizable');
    if (Object.is(n, -0)) return '0';
    if (Number.isInteger(n) && Math.abs(n) < 1e21) {
        return String(n);
    }
    return JSON.stringify(n);
}

const ESCAPE_TABLE: Record<string, string> = {
    '\\': '\\\\',
    '"': '\\"',
    '\b': '\\b',
    '\f': '\\f',
    '\n': '\\n',
    '\r': '\\r',
    '\t': '\\t',
};

function encodeString(s: string): string {
    let out = '"';
    for (let i = 0; i < s.length; i++) {
        const ch = s[i]!;
        const code = ch.charCodeAt(0);
        if (ESCAPE_TABLE[ch]) {
            out += ESCAPE_TABLE[ch];
        } else if (code < 0x20) {
            out += '\\u' + code.toString(16).padStart(4, '0');
        } else {
            out += ch;
        }
    }
    out += '"';
    return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// Small utilities
// ─────────────────────────────────────────────────────────────────────────────

const HEX_TABLE = '0123456789abcdef';

export function hexEncode(bytes: Uint8Array): string {
    let out = '';
    for (let i = 0; i < bytes.length; i++) {
        const b = bytes[i]!;
        out += HEX_TABLE[(b >> 4) & 0x0f]! + HEX_TABLE[b & 0x0f]!;
    }
    return out;
}

export function sha256Hex(bytes: Uint8Array): string {
    return hexEncode(sha256(bytes));
}
