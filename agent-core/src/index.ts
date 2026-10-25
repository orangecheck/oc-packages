export * from './types.js';
export {
    canonicalize,
    hexEncode,
    sha256Hex,
    canonicalizeScopes,
    parseAndCanonicalizeScopes,
    delegationCanonicalMessage,
    actionCanonicalMessage,
    revocationCanonicalMessage,
    subdelegationCanonicalMessage,
    delegationCanonicalBytes,
    actionCanonicalBytes,
    revocationCanonicalBytes,
    subdelegationCanonicalBytes,
    computeDelegationId,
    computeActionId,
    computeRevocationId,
    computeSubdelegationId,
    canonicalizeDelegation,
    canonicalizeAction,
    canonicalizeRevocation,
    canonicalDelegationBytes,
    canonicalActionBytes,
    canonicalRevocationBytes,
} from './canonical.js';
export {
    parseScope,
    canonicalizeScope,
    canonicalizeScopeString,
    validateScope,
    isSubScope,
    ScopeParseError,
    REGISTERED_SCOPES,
} from './scope.js';
export type { Scope, ScopeConstraint, ScopeOp, ValidationOptions } from './scope.js';
export {
    verifyDelegation,
    verifyAction,
    verifyActionAsOfSignedAt,
    createReplayGuard,
    verifyRevocation,
    verifySubdelegation,
    AgentError,
    DEFAULT_MAX_CHAIN_DEPTH,
    DEFAULT_MAX_SKEW_MS,
} from './verify.js';
export type {
    VerifyBase,
    VerifyDelegationInput,
    VerifyActionInput,
    VerifyActionAsOfSignedAtInput,
    VerifyRevocationInput,
    VerifySubdelegationInput,
} from './verify.js';
export {
    federationDescriptorCanonicalMessage,
    computeFederationDescriptorId,
    verifyFederationDelegation,
    verifyFederationRevocation,
} from './federation.js';
export type {
    FederationGuardian,
    FederationDescriptor,
    FederationPrincipal,
    FederationSignature,
    FederationDelegationEnvelope,
    FederationRevocationEnvelope,
    FederationVerifyResult,
    VerifyFederationBase,
    VerifyFederationDelegationInput,
    VerifyFederationRevocationInput,
} from './federation.js';
export {
    sealScopes,
    unsealScopes,
    encodeScopesPayload,
    decodeScopesPayload,
    hasPrivateScopes,
} from './private-scope.js';
export type {
    SealScopesInput,
    UnsealScopesInput,
    UnsealedScopes,
} from './private-scope.js';

export { authoredReasonProblem, REVOCATION_REASON_MAX_BYTES, shownReason } from './reason.js';
export type { AuthoredReasonProblem } from './reason.js';

export { assertScopeGranted, ScopeNotGrantedError } from './assert-scope.js';
export type { ScopeBearingDelegation } from './assert-scope.js';
