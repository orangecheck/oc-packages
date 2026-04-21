/**
 * Signed-challenge auth
 *
 * When a gate can't trust the address source (public header, query string,
 * unsigned cookie), run a one-shot BIP-322 challenge first to cryptographically
 * prove the caller controls the address. Bind the proven address to a session
 * cookie or JWT, and the gate reads from there.
 *
 * This is a different wire format from the main OCP attestation — the header
 * literal is `orangecheck-auth`, not `orangecheck`, so a signed auth challenge
 * can never be confused with a reputation attestation.
 *
 *   // Server, on the "connect wallet" flow:
 *   const challenge = issueChallenge({ address, ttlSeconds: 300 });
 *   // → send challenge.message to the client
 *
 *   // Client signs challenge.message with BIP-322 via the user's wallet,
 *   // then posts { message, signature } back.
 *
 *   // Server, on callback:
 *   const result = await verifyChallenge({ message, signature });
 *   if (result.ok) {
 *     // result.address is now cryptographically proven; attach to session.
 *   }
 */

import type { Scheme } from './types';

import { Buffer } from 'buffer';

import { Verifier } from 'bip322-js';
import * as bitcoinMessage from 'bitcoinjs-message';

const AUTH_HEADER = 'orangecheck-auth';
const AUTH_ACK = 'I authorize this session under the OrangeCheck auth challenge.';

function randomNonce(): string {
    // 16 bytes → 32 lowercase hex chars. Matches OCP core nonce format.
    const bytes = new Uint8Array(16);
    // Runtimes: Node 20+ (webcrypto), browsers.
    if (typeof globalThis.crypto?.getRandomValues === 'function') {
        globalThis.crypto.getRandomValues(bytes);
    } else {
        // Fallback: Math.random is *not* cryptographic — acceptable only for
        // environments without webcrypto (old Node). Flagged explicitly.
        for (let i = 0; i < bytes.length; i++) bytes[i] = Math.floor(Math.random() * 256);
    }
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function iso(date: Date): string {
    return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

export interface IssueChallengeOptions {
    /** Bitcoin address the caller claims to control. */
    address: string;
    /** How long the challenge is valid for. Default 300 (5 minutes). */
    ttlSeconds?: number;
    /** Explicit nonce. Rare; prefer auto-generated. */
    nonce?: string;
    /** Origin-binding extension. If set, verify will require a match. */
    audience?: string;
    /** Human-readable label baked into the signed message. */
    purpose?: string;
    /** Freeze `now` for tests. */
    now?: Date;
}

export interface Challenge {
    /** The canonical text the client MUST sign. */
    message: string;
    /** The generated nonce (kept for correlation / server-side storage). */
    nonce: string;
    /** Unix ms epoch the challenge expires at. */
    expiresAt: number;
    /** ISO string of the same. */
    expiresAtIso: string;
}

/**
 * Build a new signed-challenge message. The server MUST remember the nonce
 * it issued against the session (Redis, signed cookie, DB) so it can detect
 * replay or a different nonce coming back on verify.
 */
export function issueChallenge(opts: IssueChallengeOptions): Challenge {
    const now = opts.now ?? new Date();
    const ttl = opts.ttlSeconds ?? 300;
    const expiresAt = new Date(now.getTime() + ttl * 1000);
    const nonce = opts.nonce ?? randomNonce();

    if (!/^[0-9a-f]{32}$/.test(nonce)) {
        throw new Error('nonce must be 32 lowercase hex characters');
    }

    const coreLines = [
        AUTH_HEADER,
        `address: ${opts.address}`,
        `nonce: ${nonce}`,
        `issued_at: ${iso(now)}`,
        `expires_at: ${iso(expiresAt)}`,
        `ack: ${AUTH_ACK}`,
    ];

    const extensions: Array<[string, string]> = [];
    if (opts.audience) extensions.push(['audience', opts.audience]);
    if (opts.purpose) extensions.push(['purpose', opts.purpose]);
    // Lexicographic sort by key — matches OCP canonicalization rules.
    extensions.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

    const extLines = extensions.map(([k, v]) => `${k}: ${v}`);
    const message = [...coreLines, ...extLines].join('\n') + '\n';

    return {
        message,
        nonce,
        expiresAt: expiresAt.getTime(),
        expiresAtIso: iso(expiresAt),
    };
}

interface ParsedChallenge {
    address?: string;
    nonce?: string;
    issuedAt?: Date;
    expiresAt?: Date;
    ack?: string;
    audience?: string;
    purpose?: string;
    extensions: Array<[string, string]>;
}

function parseChallenge(message: string): ParsedChallenge {
    const lines = message.endsWith('\n') ? message.slice(0, -1).split('\n') : message.split('\n');

    if (lines[0] !== AUTH_HEADER) {
        throw new Error('not an orangecheck-auth challenge');
    }

    const out: ParsedChallenge = { extensions: [] };
    const coreKeys = new Set(['address', 'nonce', 'issued_at', 'expires_at', 'ack']);
    let seenCore = 0;

    for (let i = 1; i < lines.length; i++) {
        const line = lines[i] ?? '';
        const sep = line.indexOf(': ');
        if (sep === -1) continue;
        const key = line.slice(0, sep);
        const val = line.slice(sep + 2);

        if (coreKeys.has(key)) {
            seenCore++;
            if (key === 'address') out.address = val;
            else if (key === 'nonce') out.nonce = val;
            else if (key === 'issued_at') out.issuedAt = new Date(val);
            else if (key === 'expires_at') out.expiresAt = new Date(val);
            else if (key === 'ack') out.ack = val;
        } else {
            out.extensions.push([key, val]);
            if (key === 'audience') out.audience = val;
            if (key === 'purpose') out.purpose = val;
        }
    }

    if (seenCore !== 5) {
        throw new Error(`challenge missing core lines (${seenCore}/5)`);
    }
    return out;
}

export interface VerifyChallengeOptions {
    /** The signed canonical challenge text, exactly as issued. */
    message: string;
    /** BIP-322 or legacy signature. */
    signature: string;
    /** Scheme override. Default 'bip322'. */
    scheme?: Scheme;

    /** If set, require the challenge's `audience:` extension to match. */
    expectedAudience?: string;
    /** If set, require the challenge's `purpose:` extension to match. */
    expectedPurpose?: string;
    /**
     * If set, require the challenge's `nonce:` to match. Use this to defeat
     * replay — pair with server-side nonce storage (Redis / signed cookie).
     */
    expectedNonce?: string;

    /** Tolerance on expiry check in ms. Default 0. */
    clockSkewMs?: number;
    /** Freeze `now` for tests. */
    now?: Date;
}

export type VerifyChallengeReason =
    | 'ok'
    | 'malformed'
    | 'expired'
    | 'not_yet_valid'
    | 'sig_invalid'
    | 'sig_unsupported_scheme'
    | 'audience_mismatch'
    | 'purpose_mismatch'
    | 'nonce_mismatch';

export interface VerifyChallengeResult {
    ok: boolean;
    reason: VerifyChallengeReason;
    /** Present on success — the cryptographically proven Bitcoin address. */
    address?: string;
    /** Present on success — when the challenge expires (unix ms). */
    expiresAt?: number;
    /** Present on success — the nonce from the challenge. */
    nonce?: string;
    /** Present on success — the audience extension, if any. */
    audience?: string;
    /** Present on success — the purpose extension, if any. */
    purpose?: string;
}

/**
 * Verify a signed challenge. Returns the proven address on success.
 *
 * The caller is responsible for nonce replay prevention — pass `expectedNonce`
 * with the value you stashed at issue time.
 */
export async function verifyChallenge(
    opts: VerifyChallengeOptions
): Promise<VerifyChallengeResult> {
    let parsed: ParsedChallenge;
    try {
        parsed = parseChallenge(opts.message);
    } catch {
        return { ok: false, reason: 'malformed' };
    }

    const { address, nonce, issuedAt, expiresAt, ack, audience, purpose } = parsed;
    if (!address || !nonce || !issuedAt || !expiresAt || !ack) {
        return { ok: false, reason: 'malformed' };
    }
    if (ack !== AUTH_ACK) {
        return { ok: false, reason: 'malformed' };
    }
    if (!/^[0-9a-f]{32}$/.test(nonce)) {
        return { ok: false, reason: 'malformed' };
    }

    const now = opts.now ?? new Date();
    const skew = opts.clockSkewMs ?? 0;

    if (now.getTime() - skew > expiresAt.getTime()) {
        return { ok: false, reason: 'expired' };
    }
    if (now.getTime() + skew < issuedAt.getTime()) {
        return { ok: false, reason: 'not_yet_valid' };
    }

    if (opts.expectedNonce && nonce !== opts.expectedNonce) {
        return { ok: false, reason: 'nonce_mismatch' };
    }
    if (opts.expectedAudience && audience !== opts.expectedAudience) {
        return { ok: false, reason: 'audience_mismatch' };
    }
    if (opts.expectedPurpose && purpose !== opts.expectedPurpose) {
        return { ok: false, reason: 'purpose_mismatch' };
    }

    const scheme: Scheme = opts.scheme ?? 'bip322';
    let sigValid = false;

    try {
        if (scheme === 'bip322') {
            const sigBase64 =
                /^[0-9a-fA-F]+$/.test(opts.signature) && opts.signature.length % 2 === 0
                    ? Buffer.from(opts.signature, 'hex').toString('base64')
                    : opts.signature;
            sigValid = Verifier.verifySignature(address, opts.message, sigBase64);
        } else if (scheme === 'legacy') {
            // Legacy signmessage only works for P2PKH addresses.
            if (!/^[1m][a-km-zA-HJ-NP-Z1-9]{25,34}$/.test(address)) {
                return { ok: false, reason: 'sig_unsupported_scheme' };
            }
            sigValid = bitcoinMessage.verify(opts.message, address, opts.signature);
        } else {
            return { ok: false, reason: 'sig_unsupported_scheme' };
        }
    } catch {
        sigValid = false;
    }

    if (!sigValid) return { ok: false, reason: 'sig_invalid' };

    return {
        ok: true,
        reason: 'ok',
        address,
        expiresAt: expiresAt.getTime(),
        nonce,
        ...(audience !== undefined ? { audience } : {}),
        ...(purpose !== undefined ? { purpose } : {}),
    };
}
