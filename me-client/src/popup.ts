/**
 * @orangecheck/me-client/popup
 *
 * Browser-side helper that opens the OC sign-in popup, listens for the
 * postMessage from me.ochk.io, and resolves with the verified session.
 *
 *   import { signInWithOc } from '@orangecheck/me-client/popup';
 *
 *   document.querySelector('#oc-signin')!.addEventListener('click', async () => {
 *       const result = await signInWithOc();
 *       if (result) {
 *           localStorage.setItem('oc-session-token', result.token);
 *           location.assign('/app');
 *       }
 *   });
 *
 * Why this lives in a separate entry point: it's browser-only (uses
 * window.open / addEventListener) and integrators that only need the
 * server-side verifier shouldn't pull popup orchestration into their
 * server bundle.
 */

const DEFAULT_POPUP_ORIGIN = 'https://me.ochk.io';
const DEFAULT_POPUP_PATH = '/popup/signin';
const DEFAULT_FEATURES = 'width=480,height=720,resizable=yes,scrollbars=yes';

export interface OcPopupAccount {
    id?: string;
    address?: string;
    btc_address?: string;
    display_name?: string | null;
    nostr_npub?: string | null;
    wallet_provisioned?: boolean;
    email?: string;
}

export interface OcPopupResult {
    /** Account payload from the auth host. `address` is the canonical
     *  identifier (Bitcoin address for BIP-322 users, did:email:<hash>
     *  for email-OTP users). */
    account: OcPopupAccount;
    /** The session JWT. Cross-domain integrators store this and send
     *  it as `Authorization: Bearer <token>` on subsequent calls.
     *  Family integrators (*.ochk.io) can ignore it — the cookie set
     *  Domain=.ochk.io rides home automatically. */
    token: string;
}

export interface SignInWithOcOptions {
    /** Origin of the OC popup page. Defaults to https://me.ochk.io.
     *  Override only for staging / preview environments. */
    popupOrigin?: string;
    /** Path on the popup origin. Defaults to /popup/signin. */
    popupPath?: string;
    /** window.open features string. Defaults to a 480x720 resizable
     *  popup with scrollbars. */
    features?: string;
    /** AbortSignal that cancels the wait and closes the popup. */
    signal?: AbortSignal;
}

/**
 * Open the OC signin popup and resolve with the session result. Returns
 * `null` if the user closed the popup without completing signin, or if
 * the AbortSignal fired.
 *
 * MUST be called inside a user-gesture handler (e.g. a button onClick).
 * Browsers block `window.open` outside of user gestures.
 */
export function signInWithOc(options: SignInWithOcOptions = {}): Promise<OcPopupResult | null> {
    const popupOrigin = options.popupOrigin ?? DEFAULT_POPUP_ORIGIN;
    const popupPath = options.popupPath ?? DEFAULT_POPUP_PATH;
    const features = options.features ?? DEFAULT_FEATURES;

    return new Promise((resolve) => {
        if (typeof window === 'undefined') {
            resolve(null);
            return;
        }

        const url = new URL(popupPath, popupOrigin);
        url.searchParams.set('opener_origin', window.location.origin);
        const popup = window.open(url.toString(), 'oc-signin', features);
        if (!popup) {
            // Popup blocked. Caller can detect a null result and fall
            // back to a full-page redirect if desired.
            resolve(null);
            return;
        }
        popup.focus();

        let settled = false;
        const cleanup = () => {
            window.removeEventListener('message', onMessage);
            clearInterval(closedTimer);
            if (options.signal) options.signal.removeEventListener('abort', onAbort);
        };

        function settle(value: OcPopupResult | null) {
            if (settled) return;
            settled = true;
            cleanup();
            try {
                if (popup && !popup.closed) popup.close();
            } catch {
                /* popup may have closed itself first */
            }
            resolve(value);
        }

        function onMessage(event: MessageEvent) {
            if (event.origin !== popupOrigin) return;
            const data = event.data as
                | { type?: string; account?: OcPopupAccount; token?: string }
                | null;
            if (!data || data.type !== 'oc-signin-success') return;
            if (!data.account || !data.token) {
                // Malformed payload — treat as not-signed-in.
                settle(null);
                return;
            }
            settle({ account: data.account, token: data.token });
        }

        function onAbort() {
            settle(null);
        }

        window.addEventListener('message', onMessage);
        if (options.signal) {
            if (options.signal.aborted) {
                settle(null);
                return;
            }
            options.signal.addEventListener('abort', onAbort);
        }

        // Detect the user closing the popup without completing signin.
        const closedTimer = setInterval(() => {
            if (popup && popup.closed) settle(null);
        }, 500);
    });
}
