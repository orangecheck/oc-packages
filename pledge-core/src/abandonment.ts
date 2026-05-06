// createAbandonment() + verifyAbandonment() — SPEC §5.

import { sha256 } from '@noble/hashes/sha256';

import {
    canonicalAbandonmentMessage,
    canonicalAbandonmentMessageBytes,
    computeAbandonmentId,
    hexEncode,
    validateAbandonmentInput,
} from './canonical.js';
import {
    ENVELOPE_VERSION,
    type AbandonmentCanonicalInput,
    type AbandonmentEnvelope,
    type CreateAbandonmentInput,
    type PledgeErrorCode,
    type VerifyAbandonmentInput,
    type VerifyAbandonmentOk,
    type VerifyAbandonmentResult,
    type VerifyErr,
} from './types.js';
import { PledgeError } from './pledge.js';

/**
 * Build, validate, and sign an abandonment envelope.
 *
 * SPEC §5: abandonment counts as `broken` in the public ledger. Agents MUST
 * NOT publish abandonments in v0.1 — only the original swearer (principal)
 * may sign. The SDK enforces this by requiring `swearerSigner.address` to
 * equal the address that signed the original pledge, but it cannot verify
 * cross-envelope reference here (the original pledge isn't an input). Callers
 * MUST cross-check against the referenced pledge before relying on the
 * resulting envelope.
 */
export async function createAbandonment(
    input: CreateAbandonmentInput,
): Promise<AbandonmentEnvelope> {
    const v = validateAbandonmentInput(input);
    if (!v.ok) throw new PledgeError('E_ABANDONMENT_MALFORMED', v.reason);

    const canon: AbandonmentCanonicalInput = {
        pledge_id: input.pledge_id,
        abandoned_at: input.abandoned_at,
        reason: input.reason,
    };

    const id = computeAbandonmentId(canon);
    const sigValue = await input.swearerSigner.signMessage(id);

    return {
        v: ENVELOPE_VERSION,
        kind: 'pledge-abandonment',
        id,
        pledge_id: input.pledge_id,
        abandoned_at: input.abandoned_at,
        reason: input.reason,
        sig: {
            alg: 'bip322',
            pubkey: input.swearerSigner.address,
            value: sigValue,
        },
    };
}

export async function verifyAbandonment(
    input: VerifyAbandonmentInput,
): Promise<VerifyAbandonmentResult> {
    const env = input.envelope;

    if (env.v !== ENVELOPE_VERSION) {
        return err('E_UNSUPPORTED_VERSION', `abandonment envelope v=${env.v} not supported`);
    }

    const shape = checkAbandonmentShape(env);
    if (shape) return shape;

    const canon: AbandonmentCanonicalInput = {
        pledge_id: env.pledge_id,
        abandoned_at: env.abandoned_at,
        reason: env.reason,
    };
    const fieldCheck = validateAbandonmentInput(canon);
    if (!fieldCheck.ok) return err('E_ABANDONMENT_MALFORMED', fieldCheck.reason);

    const reconstructed = canonicalAbandonmentMessage(canon);
    const reconstructedId = hexEncode(sha256(canonicalAbandonmentMessageBytes(canon)));
    if (reconstructedId !== env.id) {
        return err(
            'E_ABANDONMENT_BAD_ID',
            `reconstructed id ${reconstructedId} != envelope.id ${env.id}`,
        );
    }

    if (!input.skipSignatureVerification) {
        if (!input.verifyBip322) {
            return err('E_ABANDONMENT_BAD_SIG', 'no BIP-322 verifier supplied');
        }
        const ok = await input.verifyBip322(env.id, env.sig.value, env.sig.pubkey);
        if (!ok) return err('E_ABANDONMENT_BAD_SIG', 'BIP-322 signature did not verify');
    }

    const result: VerifyAbandonmentOk = {
        ok: true,
        envelope: env,
        canonicalMessage: reconstructed,
        id: env.id,
    };
    return result;
}

function checkAbandonmentShape(env: AbandonmentEnvelope): VerifyErr | null {
    if (env.kind !== 'pledge-abandonment') {
        return err('E_ABANDONMENT_MALFORMED', 'envelope.kind must be "pledge-abandonment"');
    }
    if (typeof env.id !== 'string' || !/^[0-9a-f]{64}$/.test(env.id)) {
        return err('E_ABANDONMENT_MALFORMED', 'envelope.id must be 64 lowercase hex chars');
    }
    if (typeof env.pledge_id !== 'string' || !/^[0-9a-f]{64}$/.test(env.pledge_id)) {
        return err(
            'E_ABANDONMENT_MALFORMED',
            'envelope.pledge_id must be 64 lowercase hex chars',
        );
    }
    if (!env.sig || env.sig.alg !== 'bip322' || typeof env.sig.value !== 'string') {
        return err('E_ABANDONMENT_MALFORMED', 'envelope.sig invalid');
    }
    return null;
}

function err(code: PledgeErrorCode, message: string): VerifyErr {
    return { ok: false, code, message };
}
