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

import { inheritedKeys } from './own-options';
import { signInWithOcOutcome, type OcPopupOutcome, type OcPopupResult, type SignInWithOcOptions } from './popup';

export type { MarkVariant } from '@orangecheck/mark';
export type { OcPopupOutcome, OcPopupResult, SignInWithOcOptions } from './popup';

/**
 * The approved English labels. A label in another language is fine too, as
 * long as it keeps the word "orangecheck", lowercase, as written.
 */
export const SIGN_IN_LABELS = {
    signIn: 'Sign in with orangecheck',
    continue: 'Continue with orangecheck',
    signUp: 'Sign up with orangecheck',
} as const;
export type SignInLabel = string;

/** What the button says while the sign-in window is open (the default; `busyLabel` sets your own). */
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
    /**
     * The words: one of SIGN_IN_LABELS (default "Sign in with orangecheck"), or
     * the same in your language, keeping "orangecheck" as written. `false` draws
     * the mark alone, square, named by `accessibleLabel`.
     */
    label?: SignInLabel | false;
    /** What it says while the window is open. Default "Signing in…". */
    busyLabel?: string;
    /** The accessible name of a mark-only button (`label: false`). Default "Sign in with orangecheck". */
    accessibleLabel?: string;
    appearance?: SignInAppearance;
    /** Passed to the popup (a preview origin, say). */
    popup?: Omit<SignInWithOcOptions, 'signal'>;
}

const MARKS = new Set<unknown>(['mono', 'brand', 'tile', false]);
const KEYS = new Set(['onSignedIn', 'onOutcome', 'mark', 'label', 'busyLabel', 'accessibleLabel', 'appearance', 'popup']);
/** The name, as written: lowercase, a word of its own. */
const NAMED = /(^|[^\p{L}\p{N}])orangecheck($|[^\p{L}\p{N}])/u;

export interface CheckedSignInOptions {
    mark: MarkVariant | false;
    label: string | false;
    busyLabel: string;
    accessibleLabel: string;
    appearance: SignInAppearance;
}

/** The options, checked: a misspelt key, or words without "orangecheck" in them, fail loudly, not quietly. */
export function checkSignInOptions(options: EnhanceSignInButtonOptions): CheckedSignInOptions {
    for (const key of Object.keys(options)) if (!KEYS.has(key)) throw new TypeError(`sign-in button: unknown option ${key}`);
    for (const key of inheritedKeys(options, KEYS)) throw new TypeError(`sign-in button: option ${key} is inherited, not set by the caller`);
    if (typeof options.onSignedIn !== 'function') throw new TypeError('sign-in button: onSignedIn is required');
    const label = options.label ?? SIGN_IN_LABELS.signIn;
    if (label !== false && (typeof label !== 'string' || !NAMED.test(label))) {
        throw new TypeError(`sign-in button: "${String(label)}" must say "orangecheck", lowercase, as written; see SIGN_IN_LABELS`);
    }
    const accessibleLabel = options.accessibleLabel ?? SIGN_IN_LABELS.signIn;
    if (!NAMED.test(accessibleLabel)) throw new TypeError(`sign-in button: accessibleLabel "${accessibleLabel}" must say "orangecheck"`);
    const busyLabel = options.busyLabel ?? SIGN_IN_BUSY_LABEL;
    if (typeof busyLabel !== 'string' || !busyLabel.trim()) throw new TypeError('sign-in button: busyLabel must be words');
    const mark = options.mark ?? 'mono';
    if (!MARKS.has(mark)) throw new TypeError(`sign-in button: unknown mark ${String(mark)}`);
    if (label === false && mark === false) throw new TypeError('sign-in button: with no label it needs the mark');
    const appearance = options.appearance ?? 'inherit';
    if (appearance !== 'inherit' && appearance !== 'brand') throw new TypeError(`sign-in button: unknown appearance ${String(appearance)}`);
    return { label, mark, busyLabel, accessibleLabel, appearance };
}

/**
 * Holds the button's width while its words change, so nothing beside it moves.
 * Set through the CSS object model, which no Content-Security-Policy blocks.
 */
export function holdWidth(button: HTMLElement): () => void {
    const { width: was, minWidth: wasMin } = button.style;
    const width = button.getBoundingClientRect().width;
    // The minimum too: shorter words would otherwise let a flex row shrink it.
    if (width > 0) button.style.width = button.style.minWidth = `${width}px`;
    return () => {
        button.style.width = was;
        button.style.minWidth = wasMin;
    };
}

/**
 * Make `button` an orangecheck sign-in button. Its classes and styles stay
 * yours; its content becomes the mark and the label. A `[data-oc-mark]`
 * already in the button (a placeholder `<span>`, sized by button.css exactly as
 * the mark is) is replaced by the mark, so the button's size does not change as
 * it is drawn; its value, if any, names the variant. With no
 * `label` given, words already in the button that say "orangecheck" are kept.
 * While the window is open it is `aria-disabled` and `aria-busy`, still
 * focusable, and holds its width. Returns a function that undoes it.
 */
export function enhanceSignInButton(button: HTMLButtonElement, options: EnhanceSignInButtonOptions): () => void {
    if (!button || button.tagName !== 'BUTTON') throw new TypeError('sign-in button: pass a <button> element');
    const doc = button.ownerDocument;
    const own = (button.querySelector('[data-oc-label]')?.textContent ?? button.textContent ?? '').trim();
    const iconOnly = options.label === false || (options.label === undefined && button.getAttribute('data-label') === 'none');
    const written = options.label === undefined && !iconOnly && NAMED.test(own) ? own : options.label;
    // A placeholder may name the variant: <span data-oc-mark="brand"></span>.
    const hinted = button.querySelector('[data-oc-mark]')?.getAttribute('data-oc-mark');
    const variant = options.mark === undefined && hinted && MARKS.has(hinted) ? (hinted as MarkVariant) : options.mark;
    const checked = checkSignInOptions({ ...options, mark: variant, label: iconOnly ? false : written });
    const { label, mark, appearance, busyLabel, accessibleLabel } = checked;
    const before = {
        nodes: [...button.childNodes],
        type: button.getAttribute('type'),
        aria: button.getAttribute('aria-label'),
        dataLabel: button.getAttribute('data-label'),
    };

    if (!before.type) button.type = 'button';
    button.setAttribute('data-oc-sign-in', '');
    button.setAttribute('data-appearance', appearance);
    // Built node by node: no HTML is parsed, so Trusted Types and strict CSPs allow it.
    const markEl = mark ? markElement(doc, { variant: mark }) : null;
    const text = doc.createElement('span');
    text.setAttribute('data-oc-label', '');
    if (label === false) {
        button.setAttribute('data-label', 'none');
        button.setAttribute('aria-label', accessibleLabel);
        button.replaceChildren(markEl!);
    } else {
        text.textContent = label;
        button.replaceChildren(...(markEl ? [markEl] : []), text);
    }

    let busy = false;
    let release: (() => void) | null = null;
    const setBusy = (on: boolean) => {
        busy = on;
        if (on) {
            release = holdWidth(button);
            if (label !== false) text.textContent = busyLabel;
            button.setAttribute('aria-disabled', 'true');
            button.setAttribute('aria-busy', 'true');
        } else {
            if (label !== false) text.textContent = label;
            button.removeAttribute('aria-disabled');
            button.removeAttribute('aria-busy');
            release?.();
            release = null;
        }
    };

    const onClick = async (event: MouseEvent) => {
        event.preventDefault();
        if (busy || button.disabled) return;
        // Opened before anything is awaited: a window opened later is blocked.
        const pending = signInWithOcOutcome(options.popup);
        setBusy(true);
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
        if (before.aria === null) button.removeAttribute('aria-label');
        else button.setAttribute('aria-label', before.aria);
        if (before.dataLabel === null) button.removeAttribute('data-label');
        else button.setAttribute('data-label', before.dataLabel);
    };
}
