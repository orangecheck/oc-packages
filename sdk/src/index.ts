/**
 * @orangecheck/sdk
 *
 * Proof of Bitcoin stake for the open web.
 *
 * The three functions you'll use most:
 *
 *   check()             — the sybil-gate primitive. Pass in an address + thresholds,
 *                         get back { ok, sats, days, score }.
 *   verify()            — verify a raw (addr, msg, sig) attestation. No Nostr round-trip.
 *   createAttestation() — build a signed JSON envelope from a canonical message + signature.
 *
 * Everything else below is the building blocks those three are made of, re-exported
 * for integrators who need finer control.
 *
 * @example
 *
 *   import { check } from '@orangecheck/sdk';
 *
 *   const result = await check({
 *     addr: 'bc1q...',
 *     minSats: 100_000,
 *     minDays: 30,
 *   });
 *   if (result.ok) letThemThrough();
 */

// ─── The three load-bearing exports ────────────────────────────────────────
export { check } from './check';
export type { CheckParams, CheckResult } from './check';
export { verify } from './verify';
export { createAttestation } from './attestation';

// ─── Signed-challenge auth (for gates that can't trust the address source) ─
export { issueChallenge, verifyChallenge } from './challenge';
export type {
    Challenge,
    IssueChallengeOptions,
    VerifyChallengeOptions,
    VerifyChallengeReason,
    VerifyChallengeResult,
} from './challenge';

// ─── Types ─────────────────────────────────────────────────────────────────
export * from './types';

// ─── Canonical message builders (for issuers) ──────────────────────────────
export {
    buildCanonicalMessage,
    createAttestationEnvelope,
    formatIdentities,
    generateAttestationId,
    parseIdentities,
} from './canonical';

// ─── Attestation discovery + publishing ────────────────────────────────────
export {
    discoverAttestations,
    extractAttestationIdFromUrl,
    formatIdentitiesForDisplay,
    getAttestationsForAddress,
    getAttestationsForIdentity,
    getVerificationUrl,
    publishAttestation,
    verifyAttestationById,
} from './attestation';

// ─── Nostr integration (for low-level callers) ─────────────────────────────
export {
    createAttestationEvent,
    DEFAULT_RELAYS,
    parseAttestationFromEvent,
    publishToRelays,
    queryByAddress,
    queryByAttestationId,
    queryByIdentity,
} from './nostr';
export {
    getNip07Info,
    getNostrPublicKey,
    isNip07Available,
    signNostrEvent,
} from './nostr-crypto';

// ─── Identity verification (out-of-band handle checks) ─────────────────────
export * from './identity';

// ─── Reference scoring ─────────────────────────────────────────────────────
export { computeAllScores, computeScore, type ScoringAlgorithm } from './scoring';

// ─── Human-readable status code metadata ───────────────────────────────────
export * from './messages';
