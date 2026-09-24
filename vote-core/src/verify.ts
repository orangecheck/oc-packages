// Authenticity checks for polls and reveals per SPEC §3.3, §6.4 and §10.
//
// Like `tally`, these take the BIP-322 verifier as a callback: this package
// stays free of any secp256k1 / bip322 dependency.

import { pollId, revealId } from './ids.js';
import { POLL_VERSION, REVEAL_VERSION } from './types.js';
import type { Poll, Reveal, VoteErrorCode } from './types.js';

/** Named-argument BIP-322 verifier, the same shape as `TallyOptions.verify`. */
export type SignatureVerifier = (args: {
    address: string;
    message: string;
    signature: string;
}) => Promise<boolean> | boolean;

export type VerifyResult = { ok: true } | { ok: false; code: VoteErrorCode; reason: string };

/** Thrown by `tally` when it declines to produce a result; `code` is a SPEC §9 code. */
export class VoteError extends Error {
    readonly code: VoteErrorCode;
    constructor(code: VoteErrorCode, message: string) {
        super(message);
        this.name = 'VoteError';
        this.code = code;
    }
}

/**
 * SPEC §3.3 / §4.3: creators and voters MUST use Bitcoin mainnet addresses.
 * This is a network check by prefix only (bech32 `bc1`, base58 `1` / `3`);
 * checksum validity is left to the BIP-322 verifier.
 */
export function isMainnetAddress(addr: unknown): boolean {
    if (typeof addr !== 'string') return false;
    if (/^bc1/i.test(addr)) return !/^bcrt1/i.test(addr);
    return /^[13][1-9A-HJ-NP-Za-km-z]+$/.test(addr);
}

const OPTION_ID_RE = /^[a-z0-9_-]{1,32}$/;

/**
 * Structural checks from SPEC §3.3 plus the creator's BIP-322 signature over
 * `poll_id` (§10.1). A poll that fails MUST be rejected.
 */
export async function verifyPoll(poll: Poll, verify: SignatureVerifier): Promise<VerifyResult> {
    const bad = (code: VoteErrorCode, reason: string): VerifyResult => ({ ok: false, code, reason });
    if (!poll || typeof poll !== 'object') return bad('E_WRONG_POLL', 'not a poll object');
    if (poll.v !== POLL_VERSION || poll.kind !== 'oc-vote/poll') {
        return bad('E_WRONG_POLL', 'not an oc-vote/poll v0 object');
    }
    if (!isMainnetAddress(poll.creator)) {
        return bad('E_WRONG_POLL', 'creator is not a Bitcoin mainnet address');
    }
    if (!Array.isArray(poll.options) || poll.options.length < 2) {
        return bad('E_WRONG_POLL', 'poll needs at least two options');
    }
    const ids = new Set<string>();
    for (const o of poll.options) {
        if (!o || typeof o.id !== 'string' || !OPTION_ID_RE.test(o.id) || o.id === 'withdraw') {
            return bad('E_WRONG_POLL', 'invalid option id');
        }
        if (ids.has(o.id)) return bad('E_WRONG_POLL', 'duplicate option id');
        ids.add(o.id);
    }
    if (!Number.isFinite(Date.parse(poll.deadline))) {
        return bad('E_WRONG_POLL', 'unparseable deadline');
    }
    if (poll.snapshot_block !== 'deadline' && !isBlockHeight(poll.snapshot_block)) {
        return bad('E_WRONG_POLL', 'snapshot_block must be a positive integer or "deadline"');
    }
    if (poll.mode === 'secret') {
        if (typeof poll.reveal_pk !== 'string' || !/^[0-9a-f]{64}$/.test(poll.reveal_pk)) {
            return bad('E_WRONG_POLL', 'secret poll without a valid reveal_pk');
        }
    } else if (poll.mode === 'public') {
        if (poll.reveal_pk != null) return bad('E_WRONG_POLL', 'public poll carries a reveal_pk');
    } else {
        return bad('E_WRONG_POLL', 'unknown poll mode');
    }
    const signature = poll.sig?.value;
    if (poll.sig?.alg !== 'bip322' || typeof signature !== 'string' || !signature) {
        return bad('E_BAD_SIG', 'poll is unsigned');
    }
    const ok = await verify({ address: poll.creator, message: pollId(poll), signature });
    return ok ? { ok: true } : bad('E_BAD_SIG', 'poll signature does not verify against creator');
}

/**
 * SPEC §6.4 step 1 and §10.3: a reveal is accepted only if it names this poll,
 * is dated at or after the deadline, and is signed by the poll's creator over
 * `reveal_id`.
 */
export async function verifyReveal(
    reveal: Reveal,
    poll: Poll,
    verify: SignatureVerifier
): Promise<VerifyResult> {
    const bad = (code: VoteErrorCode, reason: string): VerifyResult => ({ ok: false, code, reason });
    if (!reveal || typeof reveal !== 'object') return bad('E_NO_REVEAL', 'not a reveal object');
    if (reveal.v !== REVEAL_VERSION || reveal.kind !== 'oc-vote/reveal') {
        return bad('E_NO_REVEAL', 'not an oc-vote/reveal v0 object');
    }
    if (reveal.poll_id !== pollId(poll)) return bad('E_WRONG_POLL', 'reveal is for a different poll');
    if (typeof reveal.reveal_sk !== 'string' || !/^[0-9a-f]{64}$/.test(reveal.reveal_sk)) {
        return bad('E_NO_REVEAL', 'reveal_sk is not 32-byte hex');
    }
    const revealedAt = Date.parse(reveal.revealed_at);
    const deadline = Date.parse(poll.deadline);
    if (!Number.isFinite(revealedAt) || !Number.isFinite(deadline)) {
        return bad('E_NO_REVEAL', 'unparseable revealed_at or deadline');
    }
    if (revealedAt < deadline) return bad('E_NO_REVEAL', 'premature reveal (revealed_at < deadline)');
    const signature = reveal.sig?.value;
    if (typeof signature !== 'string' || !signature) return bad('E_BAD_SIG', 'reveal is unsigned');
    const ok = await verify({ address: poll.creator, message: revealId(reveal), signature });
    return ok ? { ok: true } : bad('E_BAD_SIG', 'reveal signature does not verify against creator');
}

export function isBlockHeight(h: unknown): h is number {
    return typeof h === 'number' && Number.isSafeInteger(h) && h > 0;
}
