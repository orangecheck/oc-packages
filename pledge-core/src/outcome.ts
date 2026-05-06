// createOutcome() + verifyOutcome() — SPEC §4.

import { sha256 } from '@noble/hashes/sha256';

import {
    canonicalOutcomeMessage,
    canonicalOutcomeMessageBytes,
    computeOutcomeId,
    hexEncode,
    validateOutcomeInput,
} from './canonical.js';
import {
    ENVELOPE_VERSION,
    type CreateOutcomeInput,
    type OutcomeCanonicalInput,
    type OutcomeEnvelope,
    type PledgeErrorCode,
    type VerifyErr,
    type VerifyOutcomeInput,
    type VerifyOutcomeOk,
    type VerifyOutcomeResult,
} from './types.js';
import { PledgeError } from './pledge.js';

/**
 * SPEC §4.3 — does this outcome envelope require a BIP-322 signature?
 *
 * Discriminator is `resolved_by`, not `mechanism`. The five deterministic
 * mechanisms always have resolved_by="deterministic" and sig=null.
 * counterparty_signs normally has resolved_by=<counterparty.address> and a
 * signature — UNLESS the outcome is `expired_unresolved`, in which case the
 * verifier deterministically classifies the deadline passing without a
 * counterparty signature, so resolved_by="deterministic" and sig=null
 * (test vector v16 pins this nuance).
 */
export function outcomeRequiresSignature(input: { resolved_by: string }): boolean {
    return input.resolved_by !== 'deterministic';
}

/**
 * Build, validate, and (when required) sign an outcome envelope.
 *
 * For deterministic mechanisms (chain_state, nostr_event_exists,
 * stamp_published, http_get_hash, dns_record, vote_resolves), pass no signer
 * — the SDK leaves sig === null per §4.3.
 *
 * For counterparty_signs, pass the counterparty's signer (whose `address`
 * equals input.resolved_by). The signature commits to the lowercase hex of
 * the outcome id.
 */
export async function createOutcome(input: CreateOutcomeInput): Promise<OutcomeEnvelope> {
    const v = validateOutcomeInput(input);
    if (!v.ok) throw new PledgeError('E_OUTCOME_MALFORMED', v.reason);

    const requiresSig = outcomeRequiresSignature(input);

    if (requiresSig) {
        if (!input.signer) {
            throw new PledgeError(
                'E_OUTCOME_BAD_SIG',
                `resolved_by="${input.resolved_by}" requires a signer (only resolved_by="deterministic" outcomes leave sig=null)`,
            );
        }
        if (input.signer.address !== input.resolved_by) {
            throw new PledgeError(
                'E_OUTCOME_RESOLVER_UNAUTHORIZED',
                `signer.address (${input.signer.address}) must equal resolved_by (${input.resolved_by})`,
            );
        }
    }
    // Inverse case (resolved_by="deterministic", sig=null) is the default —
    // any of the five deterministic mechanisms or a counterparty_signs
    // expired_unresolved fall here. No additional gate needed; the SDK simply
    // emits sig=null below.

    const canon: OutcomeCanonicalInput = {
        pledge_id: input.pledge_id,
        outcome: input.outcome,
        resolved_at: input.resolved_at,
        resolved_by: input.resolved_by,
        evidence: input.evidence,
        dispute_window_ends_at: input.dispute_window_ends_at,
    };

    const id = computeOutcomeId(canon);

    const envelope: OutcomeEnvelope = {
        v: ENVELOPE_VERSION,
        kind: 'pledge-outcome',
        id,
        pledge_id: input.pledge_id,
        outcome: input.outcome,
        resolved_at: input.resolved_at,
        resolved_by: input.resolved_by,
        evidence: input.evidence,
        dispute_window_ends_at: input.dispute_window_ends_at,
        sig: null,
    };

    if (requiresSig) {
        const sigValue = await input.signer!.signMessage(id);
        envelope.sig = {
            alg: 'bip322',
            pubkey: input.signer!.address,
            value: sigValue,
        };
    }

    return envelope;
}

export async function verifyOutcome(input: VerifyOutcomeInput): Promise<VerifyOutcomeResult> {
    const env = input.envelope;

    if (env.v !== ENVELOPE_VERSION) {
        return err('E_UNSUPPORTED_VERSION', `outcome envelope v=${env.v} not supported`);
    }

    const shape = checkOutcomeShape(env);
    if (shape) return shape;

    const canon: OutcomeCanonicalInput = {
        pledge_id: env.pledge_id,
        outcome: env.outcome,
        resolved_at: env.resolved_at,
        resolved_by: env.resolved_by,
        evidence: env.evidence,
        dispute_window_ends_at: env.dispute_window_ends_at,
    };
    const fieldCheck = validateOutcomeInput(canon);
    if (!fieldCheck.ok) return err('E_OUTCOME_MALFORMED', fieldCheck.reason);

    const reconstructed = canonicalOutcomeMessage(canon);
    const reconstructedId = hexEncode(sha256(canonicalOutcomeMessageBytes(canon)));
    if (reconstructedId !== env.id) {
        return err(
            'E_OUTCOME_BAD_ID',
            `reconstructed id ${reconstructedId} != envelope.id ${env.id}`,
        );
    }

    // Signature requirement keys off resolved_by per SPEC §4.3 (see
    // outcomeRequiresSignature() for the nuance around expired_unresolved).
    const requiresSig = outcomeRequiresSignature(env);

    if (requiresSig) {
        if (!env.sig) {
            return err(
                'E_OUTCOME_BAD_SIG',
                `resolved_by="${env.resolved_by}" requires a signature but envelope.sig is null`,
            );
        }
        if (env.sig.pubkey !== env.resolved_by) {
            return err(
                'E_OUTCOME_RESOLVER_UNAUTHORIZED',
                `sig.pubkey (${env.sig.pubkey}) must equal resolved_by (${env.resolved_by})`,
            );
        }
        if (!input.skipSignatureVerification) {
            if (!input.verifyBip322) {
                return err('E_OUTCOME_BAD_SIG', 'no BIP-322 verifier supplied');
            }
            const ok = await input.verifyBip322(env.id, env.sig.value, env.sig.pubkey);
            if (!ok) return err('E_OUTCOME_BAD_SIG', 'BIP-322 signature did not verify');
        }
    } else {
        if (env.sig !== null) {
            return err(
                'E_OUTCOME_MALFORMED',
                'resolved_by="deterministic" outcomes MUST have envelope.sig = null',
            );
        }
    }

    const result: VerifyOutcomeOk = {
        ok: true,
        envelope: env,
        canonicalMessage: reconstructed,
        id: env.id,
    };
    return result;
}

function checkOutcomeShape(env: OutcomeEnvelope): VerifyErr | null {
    if (env.kind !== 'pledge-outcome') {
        return err('E_OUTCOME_MALFORMED', 'envelope.kind must be "pledge-outcome"');
    }
    if (typeof env.id !== 'string' || !/^[0-9a-f]{64}$/.test(env.id)) {
        return err('E_OUTCOME_MALFORMED', 'envelope.id must be 64 lowercase hex chars');
    }
    if (typeof env.pledge_id !== 'string' || !/^[0-9a-f]{64}$/.test(env.pledge_id)) {
        return err('E_OUTCOME_MALFORMED', 'envelope.pledge_id must be 64 lowercase hex chars');
    }
    if (!env.evidence || typeof env.evidence.mechanism !== 'string') {
        return err('E_OUTCOME_MALFORMED', 'envelope.evidence invalid');
    }
    return null;
}

function err(code: PledgeErrorCode, message: string): VerifyErr {
    return { ok: false, code, message };
}
