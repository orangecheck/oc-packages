// stamp() and verify() — reference implementation of OC Stamp v1. SPEC §4, §8.

import { sha256 } from '@noble/hashes/sha256';

import {
    canonicalMessage,
    canonicalMessageBytes,
    computeEnvelopeId,
    hexEncode,
    isSignedAt,
    validateCanonicalInput,
} from './canonical.js';
import {
    ENVELOPE_VERSION,
    type StampEnvelope,
    type StampInput,
    type VerifyErrorCode,
    type VerifyInput,
    type VerifyOk,
    type VerifyResult,
} from './types.js';

/**
 * Compute `{hash, length}` for raw bytes. Convenience over the common
 * `sha256(bytes)` pattern that prefixes with `sha256:` and returns lowercase
 * hex. Pass the result to `stamp({ content: hashContent(bytes), mime })` when
 * you don't want stamp() to hash the bytes itself.
 */
export function hashContent(bytes: Uint8Array): { hash: string; length: number } {
    return {
        hash: 'sha256:' + hexEncode(sha256(bytes)),
        length: bytes.byteLength,
    };
}

export class StampError extends Error {
    code: VerifyErrorCode;
    constructor(code: VerifyErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = 'StampError';
    }
}

/**
 * Build and sign a stamp envelope. Returns the envelope with sig populated but
 * ots left null — OTS calendar submission is a separate step (see
 * @orangecheck/stamp-ots).
 */
export async function stamp(input: StampInput): Promise<StampEnvelope> {
    // Resolve content hash + length. Two modes: raw bytes (we hash) or
    // pre-computed {hash, length} (we trust the caller).
    let contentHash: string;
    let contentLength: number;
    if (input.content instanceof Uint8Array) {
        contentHash = 'sha256:' + hexEncode(sha256(input.content));
        contentLength = input.content.byteLength;
    } else {
        // Pre-computed. Caller must have used SHA-256 and declared length correctly.
        // Guard against the easy typos.
        const h = input.content.hash;
        if (!h.startsWith('sha256:') || h.length !== 'sha256:'.length + 64) {
            throw new StampError(
                'E_MALFORMED',
                'content.hash must be "sha256:" + 64 lowercase hex chars'
            );
        }
        contentHash = h;
        contentLength = input.content.length;
        if (!Number.isInteger(contentLength) || contentLength < 0) {
            throw new StampError('E_MALFORMED', 'content.length must be a non-negative integer');
        }
    }

    const signedAt = signedAtOf(input.signedAt);

    const canon = {
        address: input.signer.address,
        content_hash: contentHash,
        content_length: contentLength,
        content_mime: input.mime,
        signed_at: signedAt,
    };

    const v = validateCanonicalInput(canon);
    if (!v.ok) {
        // Validation rejects inputs that would silently break canonical-message
        // reconstructability downstream (whitespace in address, wrong hash
        // prefix, floats in length, etc.). Catching them here prevents a
        // signed envelope that no verifier can accept.
        throw new StampError('E_MALFORMED', v.reason);
    }

    const id = computeEnvelopeId(canon);

    // BIP-322 signs the ASCII hex representation of id. Hex is chosen (not
    // raw bytes) so wallets that render the signed message to the user show
    // something legible. The id itself commits to every field in the canonical
    // message so this is a transitive commitment to the full signing ceremony.
    const sigValue = await input.signer.signMessage(id);

    const envelope: StampEnvelope = {
        v: ENVELOPE_VERSION,
        kind: 'stamp',
        id,
        content: {
            hash: contentHash,
            length: contentLength,
            mime: input.mime,
            ref: input.ref ?? null,
        },
        signer: {
            address: input.signer.address,
            alg: 'bip322',
        },
        signed_at: signedAt,
        stake: input.stake ?? null,
        ots: null,
        sig: {
            alg: 'bip322',
            pubkey: input.signer.address,
            value: sigValue,
        },
    };

    return envelope;
}

/**
 * Verify a stamp envelope. See SPEC §8 for the full algorithm. Returns a
 * structured result; callers can match on `result.ok` and drill into
 * `result.code` for the specific failure.
 */
export async function verify(input: VerifyInput): Promise<VerifyResult> {
    const env = input.envelope;

    // 1. Version check.
    if (env.v !== ENVELOPE_VERSION) {
        return err('E_UNSUPPORTED_VERSION', `envelope version ${env.v} not supported by this implementation`);
    }

    // 2. Shape check.
    const shape = checkShape(env);
    if (shape) return shape;

    // 3. Canonical message reconstruction + id check.
    const canon = {
        address: env.signer.address,
        content_hash: env.content.hash,
        content_length: env.content.length,
        content_mime: env.content.mime,
        signed_at: env.signed_at,
    };
    const reconstructedMessage = canonicalMessage(canon);
    const reconstructedId = hexEncode(sha256(canonicalMessageBytes(canon)));
    if (reconstructedId !== env.id) {
        return err('E_BAD_ID', `reconstructed id (${reconstructedId}) does not match envelope.id (${env.id})`);
    }

    // 4. Signature verify.
    if (!input.skipSignatureVerification) {
        if (!input.verifyBip322) {
            return err('E_BAD_SIG', 'no BIP-322 verifier supplied');
        }
        const ok = await input.verifyBip322(env.id, env.sig.value, env.signer.address);
        if (!ok) return err('E_BAD_SIG', 'BIP-322 signature did not verify');
    }

    // 5. Anchor verify.
    let anchor: VerifyOk['anchor'];
    if (env.ots === null) {
        anchor = { status: 'none' };
    } else if (env.ots.status === 'pending') {
        anchor = { status: 'pending' };
    } else {
        // confirmed
        const h = env.ots.block_height;
        const hash = env.ots.block_hash;
        if (h === null || hash === null) {
            return err('E_BAD_ANCHOR', 'confirmed OTS proof missing block_height or block_hash');
        }
        if (input.verifyOtsAnchor) {
            let verified: boolean | null;
            let reason = '';
            try {
                verified = await input.verifyOtsAnchor(env.ots.proof, h, hash, env.id);
            } catch (e) {
                // A check that could not be made is not a failed one: no header was read.
                verified = null;
                reason = e instanceof Error ? e.message : String(e);
            }
            if (verified === null) {
                anchor = { status: 'unchecked', blockHeight: h, blockHash: hash, verified: false, reason };
            } else if (!verified) {
                return err('E_BAD_ANCHOR', 'OTS proof did not chain to declared Bitcoin block header');
            } else {
                anchor = { status: 'confirmed', blockHeight: h, blockHash: hash, verified: true };
            }
        } else {
            // The ots block is outside the signature: without a walk, the block is a claim.
            anchor = { status: 'claimed', blockHeight: h, blockHash: hash, verified: false };
        }
    }

    // 6. Content bytes check (if supplied).
    if (input.content) {
        const actualHash = 'sha256:' + hexEncode(sha256(input.content));
        if (actualHash !== env.content.hash) {
            return err('E_BAD_CONTENT', `content hash (${actualHash}) does not match envelope.content.hash (${env.content.hash})`);
        }
    }

    return {
        ok: true,
        envelope: env,
        canonicalMessage: reconstructedMessage,
        id: env.id,
        anchor,
    };
}

// ─────────────────────────────────────────────────────────────────────────────

function checkShape(env: StampEnvelope): VerifyResult | null {
    if (env.kind !== 'stamp') return err('E_MALFORMED', 'envelope.kind must be "stamp"');
    if (!env.id || typeof env.id !== 'string' || !/^[0-9a-f]{64}$/.test(env.id)) {
        return err('E_MALFORMED', 'envelope.id must be 64 lowercase hex chars');
    }
    if (!env.content || typeof env.content.hash !== 'string' || !env.content.hash.startsWith('sha256:')) {
        return err('E_MALFORMED', 'envelope.content.hash must start with "sha256:"');
    }
    if (!Number.isInteger(env.content.length) || env.content.length < 0) {
        return err('E_MALFORMED', 'envelope.content.length must be a non-negative integer');
    }
    if (typeof env.content.mime !== 'string' || env.content.mime.length === 0) {
        return err('E_MALFORMED', 'envelope.content.mime must be a non-empty string');
    }
    if (!env.signer || typeof env.signer.address !== 'string' || env.signer.alg !== 'bip322') {
        return err('E_MALFORMED', 'envelope.signer invalid');
    }
    if (env.signer.address !== env.sig.pubkey) {
        return err('E_MALFORMED', 'envelope.signer.address must equal envelope.sig.pubkey');
    }
    if (typeof env.signed_at !== 'string' || !isSignedAt(env.signed_at)) {
        return err(
            'E_MALFORMED',
            'envelope.signed_at must be YYYY-MM-DDTHH:MM:SSZ or YYYY-MM-DDTHH:MM:SS.sssZ (SPEC §0)'
        );
    }
    if (!env.sig || env.sig.alg !== 'bip322' || typeof env.sig.value !== 'string') {
        return err('E_MALFORMED', 'envelope.sig invalid');
    }
    return null;
}

function err(code: VerifyErrorCode, message: string): VerifyResult {
    return { ok: false, code, message };
}

// signed_at as given, never rounded: a Date keeps its milliseconds (written
// without them only when they are zero), and a string is used exactly as
// written once validateCanonicalInput accepts it.
function signedAtOf(value: Date | string | undefined): string {
    const date = value ?? new Date();
    if (date instanceof Date) {
        if (Number.isNaN(date.getTime())) throw new StampError('E_MALFORMED', 'signedAt is an invalid Date');
        return date.toISOString().replace(/\.000Z$/, 'Z');
    }
    if (typeof date === 'string') return date;
    throw new StampError('E_MALFORMED', 'signedAt must be a Date or a SPEC §0 timestamp string');
}
