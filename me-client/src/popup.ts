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
 *       if (!result) return;
 *       // Your server verifies it and keeps it in an httpOnly cookie.
 *       const r = await fetch('/api/auth/session', {
 *           method: 'POST',
 *           headers: { 'Content-Type': 'application/json' },
 *           body: JSON.stringify({ token: result.token }),
 *       });
 *       if (r.ok) location.assign('/app');
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
    /** Opaque public identity · `did:oc:<32-hex>`. Stable across linking
     *  events. The canonical identifier post auth-refactor (Dec 2025
     *  +). */
    did_oc?: string;
    /** Primary linked Bitcoin address, if the user has one and is
     *  surfacing it (same-origin family integrators get it inline;
     *  cross-domain integrators need the bitcoin_address scope). */
    primary_btc?: string | null;
    /** Whether the user has a primary email linked (plaintext stays
     *  on auth host; only the boolean reaches integrators). */
    has_email?: boolean;
    /** Legacy fields kept for back-compat with pre-refactor consumers.
     *  Prefer did_oc + primary_btc. Removed in a future major. */
    address?: string;
    btc_address?: string;
    display_name?: string | null;
    nostr_npub?: string | null;
    wallet_provisioned?: boolean;
    email?: string;
}

export interface OcPopupResult {
    /** Account payload from the auth host, unsigned: trust only the
     *  verified token. `did_oc` is the account's opaque identifier, the
     *  same at every site; the email and Bitcoin address stay private
     *  unless the user grants a scope. */
    account: OcPopupAccount;
    /** The session JWT, bound to your origin. Hand it once to your own
     *  server, which verifies it and keeps it in an httpOnly cookie; never
     *  in localStorage, where any script on the page can read it. Family
     *  sites (*.ochk.io) can ignore it: the Domain=.ochk.io cookie rides
     *  home on its own. */
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
 * How a sign-in popup ended:
 *   - `signed_in` · the person signed in; `account` and `token` as from signInWithOc.
 *   - `blocked`   · the browser refused to open the window. Ask the person to
 *                   allow pop-ups for your site, then try again from a click.
 *   - `closed`    · the person closed the window without signing in.
 *   - `aborted`   · your AbortSignal fired.
 *   - `failed`    · not in a browser, or the popup's answer was malformed.
 */
export type OcPopupOutcome =
    | ({ status: 'signed_in' } & OcPopupResult)
    | { status: 'blocked' }
    | { status: 'closed' }
    | { status: 'aborted' }
    | { status: 'failed' };

/**
 * Open the OC signin popup and resolve with how it ended (OcPopupOutcome),
 * so a blocked window and a closed one can be told apart.
 *
 * MUST be called inside a user-gesture handler (e.g. a button onClick).
 * Browsers block `window.open` outside of user gestures.
 */
export function signInWithOcOutcome(options: SignInWithOcOptions = {}): Promise<OcPopupOutcome> {
    const popupOrigin = options.popupOrigin ?? DEFAULT_POPUP_ORIGIN;
    const popupPath = options.popupPath ?? DEFAULT_POPUP_PATH;
    const features = options.features ?? DEFAULT_FEATURES;

    return new Promise((resolve) => {
        if (typeof window === 'undefined') {
            resolve({ status: 'failed' });
            return;
        }

        const url = new URL(popupPath, popupOrigin);
        url.searchParams.set('opener_origin', window.location.origin);
        const popup = window.open(url.toString(), 'oc-signin', features);
        if (!popup) {
            resolve({ status: 'blocked' });
            return;
        }
        popup.focus();

        let settled = false;
        const cleanup = () => {
            window.removeEventListener('message', onMessage);
            clearInterval(closedTimer);
            if (options.signal) options.signal.removeEventListener('abort', onAbort);
        };

        function settle(value: OcPopupOutcome) {
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
            // Origin pinning is necessary but not sufficient — same-origin
            // pages other than our popup can post the same shape. Pin both
            // origin AND source window so only the popup we opened can
            // settle this promise.
            if (event.origin !== popupOrigin) return;
            if (event.source !== popup) return;
            const data = event.data as
                | { type?: string; account?: OcPopupAccount; token?: string }
                | null;
            if (!data || data.type !== 'oc-signin-success') return;
            if (!data.account || !data.token) {
                settle({ status: 'failed' });
                return;
            }
            settle({ status: 'signed_in', account: data.account, token: data.token });
        }

        function onAbort() {
            settle({ status: 'aborted' });
        }

        window.addEventListener('message', onMessage);
        if (options.signal) {
            if (options.signal.aborted) {
                settle({ status: 'aborted' });
                return;
            }
            options.signal.addEventListener('abort', onAbort);
        }

        // Detect the person closing the popup without completing signin.
        const closedTimer = setInterval(() => {
            if (popup && popup.closed) settle({ status: 'closed' });
        }, 500);
    });
}

/**
 * Open the OC signin popup and resolve with the session result. Returns
 * `null` if the user closed the popup without completing signin, if the
 * browser blocked it, or if the AbortSignal fired. To tell those apart,
 * use signInWithOcOutcome.
 *
 * MUST be called inside a user-gesture handler (e.g. a button onClick).
 * Browsers block `window.open` outside of user gestures.
 */
export async function signInWithOc(options: SignInWithOcOptions = {}): Promise<OcPopupResult | null> {
    const outcome = await signInWithOcOutcome(options);
    return outcome.status === 'signed_in' ? { account: outcome.account, token: outcome.token } : null;
}
