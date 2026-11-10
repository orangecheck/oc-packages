/**
 * The sign-in link ochk.io mails an address its wrong-code cap holds, when a
 * first-party site (ochk.app) asked for it. The link only signs in the browser
 * that asked: that browser keeps a random key here, sends its hash with the
 * start, and sends the key itself with the link. A link forwarded to another
 * browser finds no key and signs no one in.
 */

const KEY_STORAGE = 'oc-signin-link-key';
const KEY_RE = /^[A-Za-z0-9_-]{43}$/;
const SECRET_RE = /^[A-Za-z0-9_-]{43}$/;
const PART_RE = /^[A-Za-z0-9_-]+$/;

/** The fragment a first-party site's /signin receives: `#oc-link=<token>.<secret>`. */
export const LINK_FRAGMENT = '#oc-link=';

function storage(): Storage | null {
    try {
        return typeof window === 'undefined' ? null : window.localStorage;
    } catch {
        return null;
    }
}

function base64url(bytes: Uint8Array): string {
    let s = '';
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** This browser's link key, or undefined when it has none or cannot keep one. */
export function readLinkKey(): string | undefined {
    try {
        const v = storage()?.getItem(KEY_STORAGE);
        return v && KEY_RE.test(v) ? v : undefined;
    } catch {
        return undefined;
    }
}

/**
 * The hash a start sends as `link_bind`: of this browser's key, made and kept
 * on first use, so every link it asks for works here. Undefined when the
 * browser keeps no storage; ochk.io then mails no link.
 */
export async function linkBind(): Promise<string | undefined> {
    const store = storage();
    if (!store || !globalThis.crypto?.subtle) return undefined;
    let key = readLinkKey();
    try {
        if (!key) {
            key = base64url(crypto.getRandomValues(new Uint8Array(32)));
            store.setItem(KEY_STORAGE, key);
            if (store.getItem(KEY_STORAGE) !== key) return undefined;
        }
        const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
        return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
    } catch {
        return undefined;
    }
}

export interface HeldLink {
    token: string;
    secret: string;
    /** The address the token is for, read unchecked: ochk.io checks the token. */
    email: string;
    /** Unix seconds. */
    exp: number;
}

/** The link in `hash`, or null when it is not a whole sign-in link. */
export function parseHeldLink(hash: string): HeldLink | null {
    if (!hash.startsWith(LINK_FRAGMENT)) return null;
    const raw = hash.slice(LINK_FRAGMENT.length);
    const cut = raw.lastIndexOf('.');
    if (cut < 0) return null;
    const token = raw.slice(0, cut);
    const secret = raw.slice(cut + 1);
    if (!SECRET_RE.test(secret)) return null;
    const parts = token.split('.');
    if (parts.length !== 3 || !parts.every((p) => PART_RE.test(p))) return null;
    let payload: Record<string, unknown>;
    try {
        const b64 = parts[1]!.replace(/-/g, '+').replace(/_/g, '/');
        payload = JSON.parse(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)));
    } catch {
        return null;
    }
    const { email, exp } = payload;
    if (payload.purpose !== 'email-otp' || payload.ceremony !== 'signin') return null;
    if (typeof email !== 'string' || typeof exp !== 'number') return null;
    return { token, secret, email, exp };
}

/** The address as the link step names it: its first letter and its domain. */
export function maskEmail(email: string): string {
    const at = email.lastIndexOf('@');
    if (at < 1) return email;
    return `${email[0]}***${email.slice(at)}`;
}

/** Refusals another press cannot change: the step offers the sign-in form instead. */
export const FINAL_LINK_REFUSALS: ReadonlySet<string> = new Set([
    'wrong_browser',
    'replay',
    'expired',
    'invalid_token',
    'email_mismatch',
    'wrong_link',
]);

/** What the link step says when ochk.io refused the link. */
export function heldLinkRefusalText(reason: string | undefined): string {
    switch (reason) {
        case 'wrong_browser':
            return (
                'This link works only in the browser where you asked to sign in. ' +
                'Open it there, or ask for a new link here.'
            );
        case 'replay':
            return 'This link was already used. Ask for a new one.';
        case 'expired':
            return 'This link has expired. Ask for a new one.';
        case 'invalid_token':
        case 'email_mismatch':
            return 'This link has expired or is not complete. Ask for a new one.';
        case 'wrong_link':
            return 'This link is not complete. Open it from the email again.';
        case 'rate_limited':
            return 'Too many tries just now. Wait a minute, then press it again.';
        default:
            return "That didn't work. Press it again in a minute.";
    }
}
