/**
 * Browser only, no framework: a "Sign in with orangecheck" button that keeps
 * your site's own look. Write your button as you write every other one, add
 * `data-oc-sign-in`, and enhance it: this adds the orangecheck mark and the
 * label, opens the sign-in popup inside the click, holds the busy state, and
 * says how the popup ended. Optional stylesheet: `@orangecheck/me-client/button.css`.
 *
 *   <button class="cta ghost" data-oc-sign-in>Sign in with orangecheck</button>
 *
 *   import { enhanceSignInButton } from '@orangecheck/me-client/button';
 *   enhanceSignInButton(document.querySelector('[data-oc-sign-in]'), {
 *       onSignedIn: async ({ token }) => { … },
 *   });
 *
 * The file has no imports at run time (the mark and the popup are bundled
 * in), so it can be copied onto your own origin under a strict CSP.
 *
 * @packageDocumentation
 */

import { markElement, type MarkVariant } from '@orangecheck/mark';

import { signInWithOcOutcome, type OcPopupOutcome, type OcPopupResult, type SignInWithOcOptions } from './popup';

export type { MarkVariant } from '@orangecheck/mark';
export type { OcPopupOutcome, OcPopupResult, SignInWithOcOptions } from './popup';

/** The labels a sign-in button may carry. "orangecheck" is always lowercase, never "OC". */
export const SIGN_IN_LABELS = {
    signIn: 'Sign in with orangecheck',
    continue: 'Continue with orangecheck',
    signUp: 'Sign up with orangecheck',
} as const;
export type SignInLabel = (typeof SIGN_IN_LABELS)[keyof typeof SIGN_IN_LABELS];

/** What the button says while the sign-in window is open. */
export const SIGN_IN_BUSY_LABEL = 'Signing in…';

/** What to tell the person when the window did not end in a sign-in. Show it near the button. */
export const OUTCOME_COPY = {
    blocked: 'Your browser blocked the sign-in window. Allow pop-ups for this site, then try again.',
    closed: 'The sign-in window closed before you finished.',
    failed: "Sign-in didn't finish. Try again.",
} as const;

/** `inherit`: no colour, font or radius of its own; your classes draw it. `brand`: orangecheck's button, themed by --oc-* properties. */
export type SignInAppearance = 'inherit' | 'brand';

export interface EnhanceSignInButtonOptions {
    /** Called with the popup's account and token once the person signs in; the button stays busy until it settles. */
    onSignedIn: (result: OcPopupResult) => void | Promise<void>;
    /** Called with how every popup ended, sign-in included. Use OUTCOME_COPY for the words. */
    onOutcome?: (outcome: OcPopupOutcome) => void;
    /** The mark beside the label: `mono` (your text colour, the default), `brand` (dark buttons), `tile`, or `false` for none. */
    mark?: MarkVariant | false;
    /** One of SIGN_IN_LABELS. Default "Sign in with orangecheck". */
    label?: SignInLabel;
    appearance?: SignInAppearance;
    /** Passed to the popup (a preview origin, say). */
    popup?: Omit<SignInWithOcOptions, 'signal'>;
}

const LABELS = new Set<string>(Object.values(SIGN_IN_LABELS));
const MARKS = new Set<unknown>(['mono', 'brand', 'tile', false]);
const KEYS = new Set(['onSignedIn', 'onOutcome', 'mark', 'label', 'appearance', 'popup']);

/** The options, checked: a misspelt key or a label outside the approved set fails loudly, not quietly. */
export function checkSignInOptions(options: EnhanceSignInButtonOptions): Required<Pick<EnhanceSignInButtonOptions, 'mark' | 'label' | 'appearance'>> {
    for (const key of Object.keys(options)) if (!KEYS.has(key)) throw new TypeError(`sign-in button: unknown option ${key}`);
    if (typeof options.onSignedIn !== 'function') throw new TypeError('sign-in button: onSignedIn is required');
    const label = options.label ?? SIGN_IN_LABELS.signIn;
    if (!LABELS.has(label)) throw new TypeError(`sign-in button: "${label}" is not an approved label; use one of SIGN_IN_LABELS`);
    const mark = options.mark ?? 'mono';
    if (!MARKS.has(mark)) throw new TypeError(`sign-in button: unknown mark ${String(mark)}`);
    const appearance = options.appearance ?? 'inherit';
    if (appearance !== 'inherit' && appearance !== 'brand') throw new TypeError(`sign-in button: unknown appearance ${String(appearance)}`);
    return { label, mark, appearance };
}

/**
 * Make `button` an orangecheck sign-in button. Its classes and styles stay
 * yours; its content becomes the mark and the label. While the window is
 * open it is `aria-disabled` and `aria-busy`, and still focusable. Returns a
 * function that undoes it.
 */
export function enhanceSignInButton(button: HTMLButtonElement, options: EnhanceSignInButtonOptions): () => void {
    if (!button || button.tagName !== 'BUTTON') throw new TypeError('sign-in button: pass a <button> element');
    const { label, mark, appearance } = checkSignInOptions(options);
    const before = { nodes: [...button.childNodes], type: button.getAttribute('type') };
    const doc = button.ownerDocument;

    if (!before.type) button.type = 'button';
    button.setAttribute('data-oc-sign-in', '');
    button.setAttribute('data-appearance', appearance);
    // Built node by node: no HTML is parsed, so Trusted Types and strict CSPs allow it.
    const text = doc.createElement('span');
    text.setAttribute('data-oc-label', '');
    text.textContent = label;
    button.replaceChildren(...(mark ? [markElement(doc, { variant: mark })] : []), text);

    let busy = false;
    const setBusy = (on: boolean) => {
        busy = on;
        text.textContent = on ? SIGN_IN_BUSY_LABEL : label;
        if (on) {
            button.setAttribute('aria-disabled', 'true');
            button.setAttribute('aria-busy', 'true');
        } else {
            button.removeAttribute('aria-disabled');
            button.removeAttribute('aria-busy');
        }
    };

    const onClick = async (event: MouseEvent) => {
        event.preventDefault();
        if (busy || button.disabled) return;
        setBusy(true);
        // Opened before anything is awaited: a window opened later is blocked.
        const pending = signInWithOcOutcome(options.popup);
        try {
            const outcome = await pending;
            options.onOutcome?.(outcome);
            if (outcome.status === 'signed_in') await options.onSignedIn({ account: outcome.account, token: outcome.token });
        } finally {
            setBusy(false);
        }
    };
    button.addEventListener('click', onClick);

    return () => {
        button.removeEventListener('click', onClick);
        button.replaceChildren(...before.nodes);
        if (before.type === null) button.removeAttribute('type');
        for (const a of ['data-oc-sign-in', 'data-appearance', 'aria-disabled', 'aria-busy']) button.removeAttribute(a);
    };
}
