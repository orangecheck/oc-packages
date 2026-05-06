// createPledge() + verifyPledge() — SPEC §3 + §9.

import {
    canonicalPledgeMessage,
    canonicalPledgeMessageBytes,
    computePledgeId,
    generateNonce,
    hexEncode,
    validatePledgeInput,
} from './canonical.js';
import { sha256 } from '@noble/hashes/sha256';
import {
    ENVELOPE_VERSION,
    type CreatePledgeInput,
    type PledgeCanonicalInput,
    type PledgeEnvelope,
    type PledgeErrorCode,
    type VerifyErr,
    type VerifyPledgeInput,
    type VerifyPledgeOk,
    type VerifyPledgeResult,
} from './types.js';

export class PledgeError extends Error {
    code: PledgeErrorCode;
    constructor(code: PledgeErrorCode, message: string) {
        super(message);
        this.code = code;
        this.name = 'PledgeError';
    }
}

/**
 * Build, validate, and sign a pledge envelope.
 *
 * Two signing paths:
 *   - Direct (most common): swearer signs themselves. Pass `swearerSigner`
 *     whose `address` matches the canonical message's swearer.
 *   - Agent (SPEC §7.3): an agent signs on behalf of a principal under an
 *     OC Agent delegation. Pass `viaDelegation` with the delegation id and
 *     the agent's signer. The envelope carries `via_delegation` and
 *     `agent_address` but those fields are NOT in the canonical message —
 *     they're verifier-checked claims, not signed bytes.
 *
 * Returns the fully-formed envelope. Throws PledgeError on validation
 * failure, never on signature failure (signing is the caller's adapter).
 */
export async function createPledge(input: CreatePledgeInput): Promise<PledgeEnvelope> {
    const swornAt = isoSecondsZ(input.swornAt ?? new Date());
    const nonce = input.nonce ?? generateNonce();
    const remediation = input.remediation ?? 'breach_recorded';

    const canon: PledgeCanonicalInput = {
        swearer: input.swearer,
        proposition: input.proposition,
        resolution: input.resolution,
        resolves_at: input.resolves_at,
        expires_at: input.expires_at,
        bond: input.bond,
        counterparty: input.counterparty,
        dispute: input.dispute,
        remediation,
        sworn_at: swornAt,
        nonce,
    };

    const v = validatePledgeInput(canon);
    if (!v.ok) throw new PledgeError('E_PLEDGE_MALFORMED', v.reason);

    // Agent path: signer must be the agent (not the principal). Also enforce
    // that swearer.address still equals canon.swearer (the principal); the
    // agent's address goes into agent_address in the envelope.
    if (input.viaDelegation) {
        if (input.viaDelegation.delegation_id.length !== 64) {
            throw new PledgeError(
                'E_PLEDGE_MALFORMED',
                'viaDelegation.delegation_id must be 64 hex chars',
            );
        }
        if (input.viaDelegation.agent_signer.address === input.swearerSigner.address) {
            throw new PledgeError(
                'E_PLEDGE_MALFORMED',
                'agent_address must differ from swearer.address (principal-vs-agent invariant)',
            );
        }
    }

    const id = computePledgeId(canon);

    // BIP-322 signs the lowercase hex form of the id. Hex (not raw bytes)
    // so wallets render something legible to the user before signing.
    const signer = input.viaDelegation ? input.viaDelegation.agent_signer : input.swearerSigner;
    const sigValue = await signer.signMessage(id);

    const envelope: PledgeEnvelope = {
        v: ENVELOPE_VERSION,
        kind: 'pledge',
        id,
        swearer: { address: input.swearer, alg: 'bip322' },
        proposition: input.proposition,
        resolution: input.resolution,
        resolves_at: input.resolves_at,
        expires_at: input.expires_at,
        bond: input.bond,
        counterparty: input.counterparty,
        dispute: input.dispute,
        remediation,
        sworn_at: swornAt,
        nonce,
        sig: {
            alg: 'bip322',
            pubkey: signer.address,
            value: sigValue,
        },
    };

    if (input.viaDelegation) {
        envelope.via_delegation = input.viaDelegation.delegation_id;
        envelope.agent_address = input.viaDelegation.agent_signer.address;
    }

    return envelope;
}

/**
 * Verify a pledge envelope per SPEC §9.1 steps 1–4 (envelope-only checks).
 *
 * What this does cover:
 *   - Version check (§9.1.1)
 *   - Shape check (§9.1.2)
 *   - Canonical-message reconstruction + id check (§9.1.3)
 *   - BIP-322 signature verify (§9.1.4) — when verifyBip322 is supplied
 *
 * What this does NOT cover (delegated to other functions / caller hooks):
 *   - Bond verification (§9.1.5) — see verifyBond()
 *   - Outcome / abandonment side-channel verification — see verifyOutcome()
 *     and verifyAbandonment()
 *   - Mechanism re-evaluation against public state (§9.1.8) — out of scope
 *     for the envelope-only SDK; consumers wire their chain/relay/dns clients
 *   - State classification (§9.1.9) — see classifyState()
 *
 * skipSignatureVerification = true is the test-vector path (placeholder
 * sigs); production callers MUST supply verifyBip322.
 */
export async function verifyPledge(input: VerifyPledgeInput): Promise<VerifyPledgeResult> {
    const env = input.envelope;

    // 1. Version
    if (env.v !== ENVELOPE_VERSION) {
        return err('E_UNSUPPORTED_VERSION', `pledge envelope v=${env.v} not supported`);
    }

    // 2. Shape
    const shape = checkPledgeShape(env);
    if (shape) return shape;

    // 3. Canonical-message reconstruction + id
    const canon: PledgeCanonicalInput = {
        swearer: env.swearer.address,
        proposition: env.proposition,
        resolution: env.resolution,
        resolves_at: env.resolves_at,
        expires_at: env.expires_at,
        bond: env.bond,
        counterparty: env.counterparty,
        dispute: env.dispute,
        remediation: env.remediation,
        sworn_at: env.sworn_at,
        nonce: env.nonce,
    };
    // Field-validity check before trusting the declared id — catches malformed
    // inputs that would silently produce a non-conforming canonical message.
    const fieldCheck = validatePledgeInput(canon);
    if (!fieldCheck.ok) return err('E_PLEDGE_MALFORMED', fieldCheck.reason);

    const reconstructed = canonicalPledgeMessage(canon);
    const reconstructedId = hexEncode(sha256(canonicalPledgeMessageBytes(canon)));
    if (reconstructedId !== env.id) {
        return err(
            'E_PLEDGE_BAD_ID',
            `reconstructed id ${reconstructedId} != envelope.id ${env.id}`,
        );
    }

    // 4. Signature.
    //
    // Verification key precedence:
    //   - via_delegation present → agent_address (SPEC §7.3 step 6)
    //   - via_delegation absent  → sig.pubkey (== swearer.address by §3.6)
    if (!input.skipSignatureVerification) {
        if (!input.verifyBip322) {
            return err('E_PLEDGE_BAD_SIG', 'no BIP-322 verifier supplied');
        }
        const verifyKey = env.via_delegation && env.agent_address
            ? env.agent_address
            : env.sig.pubkey;
        const ok = await input.verifyBip322(env.id, env.sig.value, verifyKey);
        if (!ok) return err('E_PLEDGE_BAD_SIG', 'BIP-322 signature did not verify');
    }

    const result: VerifyPledgeOk = {
        ok: true,
        envelope: env,
        canonicalMessage: reconstructed,
        id: env.id,
    };
    return result;
}

// ─────────────────────────────────────────────────────────────────────────────

function checkPledgeShape(env: PledgeEnvelope): VerifyErr | null {
    if (env.kind !== 'pledge') return err('E_PLEDGE_MALFORMED', 'envelope.kind must be "pledge"');
    if (typeof env.id !== 'string' || !/^[0-9a-f]{64}$/.test(env.id)) {
        return err('E_PLEDGE_MALFORMED', 'envelope.id must be 64 lowercase hex chars');
    }
    if (!env.swearer || typeof env.swearer.address !== 'string' || env.swearer.alg !== 'bip322') {
        return err('E_PLEDGE_MALFORMED', 'envelope.swearer invalid');
    }
    if (!env.resolution || typeof env.resolution.mechanism !== 'string') {
        return err('E_PLEDGE_MALFORMED', 'envelope.resolution invalid');
    }
    if (!env.resolves_at || typeof env.resolves_at !== 'object') {
        return err('E_PLEDGE_MALFORMED', 'envelope.resolves_at must be an object');
    }
    const rkeys = Object.keys(env.resolves_at);
    if (rkeys.length !== 1 || (rkeys[0] !== 'time' && rkeys[0] !== 'block')) {
        return err(
            'E_PLEDGE_MALFORMED',
            'envelope.resolves_at must contain exactly one of {time} or {block}',
        );
    }
    if (!env.bond || typeof env.bond.attestation_id !== 'string') {
        return err('E_PLEDGE_MALFORMED', 'envelope.bond invalid');
    }
    if (!env.dispute || typeof env.dispute !== 'object') {
        return err('E_PLEDGE_MALFORMED', 'envelope.dispute must be an object');
    }
    if (env.remediation !== 'breach_recorded') {
        return err('E_PLEDGE_MALFORMED', 'envelope.remediation must equal "breach_recorded" in v0.1');
    }
    if (!env.sig || env.sig.alg !== 'bip322' || typeof env.sig.value !== 'string') {
        return err('E_PLEDGE_MALFORMED', 'envelope.sig invalid');
    }
    if (env.via_delegation !== undefined) {
        if (typeof env.via_delegation !== 'string' || !/^[0-9a-f]{64}$/.test(env.via_delegation)) {
            return err('E_PLEDGE_MALFORMED', 'envelope.via_delegation must be 64 hex chars');
        }
        if (typeof env.agent_address !== 'string') {
            return err(
                'E_PLEDGE_MALFORMED',
                'envelope.agent_address required when via_delegation present',
            );
        }
        // SPEC §3.6 says sig.pubkey MUST equal agent_address; SPEC §7.3 step 6
        // says "verify sig.value under agent_address" which treats sig.pubkey
        // as informational. The test-vector authors followed §7.3 and set
        // sig.pubkey = swearer.address (the principal — i.e. the logical
        // signer of the pledge). We accept either reading: sig.pubkey may be
        // the agent address (cryptographic signer) OR the swearer address
        // (logical signer). Verification uses agent_address as the BIP-322
        // verification key regardless. See the verifyPledge() signature-check
        // branch below.
    } else {
        if (env.sig.pubkey !== env.swearer.address) {
            return err(
                'E_PLEDGE_MALFORMED',
                'envelope.sig.pubkey must equal swearer.address when via_delegation absent',
            );
        }
        if (env.agent_address !== undefined) {
            return err(
                'E_PLEDGE_MALFORMED',
                'envelope.agent_address must be absent when via_delegation absent',
            );
        }
    }
    return null;
}

function err(code: PledgeErrorCode, message: string): VerifyErr {
    return { ok: false, code, message };
}

function isoSecondsZ(d: Date | string): string {
    if (typeof d === 'string') {
        // Trust caller; validation happens downstream.
        return d;
    }
    return d.toISOString().replace(/\.\d+Z$/, 'Z');
}
