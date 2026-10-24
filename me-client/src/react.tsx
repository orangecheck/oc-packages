/**
 * React: `<SignInWithOrangecheck>`, a native `<button>` that keeps your site's
 * look (appearance `inherit`, the default) or wears orangecheck's (appearance
 * `brand`, themed by --oc-* custom properties in `@orangecheck/me-client/button.css`).
 * It carries the mark and an approved label, opens the popup inside the
 * click, and holds the busy state. `react` is an optional peer: no other
 * entry of this package loads it.
 *
 * @packageDocumentation
 */

import type { ButtonHTMLAttributes } from 'react';

import { OrangecheckMark } from '@orangecheck/mark/react';
import { useState } from 'react';

import { checkSignInOptions, SIGN_IN_BUSY_LABEL, type EnhanceSignInButtonOptions } from './button';
import { signInWithOcOutcome } from './popup';

export { OUTCOME_COPY, SIGN_IN_BUSY_LABEL, SIGN_IN_LABELS } from './button';
export type { EnhanceSignInButtonOptions, MarkVariant, OcPopupOutcome, OcPopupResult, SignInAppearance, SignInLabel } from './button';

export type SignInWithOrangecheckProps = EnhanceSignInButtonOptions &
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children' | 'type'>;

/** A "Sign in with orangecheck" button. Your className and style draw it; it brings the mark, the words and the popup. */
export function SignInWithOrangecheck({ onSignedIn, onOutcome, mark, label, appearance, popup, disabled, ...rest }: SignInWithOrangecheckProps) {
    const options = checkSignInOptions({ onSignedIn, onOutcome, mark, label, appearance, popup });
    const [busy, setBusy] = useState(false);

    async function onClick() {
        if (busy || disabled) return;
        setBusy(true);
        // Opened before anything is awaited: a window opened later is blocked.
        const pending = signInWithOcOutcome(popup);
        try {
            const outcome = await pending;
            onOutcome?.(outcome);
            if (outcome.status === 'signed_in') await onSignedIn({ account: outcome.account, token: outcome.token });
        } finally {
            setBusy(false);
        }
    }

    return (
        <button
            {...rest}
            type="button"
            disabled={disabled}
            data-oc-sign-in=""
            data-appearance={options.appearance}
            aria-disabled={busy || undefined}
            aria-busy={busy || undefined}
            onClick={() => void onClick()}
        >
            {options.mark ? <OrangecheckMark variant={options.mark} /> : null}
            <span data-oc-label="">{busy ? SIGN_IN_BUSY_LABEL : options.label}</span>
        </button>
    );
}
