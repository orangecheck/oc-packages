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
export { nostrIdentifierForms, nostrPubkeyToHex } from './nostr-pubkey';

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
// `Extensions` is the second parameter of the public buildCanonicalMessage and
// `BuildOptions` the third, so a consumer that wants to name either had no way
// to import it — oc-www had to read them back off the function with
// `Parameters<typeof buildCanonicalMessage>[1]`. A public function's parameter
// types belong in the public surface.
export type { BuildOptions, Extensions } from './canonical';

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
    FANOUT_DEADLINE_MS,
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
