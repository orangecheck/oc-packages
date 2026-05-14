/**
 * Inline sudo-mode helpers · the consumer-side counterpart to the
 * ochk.io `/sudo` page.
 *
 * Pattern: when a consumer-side action hits a `401 sudo_required`
 * response from the auth host, call `redirectToSudo()` to bounce the
 * user to `https://ochk.io/sudo?return_to=<current>&purpose=<tag>`.
 * The user completes the email-OTP or BIP-322 re-authentication
 * inline on ochk.io; ochk.io re-issues the session JWT with a fresh
 * `sudo_at` claim; the browser is redirected back; the consumer's
 * original action succeeds on retry.
 *
 * No React hook needed for v1 · this is a one-shot navigation. A
 * future inline-modal version (no redirect) lives behind the same
 * function name so consumers don't have to change call-sites when we
 * upgrade.
 *
 * Server-side, gate sensitive endpoints with `verifySudoClaim()` from
 * @orangecheck/auth-core@^2.2.0.
 */

import { resolveConfig, type OcAuthConfig } from './types';

export interface RedirectToSudoArgs {
    /** Where to send the browser after the user finishes the sudo
     *  ceremony. Defaults to `window.location.href` at call-time.
     *  Must be a family origin (`*.ochk.io`) or a relative path; the
     *  /sudo page coerces unsafe values to /dashboard. */
    returnTo?: string;
    /** Free-form tag echoed in the /sudo page UI — e.g. `"register a
     *  hardware key"`. The user sees "To <purpose>, confirm with the
     *  one-time code…" so the prompt is framed by the action that
     *  triggered it. Not security-relevant. */
    purpose?: string;
    /** Optional auth-client config override · same shape as
     *  `<OcSessionProvider config={…} />`. Defaults to
     *  `authOrigin: 'https://ochk.io'`. */
    config?: OcAuthConfig;
}

/**
 * Redirect the current browser to the auth host's `/sudo` page,
 * preserving `return_to` and `purpose` query parameters. The auth
 * host runs the ceremony and bounces back on success.
 *
 * Throws on SSR — call this only inside a click handler or effect
 * after a `'sudo_required'` response.
 */
export function redirectToSudo(args: RedirectToSudoArgs = {}): void {
    if (typeof window === 'undefined') {
        throw new Error(
            '[@orangecheck/auth-client] redirectToSudo() requires a browser environment'
        );
    }
    const cfg = resolveConfig(args.config);
    const url = new URL('/sudo', cfg.authOrigin);
    const returnTo = args.returnTo ?? window.location.href;
    if (returnTo) url.searchParams.set('return_to', returnTo);
    if (args.purpose) url.searchParams.set('purpose', args.purpose);
    window.location.assign(url.toString());
}

/**
 * Convenience wrapper · the most common consumer pattern is "if the
 * fetch response's body has `reason === 'sudo_required'`, redirect."
 * Use this to keep that idiom one line:
 *
 *   const r = await fetch(...);
 *   const j = await r.json();
 *   if (handleSudoRequired(j, { purpose: 'register hardware key' })) return;
 *
 * Returns `true` if a redirect happened (and the caller should
 * short-circuit), `false` otherwise.
 */
export function handleSudoRequired(
    body: { reason?: string } | null | undefined,
    args: Omit<RedirectToSudoArgs, 'returnTo'> & { returnTo?: string } = {}
): boolean {
    if (body && body.reason === 'sudo_required') {
        redirectToSudo(args);
        return true;
    }
    return false;
}
