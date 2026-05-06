// Canonical messages + RFC 8785 envelope canonicalization for OC Pledge.
//
// Three independent canonical-message builders (one per envelope kind) and a
// single RFC 8785 JSON canonicalizer reused across all three envelope wires.
//
// The canonical-message builders are the load-bearing pieces of this SDK —
// they MUST produce byte-identical output across implementations for identical
// inputs (SPEC §11.8). Every committed test vector in oc-pledge-protocol/
// test-vectors/ pins the exact bytes.

import { sha256 } from '@noble/hashes/sha256';

import type {
    AbandonmentCanonicalInput,
    AbandonmentEnvelope,
    OutcomeCanonicalInput,
    OutcomeEnvelope,
    PledgeCanonicalInput,
    PledgeEnvelope,
    PledgeResolvesAt,
} from './types.js';
import { RESOLUTION_MECHANISMS } from './types.js';

// ─────────────────────────────────────────────────────────────────────────────
// Pledge canonical message — SPEC §3.1
//
// Layout (LF-separated, no trailing LF):
//   oc-pledge/v1
//   swearer: <btc_address>
//   proposition: <single line>
//   resolution:
//     mechanism: <one of the seven>
//     query: <single line>
//   resolves_at:
//     time: <ISO> | block: <integer>
//   expires_at: <ISO>
//   bond:
//     attestation_id: <64-hex>
//     min_sats: <integer>
//     min_days: <integer>
//   counterparty: <btc_address | null>
//   dispute:
//     mechanism: <vote_resolves | named_oracle | null>
//     params: <string | null>
//   remediation: breach_recorded
//   sworn_at: <ISO>
//   nonce: <32-hex>
//
// Sub-blocks (resolution, resolves_at, bond, dispute) are introduced by a
// label-only line ("foo:") followed by 2-space-indented sub-fields. The
// `null` token is the literal four-character string, not a quoted string.
// ─────────────────────────────────────────────────────────────────────────────

const PLEDGE_DOMAIN = 'oc-pledge/v1';
const OUTCOME_DOMAIN = 'oc-pledge-outcome/v1';
const ABANDONMENT_DOMAIN = 'oc-pledge-abandonment/v1';

export function canonicalPledgeMessage(input: PledgeCanonicalInput): string {
    const lines: string[] = [];
    lines.push(PLEDGE_DOMAIN);
    lines.push(`swearer: ${input.swearer}`);
    lines.push(`proposition: ${input.proposition}`);
    lines.push('resolution:');
    lines.push(`  mechanism: ${input.resolution.mechanism}`);
    lines.push(`  query: ${input.resolution.query}`);
    lines.push('resolves_at:');
    lines.push(`  ${resolvesAtLine(input.resolves_at)}`);
    lines.push(`expires_at: ${input.expires_at}`);
    lines.push('bond:');
    lines.push(`  attestation_id: ${input.bond.attestation_id}`);
    lines.push(`  min_sats: ${input.bond.min_sats}`);
    lines.push(`  min_days: ${input.bond.min_days}`);
    lines.push(`counterparty: ${input.counterparty === null ? 'null' : input.counterparty}`);
    lines.push('dispute:');
    lines.push(`  mechanism: ${input.dispute.mechanism === null ? 'null' : input.dispute.mechanism}`);
    lines.push(`  params: ${input.dispute.params === null ? 'null' : input.dispute.params}`);
    lines.push(`remediation: ${input.remediation}`);
    lines.push(`sworn_at: ${input.sworn_at}`);
    lines.push(`nonce: ${input.nonce}`);
    return lines.join('\n');
}

function resolvesAtLine(r: PledgeResolvesAt): string {
    if ('time' in r) return `time: ${r.time}`;
    return `block: ${r.block}`;
}

export function canonicalPledgeMessageBytes(input: PledgeCanonicalInput): Uint8Array {
    return new TextEncoder().encode(canonicalPledgeMessage(input));
}

export function computePledgeId(input: PledgeCanonicalInput): string {
    return hexEncode(sha256(canonicalPledgeMessageBytes(input)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Outcome canonical message — SPEC §4.1
//
// Layout:
//   oc-pledge-outcome/v1
//   pledge_id: <64-hex>
//   outcome: <kept | broken | expired_unresolved | disputed>
//   resolved_at: <ISO>
//   resolved_by: <addr | "deterministic">
//   evidence:
//     mechanism: <same as pledge>
//     result: <single line>
//     witness: <single line>
//   dispute_window_ends_at: <ISO>
// ─────────────────────────────────────────────────────────────────────────────

export function canonicalOutcomeMessage(input: OutcomeCanonicalInput): string {
    const lines: string[] = [];
    lines.push(OUTCOME_DOMAIN);
    lines.push(`pledge_id: ${input.pledge_id}`);
    lines.push(`outcome: ${input.outcome}`);
    lines.push(`resolved_at: ${input.resolved_at}`);
    lines.push(`resolved_by: ${input.resolved_by}`);
    lines.push('evidence:');
    lines.push(`  mechanism: ${input.evidence.mechanism}`);
    lines.push(`  result: ${input.evidence.result}`);
    lines.push(`  witness: ${input.evidence.witness}`);
    lines.push(`dispute_window_ends_at: ${input.dispute_window_ends_at}`);
    return lines.join('\n');
}

export function canonicalOutcomeMessageBytes(input: OutcomeCanonicalInput): Uint8Array {
    return new TextEncoder().encode(canonicalOutcomeMessage(input));
}

export function computeOutcomeId(input: OutcomeCanonicalInput): string {
    return hexEncode(sha256(canonicalOutcomeMessageBytes(input)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Abandonment canonical message — SPEC §5.1
//
// Layout:
//   oc-pledge-abandonment/v1
//   pledge_id: <64-hex>
//   abandoned_at: <ISO>
//   reason: <single line, ≤ 280 UTF-8 bytes>
// ─────────────────────────────────────────────────────────────────────────────

export function canonicalAbandonmentMessage(input: AbandonmentCanonicalInput): string {
    return [
        ABANDONMENT_DOMAIN,
        `pledge_id: ${input.pledge_id}`,
        `abandoned_at: ${input.abandoned_at}`,
        `reason: ${input.reason}`,
    ].join('\n');
}

export function canonicalAbandonmentMessageBytes(
    input: AbandonmentCanonicalInput,
): Uint8Array {
    return new TextEncoder().encode(canonicalAbandonmentMessage(input));
}

export function computeAbandonmentId(input: AbandonmentCanonicalInput): string {
    return hexEncode(sha256(canonicalAbandonmentMessageBytes(input)));
}

// ─────────────────────────────────────────────────────────────────────────────
// Field validation — runs before any of the canonical-message builders so a
// caller can preview validity without producing a malformed signed envelope.
// SPEC §3.6, §4.2 (table), §5.3 (table).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * SPEC §0: ISO 8601 UTC means YYYY-MM-DDTHH:MM:SSZ — no fractional seconds,
 * no offsets other than the literal capital-Z suffix. Stricter than stamp's
 * ISO regex; pledge canonical bytes must reject `+00:00`, lowercase `z`, and
 * any fractional-second form.
 */
const ISO_UTC_STRICT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const HEX_64 = /^[0-9a-f]{64}$/;
const HEX_32 = /^[0-9a-f]{32}$/;

export type ValidateResult = { ok: true } | { ok: false; reason: string };

export function validatePledgeInput(input: PledgeCanonicalInput): ValidateResult {
    if (!input.swearer || /[\s\x00-\x1f]/.test(input.swearer)) {
        return r('swearer must be non-empty with no whitespace or control chars');
    }
    if (input.proposition.length === 0 || /[\n\r]/.test(input.proposition)) {
        return r('proposition must be non-empty and a single line (no LF or CR)');
    }
    if (new TextEncoder().encode(input.proposition).byteLength > 512) {
        return r('proposition exceeds 512 UTF-8 bytes');
    }
    if (!RESOLUTION_MECHANISMS.includes(input.resolution.mechanism)) {
        return r(
            `resolution.mechanism "${input.resolution.mechanism}" is not in the SPEC §3.4 set`,
        );
    }
    if (input.resolution.query.length === 0 || /[\n\r]/.test(input.resolution.query)) {
        return r('resolution.query must be non-empty and a single line');
    }
    if (new TextEncoder().encode(input.resolution.query).byteLength > 1024) {
        return r('resolution.query exceeds 1024 UTF-8 bytes');
    }
    if ('time' in input.resolves_at) {
        if (!ISO_UTC_STRICT.test(input.resolves_at.time)) {
            return r('resolves_at.time must be ISO 8601 UTC ending in Z (no fractional seconds)');
        }
    } else if ('block' in input.resolves_at) {
        if (!Number.isInteger(input.resolves_at.block) || input.resolves_at.block < 0) {
            return r('resolves_at.block must be a non-negative integer');
        }
    } else {
        return r('resolves_at must contain exactly one of {time} or {block}');
    }
    if (!ISO_UTC_STRICT.test(input.expires_at)) {
        return r('expires_at must be ISO 8601 UTC ending in Z (no fractional seconds)');
    }
    if (!HEX_64.test(input.bond.attestation_id)) {
        return r('bond.attestation_id must be 64 lowercase hex chars');
    }
    if (!Number.isInteger(input.bond.min_sats) || input.bond.min_sats < 0) {
        return r('bond.min_sats must be a non-negative integer');
    }
    if (!Number.isInteger(input.bond.min_days) || input.bond.min_days < 0) {
        return r('bond.min_days must be a non-negative integer');
    }
    if (input.counterparty !== null && /[\s\x00-\x1f]/.test(input.counterparty)) {
        return r('counterparty must be a Bitcoin address or null');
    }
    if (input.resolution.mechanism === 'counterparty_signs' && input.counterparty === null) {
        return r('counterparty MUST be non-null when resolution.mechanism == counterparty_signs');
    }
    if (
        input.dispute.mechanism !== null &&
        input.dispute.mechanism !== 'vote_resolves' &&
        input.dispute.mechanism !== 'named_oracle'
    ) {
        return r('dispute.mechanism must be null, "vote_resolves", or "named_oracle"');
    }
    if (input.dispute.params !== null && /[\n\r]/.test(input.dispute.params)) {
        return r('dispute.params must be a single line or null');
    }
    if (input.remediation !== 'breach_recorded') {
        return r('remediation must equal "breach_recorded" in v0.1');
    }
    if (!ISO_UTC_STRICT.test(input.sworn_at)) {
        return r('sworn_at must be ISO 8601 UTC ending in Z (no fractional seconds)');
    }
    // Empty nonce is the test-vector v28 path — must reject.
    if (input.nonce.length === 0) {
        return r('nonce MUST be non-empty (E_PLEDGE_MALFORMED per SPEC §3.1)');
    }
    if (!HEX_32.test(input.nonce)) {
        return r('nonce must be 32 lowercase hex characters');
    }
    return { ok: true };
}

export function validateOutcomeInput(input: OutcomeCanonicalInput): ValidateResult {
    if (!HEX_64.test(input.pledge_id)) return r('pledge_id must be 64 lowercase hex chars');
    if (!['kept', 'broken', 'expired_unresolved', 'disputed'].includes(input.outcome)) {
        return r('outcome must be one of: kept, broken, expired_unresolved, disputed');
    }
    if (!ISO_UTC_STRICT.test(input.resolved_at)) {
        return r('resolved_at must be ISO 8601 UTC ending in Z');
    }
    if (
        input.resolved_by !== 'deterministic' &&
        (!input.resolved_by || /[\s\x00-\x1f]/.test(input.resolved_by))
    ) {
        return r('resolved_by must be "deterministic" or a Bitcoin address');
    }
    if (!RESOLUTION_MECHANISMS.includes(input.evidence.mechanism)) {
        return r(`evidence.mechanism "${input.evidence.mechanism}" is not in the SPEC §3.4 set`);
    }
    if (input.evidence.result.length === 0 || /[\n\r]/.test(input.evidence.result)) {
        return r('evidence.result must be a non-empty single line');
    }
    if (input.evidence.witness.length === 0 || /[\n\r]/.test(input.evidence.witness)) {
        return r('evidence.witness must be a non-empty single line');
    }
    if (!ISO_UTC_STRICT.test(input.dispute_window_ends_at)) {
        return r('dispute_window_ends_at must be ISO 8601 UTC ending in Z');
    }
    return { ok: true };
}

export function validateAbandonmentInput(
    input: AbandonmentCanonicalInput,
): ValidateResult {
    if (!HEX_64.test(input.pledge_id)) return r('pledge_id must be 64 lowercase hex chars');
    if (!ISO_UTC_STRICT.test(input.abandoned_at)) {
        return r('abandoned_at must be ISO 8601 UTC ending in Z');
    }
    if (input.reason.length === 0 || /[\n\r]/.test(input.reason)) {
        return r('reason must be a non-empty single line');
    }
    if (new TextEncoder().encode(input.reason).byteLength > 280) {
        return r('reason exceeds 280 UTF-8 bytes');
    }
    return { ok: true };
}

function r(reason: string): ValidateResult {
    return { ok: false, reason };
}

// ─────────────────────────────────────────────────────────────────────────────
// Envelope canonicalization — SPEC §6 (RFC 8785)
//
// Same encoder as stamp-core: keys sorted, no insignificant whitespace,
// integers serialized without exponents, control chars `\uXXXX`-escaped.
// `undefined` keys are dropped (used for optional via_delegation / agent_address).
// ─────────────────────────────────────────────────────────────────────────────

export type JsonValue =
    | null
    | boolean
    | number
    | string
    | JsonValue[]
    | { [key: string]: JsonValue };

export function canonicalize(value: JsonValue): string {
    return encode(value);
}

export function canonicalizePledgeEnvelope(env: PledgeEnvelope): string {
    return canonicalize(env as unknown as JsonValue);
}

export function canonicalizeOutcomeEnvelope(env: OutcomeEnvelope): string {
    return canonicalize(env as unknown as JsonValue);
}

export function canonicalizeAbandonmentEnvelope(env: AbandonmentEnvelope): string {
    return canonicalize(env as unknown as JsonValue);
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

/**
 * Generate a 32-char-hex random nonce (16 random bytes). Uses globalThis.crypto
 * which is available in Node 20+ and every browser. Throws if the runtime
 * lacks a crypto source; callers wanting deterministic test fixtures pass an
 * explicit nonce instead.
 */
export function generateNonce(): string {
    const bytes = new Uint8Array(16);
    const c = (globalThis as { crypto?: Crypto }).crypto;
    if (!c || typeof c.getRandomValues !== 'function') {
        throw new Error('no crypto.getRandomValues available; pass an explicit nonce');
    }
    c.getRandomValues(bytes);
    return hexEncode(bytes);
}
