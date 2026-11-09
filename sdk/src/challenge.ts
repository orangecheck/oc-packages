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

import { verifySignature as verifyBitcoinSignature } from '@orangecheck/bip322';

import { EXTENSION_KEY } from './canonical';
import { checkChallengeOptions } from './options';
import { signatureScheme, toBase64Maybe } from './utils/signature';

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

/** A challenge time as written: UTC, whole seconds, a year from 0000 to 9999. */
const CHALLENGE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;

/** What no value holds: a C0 control, DEL, NEL, or a line or paragraph separator (SPEC A.1). */
const NOT_IN_A_VALUE = /[\x00-\x1f\x7f\x85\u2028\u2029]/;

const CORE_KEYS = ['address', 'nonce', 'issued_at', 'expires_at', 'ack'] as const;

interface ChallengeFields {
    address: string;
    nonce: string;
    issuedAt: Date;
    expiresAt: Date;
    ack: string;
    extensions: Array<[string, string]>;
}

/** The one text a challenge has: core lines in order, then extensions sorted by key, LF-ended. */
function challengeText(f: ChallengeFields): string {
    const extensions = [...f.extensions].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    const lines = [
        AUTH_HEADER,
        `address: ${f.address}`,
        `nonce: ${f.nonce}`,
        `issued_at: ${iso(f.issuedAt)}`,
        `expires_at: ${iso(f.expiresAt)}`,
        `ack: ${f.ack}`,
        ...extensions.map(([k, v]) => `${k}: ${v}`),
    ];
    return lines.join('\n') + '\n';
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
    checkChallengeOptions(opts);
    const now = opts.now ?? new Date();
    const ttl = opts.ttlSeconds ?? 300;
    const expiresAt = new Date(now.getTime() + ttl * 1000);
    const nonce = opts.nonce ?? randomNonce();

    if (!/^[0-9a-f]{32}$/.test(nonce)) {
        throw new Error('nonce must be 32 lowercase hex characters');
    }
    for (const [name, value] of [
        ['address', opts.address],
        ['audience', opts.audience],
        ['purpose', opts.purpose],
    ] as const) {
        if (value !== undefined && NOT_IN_A_VALUE.test(value)) {
            throw new Error(`${name} must be one line, with no control character or line separator`);
        }
    }
    if (!CHALLENGE_TIME.test(iso(now)) || !CHALLENGE_TIME.test(iso(expiresAt))) {
        throw new Error('issued_at and expires_at must fall in the years 0000 to 9999');
    }

    const extensions: Array<[string, string]> = [];
    if (opts.audience) extensions.push(['audience', opts.audience]);
    if (opts.purpose) extensions.push(['purpose', opts.purpose]);
    const message = challengeText({
        address: opts.address,
        nonce,
        issuedAt: now,
        expiresAt,
        ack: AUTH_ACK,
        extensions,
    });

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

/**
 * Read a challenge in its one canonical text (SPEC Appendix A.1): the header, the five core lines
 * in order, then extensions with lowercase keys in strictly ascending order, each with a value,
 * LF-ended, no value holding a control character or line separator, and the times as issueChallenge
 * writes them, with four-digit years. That text without its final LF (a shell's
 * command substitution drops it) reads the same. Anything else throws, however validly signed, so
 * no two readers can take different values from the same signed text.
 */
function parseChallenge(message: string): ParsedChallenge {
    const text = message.endsWith('\n') ? message : message + '\n';
    const [header, ...rest] = text.slice(0, -1).split('\n');
    if (header !== AUTH_HEADER) {
        throw new Error('not an orangecheck-auth challenge');
    }

    const fields: Array<[string, string]> = [];
    for (const line of rest) {
        const at = line.indexOf(': ');
        if (at < 1) throw new Error('challenge line is not "key: value"');
        // The value is every byte after the first ": ", untrimmed.
        const value = line.slice(at + 2);
        if (NOT_IN_A_VALUE.test(value)) {
            throw new Error('challenge value holds a control character or line separator');
        }
        fields.push([line.slice(0, at), value]);
    }
    if (fields.length < CORE_KEYS.length || CORE_KEYS.some((key, i) => fields[i]![0] !== key)) {
        throw new Error('challenge core lines are missing, repeated or out of order');
    }
    const core = Object.fromEntries(fields.slice(0, CORE_KEYS.length)) as Record<
        (typeof CORE_KEYS)[number],
        string
    >;
    const extensions = fields.slice(CORE_KEYS.length);
    let previous = '';
    for (const [key, value] of extensions) {
        const isCore = (CORE_KEYS as readonly string[]).includes(key);
        if (!EXTENSION_KEY.test(key) || key <= previous || isCore || !value) {
            throw new Error(`challenge extension is not in canonical form: ${key}`);
        }
        previous = key;
    }
    // Date also reads extended years (+010000-...), which the rebuild below would write back.
    if (!CHALLENGE_TIME.test(core.issued_at) || !CHALLENGE_TIME.test(core.expires_at)) {
        throw new Error('challenge times are not YYYY-MM-DDTHH:MM:SSZ');
    }

    const fieldsRead = {
        address: core.address,
        nonce: core.nonce,
        issuedAt: new Date(core.issued_at),
        expiresAt: new Date(core.expires_at),
        ack: core.ack,
        extensions,
    };
    // The text must be the one these fields write, which also pins how the times are spelled.
    if (challengeText(fieldsRead) !== text) {
        throw new Error('challenge is not in canonical form');
    }
    return {
        ...fieldsRead,
        audience: extensions.find(([key]) => key === 'audience')?.[1],
        purpose: extensions.find(([key]) => key === 'purpose')?.[1],
    };
}

export interface VerifyChallengeOptions {
    /** The signed canonical challenge text, exactly as issued. */
    message: string;
    /** BIP-322 or legacy signature, base64 or hex. */
    signature: string;
    /** @deprecated Ignored: the signature's own bytes decide the scheme. */
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
    /** Present on success — the scheme that verified the signature. */
    scheme?: Scheme;
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

    const sigBase64 = toBase64Maybe(opts.signature);
    const scheme = signatureScheme(sigBase64);
    if (!scheme) return { ok: false, reason: 'sig_unsupported_scheme' };
    if (!verifyBitcoinSignature(address, opts.message, sigBase64)) {
        return { ok: false, reason: 'sig_invalid' };
    }

    return {
        ok: true,
        reason: 'ok',
        address,
        scheme,
        expiresAt: expiresAt.getTime(),
        nonce,
        ...(audience !== undefined ? { audience } : {}),
        ...(purpose !== undefined ? { purpose } : {}),
    };
}
