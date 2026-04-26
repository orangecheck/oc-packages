/**
 * @orangecheck/auth-client
 *
 * React bindings for the cross-subdomain oc_session. Mount
 * `<OcSessionProvider>` once near the root, then call `useOcSession()` or
 * drop in `<OcSignInButton>` / `<OcAccountPill>` anywhere.
 */

export { OcSessionProvider, useOcSession, useOptionalOcSession, DEFAULT_CONFIG } from './provider';
export { OcSignInButton, OcAccountPill, OcAddressInput } from './components';
export type {
    OcSignInButtonProps,
    OcAccountPillProps,
    OcAddressInputProps,
} from './components';
export type { OcAccount, OcSessionStatus, OcSessionState, OcAuthConfig } from './types';
export { buildSignInUrl } from './types';
