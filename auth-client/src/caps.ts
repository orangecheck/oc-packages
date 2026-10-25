/**
 * ochk.io's sign-in caps (#344, #345): each answers 429 with `retry_at` (unix
 * seconds) and Retry-After. These say which limit was reached and when it
 * frees, in the reader's own clock, so no sign-in surface shows a reason code.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * `retryAt` as the reader's clock time, or null when it is not a time to wait
 * for: not a number, not a date, already past or more than a day away. A
 * retry_at read from a link can be anything.
 */
function readableRetry(retryAt: unknown): string | null {
    if (typeof retryAt !== 'number') return null;
    const ms = retryAt * 1000;
    const now = Date.now();
    // NaN and the infinities fail both comparisons.
    if (!(ms > now && ms <= now + DAY_MS)) return null;
    return new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

/**
 * A network past its hour of sign-in codes (`otp_network_cap`, #344): its
 * next code frees only as the hour rolls, so "wait a minute" would be false.
 */
export function otpNetworkCapText(retryAt: unknown, instead = 'Sign in another way'): string {
    const at = readableRetry(retryAt);
    return `Too many codes were sent from your network in the last hour. ${instead}, or try again ${at ? `after ${at}` : 'within the hour'}.`;
}

/**
 * A network past its count of new accounts (`new_accounts_capped`, #345).
 * Every way of signing in counts toward it, so another way would not help; an
 * account that already exists always signs in.
 */
export function newAccountsCapText(retryAt: unknown): string {
    const at = readableRetry(retryAt);
    return `Too many new accounts were made from this network recently. Try again ${at ? `after ${at}` : 'later'}, or sign in to an account you already have.`;
}

/**
 * The sentence for a cap's reason code, or null when `reason` is not one.
 * `alternative` is what else the reader can do, as a clause ("sign in another
 * way"); a cap on new accounts offers none, since every way makes the account
 * from the same network.
 */
export function capText(reason: string, retryAt: unknown, alternative = 'sign in another way'): string | null {
    const at = readableRetry(retryAt);
    const retry = at ? `Try again after ${at}` : 'Try again later';
    switch (reason) {
        case 'otp_network_cap':
            return otpNetworkCapText(retryAt, alternative.charAt(0).toUpperCase() + alternative.slice(1));
        case 'new_accounts_capped':
            return newAccountsCapText(retryAt);
        case 'new_account_cap_unavailable':
            return "We couldn't finish making your account just now. Try again in a minute.";
        case 'challenges_capped':
            return `Too many wallet sign-in attempts from this connection. ${retry}, or ${alternative}.`;
        case 'network_challenges_capped':
            return `Too many wallet sign-in attempts from this network. ${retry}, or ${alternative}.`;
        case 'cap_unavailable':
            return `We couldn't start a wallet sign-in just now. Try again in a minute, or ${alternative}.`;
        default:
            return null;
    }
}
