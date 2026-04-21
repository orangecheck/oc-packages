/**
 * @orangecheck/react
 *
 * Three focused components. One pill, one gate, one signing button.
 *
 *   <OcBadge>             — display a proof-of-Bitcoin-stake badge
 *   <OcGate>              — client-side conditional render by OC status
 *   <OcChallengeButton>   — run the signed-challenge auth flow in-browser
 *
 * All three are framework-agnostic React components — no styling framework
 * required, no global CSS, no state store. Inline styles are used so the
 * components render correctly in any host app.
 */

export { OcBadge } from './badge';
export type { OcBadgeProps } from './badge';

export { OcGate } from './gate';
export type { OcGateProps } from './gate';

export { OcChallengeButton } from './challenge';
export type { OcChallengeButtonProps, OcChallengeVerified } from './challenge';

// Types re-exported for convenience.
export type {
    AttestationEnvelope,
    CheckResult,
    IdentityBinding,
    Metrics,
    Network,
    Scheme,
    ScoringAlgorithm,
    VerifyOutcome,
} from '@orangecheck/sdk';
