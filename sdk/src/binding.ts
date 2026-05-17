/**
 * @orangecheck/sdk · Binding Attestation (OC Attest v1)
 *
 * Reference implementation of `oc-attest-protocol/SPEC-BINDING.md` — the
 * mutually-signed BTC ⇄ Nostr identity bond. Three entry points:
 *
 *   - `buildBindingMessage(input)` — the canonical 8-line message (§3).
 *   - `bindingId(message)`         — `SHA-256(message)` content address (§5).
 *   - `verifyBinding(envelope)`    — the §7 verification algorithm.
 *
 * `verifyBinding` is pure and offline: it verifies the BIP-322 root proof,
 * the Nostr counter-signature, and the single-message rule with zero trust
 * in any server. Conformance: the `bv*` vectors in
 * `oc-attest-protocol/conformance/vectors/`.
 */

import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';
import { bech32 } from '@scure/base';
import { Verifier } from 'bip322-js';
import * as bitcoinMessage from 'bitcoinjs-message';

const HEADER = 'orangecheck-binding';
const ACK = 'I attest the keys named in this message are one principal.';
const BINDING_KIND = 30079;

/* --- types --- */

export interface BindingInput {
    /** `did:oc:<32-hex>` principal the two keys jointly control. */
    principal: string;
    /** Bitcoin address (the BTC key). */
    btc: string;
    /** Nostr public key, bech32 `npub1…`. */
    nostr: string;
    /** 16 random bytes as 32 lowercase hex. */
    nonce: string;
    /** ISO-8601 UTC, `Z` suffix. */
    issued_at: string;
    /** Optional signed extension lines (e.g. `expires`, `network`). */
    extensions?: Record<string, string>;
}

export interface BindingNostrEvent {
    id: string;
    pubkey: string;
    kind: number;
    created_at: number;
    tags: string[][];
    content: string;
    sig: string;
}

export interface BindingEnvelope {
    binding_id?: string;
    v?: number;
    principal?: string;
    btc?: string;
    nostr?: string;
    message: string;
    btc_signature?: string;
    btc_scheme?: 'bip322' | 'legacy';
    nostr_event?: BindingNostrEvent;
}

/** Verification status — `binding_ok` on success, else the first failure
 *  reached in the §7 order (lowercase, matching the `bv*` vectors). */
export type BindingStatus =
    | 'binding_ok'
    | 'malformed'
    | 'bad_header'
    | 'bad_ack'
    | 'bad_principal'
    | 'ext_unsorted'
    | 'id_mismatch'
    | 'field_mismatch'
    | 'expired'
    | 'network'
    | 'bad_scheme'
    | 'btc_sig_invalid'
    | 'nostr_id_invalid'
    | 'nostr_sig_invalid'
    | 'nostr_key_mismatch'
    | 'message_mismatch';

export type BindingVerifyResult =
    | {
          valid: true;
          status: 'binding_ok';
          binding_id: string;
          principal: string;
          btc: string;
          nostr: string;
      }
    | { valid: false; status: Exclude<BindingStatus, 'binding_ok'> };

/* --- hex helpers --- */

function toHex(bytes: Uint8Array): string {
    let out = '';
    for (const b of bytes) out += b.toString(16).padStart(2, '0');
    return out;
}

function fromHex(hex: string): Uint8Array {
    const clean = hex.toLowerCase();
    if (clean.length % 2 !== 0 || /[^0-9a-f]/.test(clean)) {
        throw new Error('invalid hex');
    }
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16);
    return out;
}

/** Reject any value carrying a CR, LF, or other non-printable byte — the
 *  line-smuggling defense of SPEC-BINDING §3.5. Printable ASCII only. */
function assertPrintableAscii(field: string, value: string): void {
    for (let i = 0; i < value.length; i++) {
        const c = value.charCodeAt(i);
        if (c < 0x20 || c > 0x7e) {
            throw new Error(
                `binding ${field} contains an unsafe character (0x${c.toString(16)}) — ` +
                    `line-smuggling defense (SPEC-BINDING §3.5)`
            );
        }
    }
}

/* --- build --- */

/**
 * Build the canonical binding message (SPEC-BINDING §3) — 8 fixed core
 * lines plus zero or more lexicographically-sorted extension lines, one
 * trailing LF. Throws if any field value carries an unsafe character.
 */
export function buildBindingMessage(input: BindingInput): string {
    assertPrintableAscii('principal', input.principal);
    assertPrintableAscii('btc', input.btc);
    assertPrintableAscii('nostr', input.nostr);
    assertPrintableAscii('nonce', input.nonce);
    assertPrintableAscii('issued_at', input.issued_at);

    const core = [
        HEADER,
        'v: 1',
        `principal: ${input.principal}`,
        `btc: ${input.btc}`,
        `nostr: ${input.nostr}`,
        `nonce: ${input.nonce}`,
        `issued_at: ${input.issued_at}`,
        `ack: ${ACK}`,
    ];

    const ext: string[] = [];
    if (input.extensions) {
        for (const key of Object.keys(input.extensions).sort()) {
            const value = input.extensions[key];
            if (value == null) continue;
            if (!/^[a-z]+$/.test(key)) {
                throw new Error(`binding extension key "${key}" must be lowercase ASCII`);
            }
            assertPrintableAscii(`extension ${key}`, value);
            ext.push(`${key}: ${value}`);
        }
    }

    return [...core, ...ext].join('\n') + '\n';
}

/** `binding_id = SHA-256(message bytes)`, lowercase hex (SPEC-BINDING §5). */
export function bindingId(message: string): string {
    return toHex(sha256(new TextEncoder().encode(message)));
}

/* --- verify --- */

function linePrefix(line: string | undefined, prefix: string): string | null {
    if (typeof line !== 'string' || !line.startsWith(prefix)) return null;
    return line.slice(prefix.length);
}

/** Recompute a Nostr event id from its NIP-01 canonical serialization. */
function nostrEventId(ev: BindingNostrEvent): string {
    const serialized = JSON.stringify([
        0,
        ev.pubkey,
        ev.created_at,
        ev.kind,
        ev.tags,
        ev.content,
    ]);
    return toHex(sha256(new TextEncoder().encode(serialized)));
}

/** Decode a bech32 `npub1…` to its 32-byte x-only key as lowercase hex. */
function npubToXOnlyHex(npub: string): string {
    const decoded = bech32.decode(npub as `npub1${string}`, 90);
    if (decoded.prefix !== 'npub') throw new Error('not an npub');
    const bytes = Uint8Array.from(bech32.fromWords(decoded.words));
    if (bytes.length !== 32) throw new Error('npub payload is not 32 bytes');
    return toHex(bytes);
}

/**
 * Verify a Binding Attestation envelope per SPEC-BINDING §7. Pure and
 * offline — no network, no trusted party. Returns `binding_ok` only when
 * both signatures verify and cover the byte-identical canonical message.
 */
export function verifyBinding(envelope: BindingEnvelope): BindingVerifyResult {
    const fail = (status: Exclude<BindingStatus, 'binding_ok'>): BindingVerifyResult => ({
        valid: false,
        status,
    });

    try {
        const msg = envelope.message;
        if (typeof msg !== 'string' || msg.length === 0) return fail('malformed');

        /* 1 — PARSE */
        const lines = msg.split('\n');
        // Header first — it is THE discriminator between the three OC
        // Attest wire formats. A v0 attestation or an auth challenge MUST
        // fail here, ahead of any structural check, so the three formats
        // can never cross-verify (SPEC-BINDING §3.4).
        if ((lines[0] ?? '') !== HEADER) return fail('bad_header');
        // The message ends with exactly one LF, so the final split element
        // MUST be empty and there MUST be >= 8 core lines before it.
        if (lines.length < 9 || lines[lines.length - 1] !== '') return fail('malformed');
        const body = lines.slice(0, -1);
        if (body.length < 8) return fail('malformed');

        if (body[1] !== 'v: 1') return fail('malformed');
        if (body[7] !== `ack: ${ACK}`) return fail('bad_ack');

        const principal = linePrefix(body[2], 'principal: ');
        const btc = linePrefix(body[3], 'btc: ');
        const nostr = linePrefix(body[4], 'nostr: ');
        const nonce = linePrefix(body[5], 'nonce: ');
        const issuedAt = linePrefix(body[6], 'issued_at: ');
        if (
            principal == null ||
            btc == null ||
            nostr == null ||
            nonce == null ||
            issuedAt == null
        ) {
            return fail('malformed');
        }

        for (const value of [principal, btc, nostr, nonce, issuedAt]) {
            for (let i = 0; i < value.length; i++) {
                const c = value.charCodeAt(i);
                if (c < 0x20 || c > 0x7e) return fail('malformed');
            }
        }
        if (!/^did:oc:[0-9a-f]{32}$/.test(principal)) return fail('bad_principal');
        if (!/^[0-9a-f]{32}$/.test(nonce)) return fail('malformed');

        // Extensions: each `key: value`, keys lowercase ASCII + strictly
        // ascending (lexicographic). Anything else is malformed/unsorted.
        const ext: Record<string, string> = {};
        let prevKey = '';
        for (const line of body.slice(8)) {
            const idx = line.indexOf(': ');
            if (idx <= 0) return fail('malformed');
            const key = line.slice(0, idx);
            const value = line.slice(idx + 2);
            if (!/^[a-z]+$/.test(key)) return fail('malformed');
            if (key <= prevKey) return fail('ext_unsorted');
            prevKey = key;
            ext[key] = value;
        }

        /* 2 — ID */
        const bid = bindingId(msg);
        if (envelope.binding_id && envelope.binding_id.toLowerCase() !== bid) {
            return fail('id_mismatch');
        }

        /* 3 — FIELD CONSISTENCY */
        if (envelope.btc && envelope.btc !== btc) return fail('field_mismatch');
        if (envelope.nostr && envelope.nostr !== nostr) return fail('field_mismatch');
        if (envelope.principal && envelope.principal !== principal) return fail('field_mismatch');

        /* 4 — EXPIRY */
        if (ext.expires) {
            const t = Date.parse(ext.expires);
            if (!Number.isNaN(t) && Date.now() > t) return fail('expired');
        }

        /* 5 — BTC SIGNATURE (root proof) */
        if (typeof envelope.btc_signature !== 'string' || !envelope.btc_signature) {
            return fail('btc_sig_invalid');
        }
        const scheme = envelope.btc_scheme ?? 'bip322';
        let btcOk = false;
        try {
            if (scheme === 'bip322') {
                btcOk = Verifier.verifySignature(btc, msg, envelope.btc_signature);
            } else if (scheme === 'legacy') {
                btcOk = bitcoinMessage.verify(msg, btc, envelope.btc_signature);
            } else {
                return fail('bad_scheme');
            }
        } catch {
            btcOk = false;
        }
        if (!btcOk) return fail('btc_sig_invalid');

        /* 6 — NOSTR SIGNATURE (counter-signature) */
        const ev = envelope.nostr_event;
        if (!ev || ev.kind !== BINDING_KIND || typeof ev.id !== 'string') return fail('malformed');
        if (nostrEventId(ev) !== ev.id.toLowerCase()) return fail('nostr_id_invalid');
        let nostrSigOk = false;
        try {
            nostrSigOk = schnorr.verify(fromHex(ev.sig), fromHex(ev.id), fromHex(ev.pubkey));
        } catch {
            nostrSigOk = false;
        }
        if (!nostrSigOk) return fail('nostr_sig_invalid');
        let nostrXOnly: string;
        try {
            nostrXOnly = npubToXOnlyHex(nostr);
        } catch {
            return fail('nostr_key_mismatch');
        }
        if (nostrXOnly !== ev.pubkey.toLowerCase()) return fail('nostr_key_mismatch');

        /* 7 — SINGLE-MESSAGE RULE */
        let content: { message?: unknown; btc_signature?: unknown };
        try {
            content = JSON.parse(ev.content) as typeof content;
        } catch {
            return fail('message_mismatch');
        }
        if (content.message !== msg) return fail('message_mismatch');
        if (content.btc_signature !== envelope.btc_signature) return fail('message_mismatch');

        /* 8 — RESULT */
        return { valid: true, status: 'binding_ok', binding_id: bid, principal, btc, nostr };
    } catch {
        return fail('malformed');
    }
}
