/**
 * @orangecheck/auth-client
 *
 * React bindings for the cross-subdomain oc_session. Mount
 * `<OcSessionProvider>` once near the root, then call `useOcSession()` or
 * drop in `<OcSignInButton>` / `<OcAccountPill>` anywhere.
 */

export { OcSessionProvider, useOcSession, useOptionalOcSession, DEFAULT_CONFIG } from './provider';
export {
    OcSignInButton,
    OcAccountPill,
    OcAccountChip,
    OcAddressInput,
    useOcAddressSuggestion,
} from './components';
export type {
    OcSignInButtonProps,
    OcAccountPillProps,
    OcAccountChipProps,
    OcAddressInputProps,
    UseOcAddressSuggestionOptions,
    UseOcAddressSuggestionReturn,
} from './components';
export { OcSignIn } from './signin';
export type { OcSignInProps } from './signin';
export type { OcAccount, OcSessionStatus, OcSessionState, OcAuthConfig } from './types';
export { buildSignInUrl } from './types';
export {
    useWebAuthnRegister,
    useWebAuthnList,
    useStepUpAuth,
} from './webauthn';
export type {
    WebAuthnCredentialPublic,
    WebAuthnRegisterStatus,
    WebAuthnAssertionStatus,
    WebAuthnListStatus,
    WebAuthnRegisterResult,
    WebAuthnStepUpResult,
    WebAuthnRenameResult,
    WebAuthnRemoveResult,
    UseWebAuthnRegisterReturn,
    UseWebAuthnListReturn,
    UseStepUpAuthReturn,
} from './webauthn';
export { redirectToSudo, handleSudoRequired } from './sudo';
export type { RedirectToSudoArgs } from './sudo';
