import * as React from 'react';

import { useOcSession } from './provider';

function shortenAddress(addr: string): string {
    if (addr.length <= 12) return addr;
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function shortenAddressMid(addr: string): string {
    if (addr.length <= 16) return addr;
    return `${addr.slice(0, 8)}…${addr.slice(-6)}`;
}

function isPrefixOf(value: string, target: string): boolean {
    return target.toLowerCase().startsWith(value.toLowerCase());
}

let listboxIdCounter = 0;
function useUniqueId(prefix: string): string {
    const [id] = React.useState(() => `${prefix}-${++listboxIdCounter}`);
    return id;
}

export interface OcAccountChipProps {
    /**
     * URL to the user's account dashboard. Defaults to `https://ochk.io/dashboard`,
     * the canonical family target.
     */
    dashboardUrl?: string;
    /**
     * Override the sign-in URL shown to anonymous visitors. Defaults to
     * the session's `signInUrl` (which points at the auth host's
     * /signin?return_to=… page). Set this to a local path like `'/signin'`
     * when the consumer site mounts its own in-place `<OcSignIn />` —
     * skips the redirect-bounce entirely.
     */
    signInUrl?: string;
    /**
     * Label for the sign-in link shown to anonymous visitors.
     * Defaults to `sign in`.
     */
    signInLabel?: string;
    /** className for the wrapper `<div>`. */
    className?: string;
    /** className for the trigger pill button. */
    triggerClassName?: string;
    /** className for the dropdown popover. */
    popoverClassName?: string;
    /** className for menu items (dashboard link + sign-out button). */
    menuItemClassName?: string;
}

/**
 * Single header-account affordance for every ochk.io subdomain.
 *
 *   anonymous → "sign in" link
 *   signed in → pill `bc1q…7ke3 ▾` that opens a popover with:
 *               • § signed in  (label)
 *               • full address (monospace, break-all)
 *               • → dashboard
 *               • → sign out
 *
 * The popover closes on outside click or Escape. Reasonable inline styles
 * cover the dark-mode default; override per-part via the className props
 * or via the `[data-oc-account-chip-*]` data attributes.
 */
export function OcAccountChip({
    dashboardUrl = 'https://ochk.io/dashboard',
    signInUrl: signInUrlOverride,
    signInLabel = 'sign in',
    className,
    triggerClassName,
    popoverClassName,
    menuItemClassName,
}: OcAccountChipProps): React.ReactElement | null {
    const { status, account, signInUrl: sessionSignInUrl, signOut } = useOcSession();
    const signInUrl = signInUrlOverride ?? sessionSignInUrl;
    const [open, setOpen] = React.useState(false);
    const wrapRef = React.useRef<HTMLDivElement | null>(null);

    React.useEffect(() => {
        if (!open) return;
        function handleClickOutside(e: MouseEvent) {
            if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
                setOpen(false);
            }
        }
        function handleEscape(e: KeyboardEvent) {
            if (e.key === 'Escape') setOpen(false);
        }
        document.addEventListener('mousedown', handleClickOutside);
        document.addEventListener('keydown', handleEscape);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
            document.removeEventListener('keydown', handleEscape);
        };
    }, [open]);

    if (status === 'loading') return null;

    if (status !== 'authenticated' || !account) {
        return (
            <a
                href={signInUrl}
                className={triggerClassName ?? className}
                data-oc-account-chip-signin=""
            >
                {signInLabel}
            </a>
        );
    }

    return (
        <div
            ref={wrapRef}
            className={className}
            data-oc-account-chip=""
            style={{ position: 'relative', display: 'inline-block' }}
        >
            <button
                type="button"
                onClick={() => setOpen((v) => !v)}
                aria-haspopup="menu"
                aria-expanded={open}
                aria-label={`Signed in as ${account.didOc}. Open account menu.`}
                className={triggerClassName}
                data-oc-account-chip-trigger=""
                style={
                    triggerClassName
                        ? undefined
                        : {
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.4rem',
                              padding: '0.25rem 0.625rem',
                              borderRadius: '9999px',
                              border: '1px solid var(--border, #27272a)',
                              background:
                                  'color-mix(in oklch, var(--muted, #27272a) 40%, transparent)',
                              color: 'var(--foreground, #fafafa)',
                              fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                              fontSize: 12,
                              cursor: 'pointer',
                          }
                }
            >
                <span aria-hidden="true" style={{ color: '#22c55e', fontSize: 8 }}>
                    ●
                </span>
                <span>{account.displayName ?? shortenAddress(account.didOc)}</span>
                <svg
                    width="9"
                    height="9"
                    viewBox="0 0 10 10"
                    aria-hidden="true"
                    style={{
                        transition: 'transform 120ms',
                        transform: open ? 'rotate(180deg)' : 'rotate(0)',
                        opacity: 0.6,
                    }}
                >
                    <path
                        d="M2 4 L5 7 L8 4"
                        stroke="currentColor"
                        strokeWidth="1.5"
                        fill="none"
                        strokeLinecap="round"
                    />
                </svg>
            </button>

            {open && (
                <div
                    role="menu"
                    aria-label="Account menu"
                    className={popoverClassName}
                    data-oc-account-chip-popover=""
                    style={
                        popoverClassName
                            ? { position: 'absolute', zIndex: 50, top: 'calc(100% + 6px)', right: 0 }
                            : {
                                  position: 'absolute',
                                  zIndex: 50,
                                  top: 'calc(100% + 6px)',
                                  right: 0,
                                  minWidth: 240,
                                  background: 'var(--popover, #0a0a0a)',
                                  color: 'var(--popover-foreground, #fafafa)',
                                  border: '1px solid var(--border, #27272a)',
                                  boxShadow: '0 10px 32px -4px rgba(0,0,0,0.35)',
                                  fontFamily: 'ui-monospace, SFMono-Regular, monospace',
                              }
                    }
                >
                    <div
                        data-oc-account-chip-header=""
                        style={{
                            padding: '0.75rem 0.75rem 0.625rem',
                            borderBottom: '1px solid var(--border, #27272a)',
                        }}
                    >
                        <div
                            data-oc-account-chip-label=""
                            style={{
                                color: 'var(--primary, #f97316)',
                                fontSize: 10,
                                letterSpacing: '0.18em',
                                textTransform: 'uppercase',
                                marginBottom: 4,
                            }}
                        >
                            § signed in
                        </div>
                        <div
                            data-oc-account-chip-address=""
                            style={{
                                color: 'var(--popover-foreground, #fafafa)',
                                fontSize: 11,
                                wordBreak: 'break-all',
                                lineHeight: 1.35,
                            }}
                        >
                            {account.didOc}
                        </div>
                        {account.displayName ? (
                            <div
                                style={{
                                    color: 'var(--muted-foreground, #a1a1aa)',
                                    fontSize: 10,
                                    marginTop: 4,
                                    letterSpacing: '0.06em',
                                }}
                            >
                                {account.displayName}
                            </div>
                        ) : null}
                    </div>
                    <div role="none" style={{ padding: '0.25rem' }}>
                        {dashboardUrl ? (
                            <a
                                role="menuitem"
                                href={dashboardUrl}
                                onClick={() => setOpen(false)}
                                className={menuItemClassName}
                                data-oc-account-chip-item=""
                                style={
                                    menuItemClassName
                                        ? undefined
                                        : {
                                              display: 'flex',
                                              alignItems: 'center',
                                              gap: '0.5rem',
                                              padding: '0.5rem 0.625rem',
                                              fontSize: 12,
                                              color: 'var(--popover-foreground, #fafafa)',
                                              textDecoration: 'none',
                                              cursor: 'pointer',
                                          }
                                }
                            >
                                <span
                                    aria-hidden="true"
                                    style={{ color: 'var(--muted-foreground, #a1a1aa)' }}
                                >
                                    →
                                </span>
                                <span style={{ flex: 1 }}>dashboard</span>
                                <span
                                    style={{
                                        color: 'var(--muted-foreground, #a1a1aa)',
                                        fontSize: 10,
                                    }}
                                >
                                    ↗
                                </span>
                            </a>
                        ) : null}
                        <button
                            type="button"
                            role="menuitem"
                            onClick={() => {
                                setOpen(false);
                                void signOut();
                            }}
                            className={menuItemClassName}
                            data-oc-account-chip-item=""
                            data-oc-account-chip-signout=""
                            style={
                                menuItemClassName
                                    ? undefined
                                    : {
                                          display: 'flex',
                                          alignItems: 'center',
                                          gap: '0.5rem',
                                          width: '100%',
                                          padding: '0.5rem 0.625rem',
                                          fontSize: 12,
                                          color: 'var(--popover-foreground, #fafafa)',
                                          background: 'transparent',
                                          border: 0,
                                          fontFamily: 'inherit',
                                          textAlign: 'left',
                                          cursor: 'pointer',
                                      }
                            }
                        >
                            <span
                                aria-hidden="true"
                                style={{ color: 'var(--muted-foreground, #a1a1aa)' }}
                            >
                                →
                            </span>
                            <span style={{ flex: 1 }}>sign out</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

export interface OcSignInButtonProps extends React.AnchorHTMLAttributes<HTMLAnchorElement> {
    /** Label shown when no user is signed in. Defaults to `sign in with bitcoin`. */
    label?: string;
    /**
     * When `true`, render an `<a>` even while the session is loading, to
     * avoid layout shift. Defaults to `false` (renders nothing while loading).
     */
    eager?: boolean;
    /**
     * Override the destination URL. Defaults to the session's `signInUrl`
     * (the auth host's redirect-style /signin). Set this to a local path
     * like `'/signin'` when the consumer site has its own in-place
     * `<OcSignIn />` page — keeps the user in-tab.
     */
    signInUrl?: string;
}

/**
 * Drop-in sign-in button. Renders an anchor that points at either:
 *
 *   - the consumer's local `/signin` page (when `signInUrl` prop is set
 *     — recommended; works with `<OcSignIn />`), or
 *   - the auth host's `/signin?return_to=…` (default fallback)
 *
 * When the user is already authenticated it renders nothing.
 */
export function OcSignInButton({
    label = 'sign in with bitcoin',
    eager = false,
    className,
    signInUrl: signInUrlOverride,
    ...rest
}: OcSignInButtonProps): React.ReactElement | null {
    const { status, signInUrl: sessionSignInUrl } = useOcSession();
    const href = signInUrlOverride ?? sessionSignInUrl;
    if (status === 'authenticated') return null;
    if (!eager && status === 'loading') return null;

    return (
        <a
            {...rest}
            href={href}
            className={className}
            data-oc-sign-in-button=""
        >
            {label}
        </a>
    );
}

export interface OcAccountPillProps extends React.HTMLAttributes<HTMLDivElement> {
    /** URL to link the address to. Defaults to the auth origin's `/dashboard`. */
    dashboardUrl?: string;
    /** Override the display text. Defaults to the shortened address. */
    render?: (account: { address: string; displayName?: string | null }) => React.ReactNode;
}

/**
 * Shows the signed-in user as a short pill: `bc1q…abcd  sign out`.
 *
 * Renders nothing while loading or when no user is signed in — pair with
 * `<OcSignInButton>` for the anonymous case.
 */
export function OcAccountPill({
    dashboardUrl,
    render,
    className,
    ...rest
}: OcAccountPillProps): React.ReactElement | null {
    const { status, account, signOut } = useOcSession();

    if (status !== 'authenticated' || !account) return null;

    const label = render
        ? render({ address: account.didOc, displayName: account.displayName })
        : (account.displayName ?? shortenAddress(account.didOc));

    return (
        <div
            {...rest}
            className={className}
            data-oc-account-pill=""
            style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem', ...(rest.style ?? {}) }}
        >
            {dashboardUrl ? (
                <a href={dashboardUrl}>{label}</a>
            ) : (
                <span>{label}</span>
            )}
            <button
                type="button"
                onClick={() => {
                    void signOut();
                }}
                aria-label="Sign out"
                style={{
                    background: 'none',
                    border: 'none',
                    cursor: 'pointer',
                    color: 'inherit',
                    font: 'inherit',
                    padding: 0,
                }}
            >
                sign out
            </button>
        </div>
    );
}

export interface OcAddressInputProps
    extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
    /** Controlled value. */
    value: string;
    /** Called when value changes — typed by the user OR selected from the popover. */
    onValueChange: (value: string) => void;
    /** Label shown above the suggested address in the popover. Defaults to `use your address`. */
    suggestionLabel?: string;
    /** className applied to the wrapper `<div>`. */
    wrapperClassName?: string;
    /** className applied to the suggestion popover. Style with `[data-oc-address-popover]` otherwise. */
    popoverClassName?: string;
    /** className applied to the suggestion button. Style with `[data-oc-address-suggestion]` otherwise. */
    suggestionClassName?: string;
}

/**
 * Bitcoin-address `<input>` that, when the user is signed in via `oc_session`,
 * surfaces their address as a one-click suggestion on focus.
 *
 * Behaviour:
 * - On focus, if logged-in AND the typed value is a prefix of the session
 *   address (or empty), show a small popover with `bc1q…7ke3` as a clickable
 *   suggestion.
 * - Click / Enter on the suggestion fills the field with the full address.
 * - Down-arrow from the input highlights the suggestion; Up-arrow clears the
 *   highlight; Escape closes the popover; clicking outside closes the popover.
 * - When the user types something that's no longer a prefix of the session
 *   address, the popover hides itself out of the way.
 * - When the field already contains the session address exactly, no popover.
 *
 * Style-agnostic: minimal inline styles for positioning only. Style the parts
 * via `wrapperClassName` / `popoverClassName` / `suggestionClassName`, or via
 * the `[data-oc-address-input]`, `[data-oc-address-popover]`, and
 * `[data-oc-address-suggestion]` data attributes.
 */
export interface UseOcAddressSuggestionOptions {
    /** Current value of the input. */
    value: string;
    /** Called when the user selects the suggestion (or you may also call it from the input's onChange). */
    onValueChange: (value: string) => void;
    /** Label shown above the suggested address in the popover. Defaults to `use your address`. */
    suggestionLabel?: string;
    /** className applied to the suggestion popover. Style with `[data-oc-address-popover]` otherwise. */
    popoverClassName?: string;
    /** className applied to the suggestion button. Style with `[data-oc-address-suggestion]` otherwise. */
    suggestionClassName?: string;
}

export interface UseOcAddressSuggestionReturn {
    /**
     * Props to spread onto your `<input>` element. Adds focus/blur/keydown
     * handlers and the combobox ARIA attributes. Combine with your existing
     * `value`/`onChange` props — this hook does NOT control them.
     */
    inputProps: {
        onFocus: (e: React.FocusEvent<HTMLInputElement>) => void;
        onBlur: (e: React.FocusEvent<HTMLInputElement>) => void;
        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => void;
        role: 'combobox';
        'aria-haspopup': 'listbox';
        'aria-expanded': boolean;
        'aria-controls': string | undefined;
        'aria-activedescendant': string | undefined;
        autoComplete: 'off';
        spellCheck: false;
    };
    /**
     * The suggestion popover. Render directly after your `<input>`, inside a
     * `position: relative` container so the popover anchors below the input.
     * Returns `null` when there's no suggestion to show.
     */
    popover: React.ReactNode;
}

/**
 * Hook variant of `OcAddressInput`. Use when you want to keep your existing
 * styled `<input>` (e.g. shadcn `<Input>`) and just bolt on the
 * session-address suggestion behaviour.
 *
 * Wrap your input in a `position: relative` container, spread `inputProps`
 * onto the input, and render `{popover}` immediately after. The hook's
 * focus / blur / keydown handlers are composed via `inputProps` — they call
 * any handlers you've already passed to your input only when you wire them
 * yourself in addition to spreading `inputProps`.
 *
 * Example:
 * ```tsx
 * const { inputProps, popover } = useOcAddressSuggestion({
 *     value: addr,
 *     onValueChange: setAddr,
 * });
 * return (
 *     <div className="relative">
 *         <Input
 *             value={addr}
 *             onChange={(e) => setAddr(e.target.value)}
 *             {...inputProps}
 *             placeholder="bc1q…"
 *         />
 *         {popover}
 *     </div>
 * );
 * ```
 */
export function useOcAddressSuggestion(
    options: UseOcAddressSuggestionOptions
): UseOcAddressSuggestionReturn {
    const {
        value,
        onValueChange,
        suggestionLabel = 'use your address',
        popoverClassName,
        suggestionClassName,
    } = options;

    const { status, account } = useOcSession();
    const sessionAddress = status === 'authenticated' ? (account?.primaryBtc ?? null) : null;

    const [open, setOpen] = React.useState(false);
    const [highlighted, setHighlighted] = React.useState(false);
    const blurTimer = React.useRef<number | null>(null);

    const listboxId = useUniqueId('oc-addr-listbox');
    const optionId = `${listboxId}-opt`;

    const valueMatchesSession =
        sessionAddress != null && value.toLowerCase() === sessionAddress.toLowerCase();
    const canSuggest =
        sessionAddress != null &&
        sessionAddress.length > 0 &&
        !valueMatchesSession &&
        isPrefixOf(value, sessionAddress);
    const showPopover = open && canSuggest;

    function selectSuggestion() {
        if (!sessionAddress) return;
        onValueChange(sessionAddress);
        setOpen(false);
        setHighlighted(false);
    }

    React.useEffect(() => {
        return () => {
            if (blurTimer.current != null) window.clearTimeout(blurTimer.current);
        };
    }, []);

    const inputProps: UseOcAddressSuggestionReturn['inputProps'] = {
        onFocus: () => {
            if (blurTimer.current != null) {
                window.clearTimeout(blurTimer.current);
                blurTimer.current = null;
            }
            setOpen(true);
        },
        onBlur: () => {
            blurTimer.current = window.setTimeout(() => {
                setOpen(false);
                setHighlighted(false);
            }, 120);
        },
        onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
            if (!showPopover) return;
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setHighlighted(true);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setHighlighted(false);
            } else if (e.key === 'Escape') {
                e.preventDefault();
                setOpen(false);
                setHighlighted(false);
            } else if (e.key === 'Enter' && highlighted) {
                e.preventDefault();
                selectSuggestion();
            }
        },
        role: 'combobox',
        'aria-haspopup': 'listbox',
        'aria-expanded': showPopover,
        'aria-controls': showPopover ? listboxId : undefined,
        'aria-activedescendant': highlighted ? optionId : undefined,
        autoComplete: 'off',
        spellCheck: false,
    };

    const popover = showPopover && sessionAddress ? (
        <div
            id={listboxId}
            role="listbox"
            data-oc-address-popover=""
            className={popoverClassName}
            style={{
                position: 'absolute',
                zIndex: 50,
                top: 'calc(100% + 4px)',
                left: 0,
                right: 0,
            }}
            onMouseDown={(e) => e.preventDefault()}
        >
            <button
                type="button"
                id={optionId}
                role="option"
                aria-selected={highlighted}
                data-oc-address-suggestion=""
                data-highlighted={highlighted ? '' : undefined}
                className={suggestionClassName}
                onClick={selectSuggestion}
                onMouseEnter={() => setHighlighted(true)}
                onMouseLeave={() => setHighlighted(false)}
                style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: '0.75rem',
                    width: '100%',
                    textAlign: 'left',
                    cursor: 'pointer',
                    font: 'inherit',
                    background: 'inherit',
                    color: 'inherit',
                    border: 0,
                    padding: 'inherit',
                }}
            >
                <span data-oc-address-suggestion-label="">{suggestionLabel}</span>
                <span
                    data-oc-address-suggestion-value=""
                    style={{ fontFamily: 'ui-monospace, monospace' }}
                >
                    {shortenAddressMid(sessionAddress)}
                </span>
            </button>
        </div>
    ) : null;

    return { inputProps, popover };
}

export const OcAddressInput = React.forwardRef<HTMLInputElement, OcAddressInputProps>(
    function OcAddressInput(
        {
            value,
            onValueChange,
            suggestionLabel = 'use your address',
            wrapperClassName,
            popoverClassName,
            suggestionClassName,
            onFocus,
            onBlur,
            onKeyDown,
            ...rest
        },
        forwardedRef
    ): React.ReactElement {
        const { status, account } = useOcSession();
        const sessionAddress = status === 'authenticated' ? (account?.primaryBtc ?? null) : null;

        const [open, setOpen] = React.useState(false);
        const [highlighted, setHighlighted] = React.useState(false);

        const innerRef = React.useRef<HTMLInputElement | null>(null);
        const setRef = (node: HTMLInputElement | null) => {
            innerRef.current = node;
            if (typeof forwardedRef === 'function') forwardedRef(node);
            else if (forwardedRef) forwardedRef.current = node;
        };
        const blurTimer = React.useRef<number | null>(null);

        const listboxId = useUniqueId('oc-addr-listbox');
        const optionId = `${listboxId}-opt`;

        const valueMatchesSession =
            sessionAddress != null && value.toLowerCase() === sessionAddress.toLowerCase();
        const canSuggest =
            sessionAddress != null &&
            sessionAddress.length > 0 &&
            !valueMatchesSession &&
            isPrefixOf(value, sessionAddress);
        const showPopover = open && canSuggest;

        function selectSuggestion() {
            if (!sessionAddress) return;
            onValueChange(sessionAddress);
            setOpen(false);
            setHighlighted(false);
            // Re-focus so the next Tab moves on naturally.
            innerRef.current?.focus();
        }

        function handleFocus(e: React.FocusEvent<HTMLInputElement>) {
            if (blurTimer.current != null) {
                window.clearTimeout(blurTimer.current);
                blurTimer.current = null;
            }
            setOpen(true);
            onFocus?.(e);
        }

        function handleBlur(e: React.FocusEvent<HTMLInputElement>) {
            // Defer close so a click on the suggestion can register first.
            blurTimer.current = window.setTimeout(() => {
                setOpen(false);
                setHighlighted(false);
            }, 120);
            onBlur?.(e);
        }

        function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
            if (showPopover) {
                if (e.key === 'ArrowDown') {
                    e.preventDefault();
                    setHighlighted(true);
                } else if (e.key === 'ArrowUp') {
                    e.preventDefault();
                    setHighlighted(false);
                } else if (e.key === 'Escape') {
                    e.preventDefault();
                    setOpen(false);
                    setHighlighted(false);
                } else if (e.key === 'Enter' && highlighted) {
                    e.preventDefault();
                    selectSuggestion();
                }
            }
            onKeyDown?.(e);
        }

        React.useEffect(() => {
            return () => {
                if (blurTimer.current != null) window.clearTimeout(blurTimer.current);
            };
        }, []);

        return (
            <div
                data-oc-address-input=""
                className={wrapperClassName}
                style={{ position: 'relative' }}
            >
                <input
                    {...rest}
                    ref={setRef}
                    value={value}
                    onChange={(e) => onValueChange(e.target.value)}
                    onFocus={handleFocus}
                    onBlur={handleBlur}
                    onKeyDown={handleKeyDown}
                    role="combobox"
                    aria-haspopup="listbox"
                    aria-expanded={showPopover}
                    aria-controls={showPopover ? listboxId : undefined}
                    aria-activedescendant={highlighted ? optionId : undefined}
                    autoComplete="off"
                    spellCheck={false}
                />
                {showPopover && sessionAddress && (
                    <div
                        id={listboxId}
                        role="listbox"
                        data-oc-address-popover=""
                        className={popoverClassName}
                        style={{
                            position: 'absolute',
                            zIndex: 50,
                            top: 'calc(100% + 4px)',
                            left: 0,
                            right: 0,
                        }}
                        // Prevent the input from blurring before the click on the suggestion lands.
                        onMouseDown={(e) => e.preventDefault()}
                    >
                        <button
                            type="button"
                            id={optionId}
                            role="option"
                            aria-selected={highlighted}
                            data-oc-address-suggestion=""
                            data-highlighted={highlighted ? '' : undefined}
                            className={suggestionClassName}
                            onClick={selectSuggestion}
                            onMouseEnter={() => setHighlighted(true)}
                            onMouseLeave={() => setHighlighted(false)}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '0.75rem',
                                width: '100%',
                                textAlign: 'left',
                                cursor: 'pointer',
                                font: 'inherit',
                                background: 'inherit',
                                color: 'inherit',
                                border: 'inherit',
                                padding: 'inherit',
                            }}
                        >
                            <span data-oc-address-suggestion-label="">{suggestionLabel}</span>
                            <span
                                data-oc-address-suggestion-value=""
                                style={{ fontFamily: 'ui-monospace, monospace' }}
                            >
                                {shortenAddressMid(sessionAddress)}
                            </span>
                        </button>
                    </div>
                )}
            </div>
        );
    }
);
