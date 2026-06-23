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
export { OcLinkedIdentities, fetchOcLinkedIdentities } from './linked-identities';
export type { OcLinkedIdentitiesProps, OcLinkedIdentity } from './linked-identities';
export type {
    OcAccount,
    OcAccountSummary,
    OcSessionStatus,
    OcSessionState,
    OcSignOutScope,
    OcAuthConfig,
    DisplayIdentity,
    DisplayIdentityKind,
} from './types';
export { buildAddAccountUrl, buildSignInUrl, DISPLAY_IDENTITY_KINDS } from './types';
export {
    TAB_SESSION_HEADER,
    TAB_SESSION_STORAGE_KEY,
    TAB_ADOPT_HASH,
    TAB_ACCOUNT_HINT_KEY,
    readTabSession,
    writeTabSession,
    clearTabSession,
    tabSessionHeader,
    installTabFetchInterceptor,
    installTabLinkDecorator,
    consumeTabAdoptMarker,
    consumeTabAccountHint,
} from './tab-session';
export type { OcTabSession } from './tab-session';
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
