/**
 * React: `<SignInWithOrangecheck>`, a native `<button>` that keeps your site's
 * look (appearance `inherit`, the default) or wears orangecheck's (appearance
 * `brand`, themed by --oc-* custom properties in `@orangecheck/me-client/button.css`).
 * It carries the mark and the words, opens the popup inside the click, and
 * holds the busy state at the same width. `react` is an optional peer: no
 * other entry of this package loads it.
 *
 * @packageDocumentation
 */

import type { ButtonHTMLAttributes } from 'react';

import { OrangecheckMark } from '@orangecheck/mark/react';
import { useRef, useState } from 'react';

import { checkSignInOptions, holdWidth, type EnhanceSignInButtonOptions } from './button';
import { signInWithOcOutcome } from './popup';

export { OUTCOME_COPY, SIGN_IN_BUSY_LABEL, SIGN_IN_LABELS } from './button';
export type { EnhanceSignInButtonOptions, MarkVariant, OcPopupOutcome, OcPopupResult, SignInAppearance, SignInLabel } from './button';

export type SignInWithOrangecheckProps = EnhanceSignInButtonOptions &
    Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'onClick' | 'children' | 'type'>;

/** A "Sign in with orangecheck" button. Your className and style draw it; it brings the mark, the words and the popup. */
export function SignInWithOrangecheck({
    onSignedIn,
    onOutcome,
    mark,
    label,
    busyLabel,
    accessibleLabel,
    appearance,
    popup,
    disabled,
    ...rest
}: SignInWithOrangecheckProps) {
    const options = checkSignInOptions({ onSignedIn, onOutcome, mark, label, busyLabel, accessibleLabel, appearance, popup });
    const [busy, setBusy] = useState(false);
    const ref = useRef<HTMLButtonElement>(null);

    async function onClick() {
        if (busy || disabled) return;
        // Opened before anything is awaited: a window opened later is blocked.
        const pending = signInWithOcOutcome(popup);
        const release = ref.current ? holdWidth(ref.current) : () => {};
        setBusy(true);
        try {
            const outcome = await pending;
            onOutcome?.(outcome);
            if (outcome.status === 'signed_in') await onSignedIn({ account: outcome.account, token: outcome.token });
        } finally {
            setBusy(false);
            release();
        }
    }

    const iconOnly = options.label === false;
    return (
        <button
            {...rest}
            ref={ref}
            type="button"
            disabled={disabled}
            data-oc-sign-in=""
            data-appearance={options.appearance}
            data-label={iconOnly ? 'none' : undefined}
            aria-label={iconOnly ? options.accessibleLabel : rest['aria-label']}
            aria-disabled={busy || undefined}
            aria-busy={busy || undefined}
            onClick={() => void onClick()}
        >
            {options.mark ? <OrangecheckMark variant={options.mark} /> : null}
            {iconOnly ? null : <span data-oc-label="">{busy ? options.busyLabel : options.label}</span>}
        </button>
    );
}
