'use client';

/**
 * @orangecheck/auth-client · OcLinkedIdentities
 *
 * The shared linked-identities management surface for every `X.ochk.io`
 * consumer. A signed-in user sees their linked email + Bitcoin address,
 * can reveal/hide each raw value, unlink a non-primary identity, and
 * link a new one. Linking a Bitcoin address that's already on another
 * OC account offers a dual-proof transfer; the same is now true for
 * email (auth host F4). Consolidated (`merged_from`) accounts render in
 * a tombstone panel.
 *
 * This generalizes me.ochk.io's bespoke `LinkedIdentitiesPanel` so
 * linking is no longer a single-product, one-tab feature — any family
 * site can drop in `<OcLinkedIdentities />`. See AUTH-PLAN.md §5.
 *
 * All endpoints live on the auth host (`ochk.io`); calls are
 * cross-origin with `credentials: 'include'` and rely on the auth
 * host's family-CORS — the same posture `OcSignIn` uses. No local
 * proxy route is needed (AUTH-AUDIT.md F6: direct-to-host is the
 * intended design).
 *
 * Style: inline, CSS-variable-themed (same approach as `OcSignIn`), so
 * the component carries zero CSS dependency and themes to each site.
 * Every block carries a `data-oc-li-*` attribute so a site may
 * override via its own stylesheet.
 */

import * as React from 'react';

const DEFAULT_AUTH_ORIGIN = 'https://ochk.io';

/* --- types --- */

export interface OcLinkedIdentity {
    id: string;
    kind: 'email' | 'btc';
    /** Raw value · null when the identity is pending recovery. */
    value: string | null;
    verified_at: string | null;
    verification_method: 'email-otp' | 'bip322' | null;
    /** The signup-time identity for its kind · cannot be unlinked here. */
    is_primary: boolean;
}

interface MergedFromEntry {
    did_oc: string;
    created_at: string;
    last_signed_in_at: string | null;
}

interface IdentitiesResp {
    ok: boolean;
    account_id?: string;
    did_oc?: string | null;
    linked?: OcLinkedIdentity[];
    merged_from?: MergedFromEntry[];
    reason?: string;
}

/**
 * Fetch the signed-in user's linked identities from the auth host —
 * the same data `<OcLinkedIdentities>` renders, exposed as a plain
 * function for surfaces that need the list without the full
 * management UI (notably `<OcAccountMenu>`'s badge-identity promote
 * list). Returns `[]` when anonymous; throws on network / server
 * error so the caller can show a deferred state.
 */
export async function fetchOcLinkedIdentities(opts?: {
    authOrigin?: string;
}): Promise<OcLinkedIdentity[]> {
    const authOrigin = opts?.authOrigin ?? DEFAULT_AUTH_ORIGIN;
    const r = await fetch(`${authOrigin}/api/auth/identities`, {
        credentials: 'include',
    });
    if (r.status === 401) return [];
    if (!r.ok) throw new Error(`identities fetch failed: http_${r.status}`);
    const body = (await r.json()) as IdentitiesResp;
    return body.linked ?? [];
}

export interface OcLinkedIdentitiesProps {
    /** Auth host origin. Defaults to `https://ochk.io`. */
    authOrigin?: string;
    /** Outer container className. */
    className?: string;
    /** Called after every successful link / unlink / transfer. */
    onChange?: () => void;
}

/* --- main --- */

export function OcLinkedIdentities({
    authOrigin = DEFAULT_AUTH_ORIGIN,
    className,
    onChange,
}: OcLinkedIdentitiesProps): React.ReactElement {
    const [resp, setResp] = React.useState<IdentitiesResp | null>(null);
    const [error, setError] = React.useState<string | null>(null);
    const [showEmailLink, setShowEmailLink] = React.useState(false);
    const [showBtcLink, setShowBtcLink] = React.useState(false);

    const refresh = React.useCallback(async () => {
        setError(null);
        try {
            const r = await fetch(`${authOrigin}/api/auth/identities`, {
                credentials: 'include',
            });
            if (!r.ok) {
                if (r.status === 401) {
                    setError('not signed in');
                    return;
                }
                throw new Error(`http_${r.status}`);
            }
            setResp((await r.json()) as IdentitiesResp);
        } catch (e) {
            setError(e instanceof Error ? e.message : 'load failed');
        }
    }, [authOrigin]);

    React.useEffect(() => {
        void refresh();
    }, [refresh]);

    const afterChange = React.useCallback(() => {
        setShowEmailLink(false);
        setShowBtcLink(false);
        void refresh();
        onChange?.();
    }, [refresh, onChange]);

    if (error) {
        return (
            <div className={className} data-oc-li="" style={panelStyle('warn')} role="alert">
                <SectionLabel tone="warn">§ identities · load deferred</SectionLabel>
                <p style={bodyStyle}>
                    Couldn&apos;t reach the auth host ({error}). Linking is temporarily
                    unavailable; your signed-in identity still works as normal.
                </p>
                <button type="button" onClick={() => void refresh()} style={ghostBtnStyle(false)}>
                    retry
                </button>
            </div>
        );
    }

    if (!resp) {
        return (
            <div className={className} data-oc-li="" style={panelStyle()}>
                <span style={hintStyle}>{'> '}loading…</span>
            </div>
        );
    }

    const linked = resp.linked ?? [];
    const emailRows = linked.filter((i) => i.kind === 'email');
    const btcRows = linked.filter((i) => i.kind === 'btc');
    const hasEmail = emailRows.some((i) => i.value);
    const hasBtc = btcRows.some((i) => i.value);
    const mergedFrom = resp.merged_from ?? [];

    return (
        <div className={className} data-oc-li="" style={{ display: 'grid', gap: 16 }}>
            <div style={panelStyle()}>
                <SectionLabel>§ what this is</SectionLabel>
                <p style={bodyStyle}>
                    Your public identity is the opaque <code style={codeStyle}>did:oc:</code> DID.
                    Below it sit your private linked identities — your email and your Bitcoin
                    address. They never appear in dashboard chrome and never reach an integrator
                    unless you grant the matching scope. Linking a second identity is also your
                    account-recovery path: if you lose one, the other still signs you in.
                </p>
            </div>

            {mergedFrom.length > 0 && <ConsolidationPanel entries={mergedFrom} />}

            <div style={panelStyle('plain')} data-oc-li-rows="">
                <IdentityGroup
                    kind="email"
                    title="email"
                    rows={emailRows}
                    authOrigin={authOrigin}
                    onChange={afterChange}
                    addCta={hasEmail ? null : 'link an email'}
                    onAdd={() => {
                        setShowEmailLink((v) => !v);
                        setShowBtcLink(false);
                    }}
                />
                <div style={{ borderTop: `1px solid ${V.border}` }} />
                <IdentityGroup
                    kind="btc"
                    title="bitcoin address"
                    rows={btcRows}
                    authOrigin={authOrigin}
                    onChange={afterChange}
                    addCta={hasBtc ? null : 'link a Bitcoin address'}
                    onAdd={() => {
                        setShowBtcLink((v) => !v);
                        setShowEmailLink(false);
                    }}
                />
            </div>

            {showEmailLink && (
                <EmailLinkForm
                    authOrigin={authOrigin}
                    onDone={afterChange}
                    onCancel={() => setShowEmailLink(false)}
                />
            )}
            {showBtcLink && (
                <BtcLinkForm
                    authOrigin={authOrigin}
                    didOc={resp.did_oc ?? null}
                    onDone={afterChange}
                    onCancel={() => setShowBtcLink(false)}
                />
            )}

            {hasBtc && <AttestationLink />}
        </div>
    );
}

/* --- identity group (rows for one kind, or an empty-state add CTA) --- */

function IdentityGroup({
    kind,
    title,
    rows,
    authOrigin,
    onChange,
    addCta,
    onAdd,
}: {
    kind: 'email' | 'btc';
    title: string;
    rows: OcLinkedIdentity[];
    authOrigin: string;
    onChange: () => void;
    addCta: string | null;
    onAdd: () => void;
}): React.ReactElement {
    if (rows.length === 0) {
        return (
            <div style={rowStyle}>
                <div>
                    <div style={rowLabelStyle}>§ {title}</div>
                    <div style={{ ...bodyStyle, marginTop: 4 }}>none linked</div>
                </div>
                {addCta && (
                    <button type="button" onClick={onAdd} style={primaryChipStyle}>
                        + {addCta}
                    </button>
                )}
            </div>
        );
    }
    return (
        <>
            {rows.map((r) => (
                <IdentityRow
                    key={r.id}
                    row={r}
                    kind={kind}
                    authOrigin={authOrigin}
                    onChange={onChange}
                />
            ))}
        </>
    );
}

/* --- single identity row --- */

function IdentityRow({
    row,
    kind,
    authOrigin,
    onChange,
}: {
    row: OcLinkedIdentity;
    kind: 'email' | 'btc';
    authOrigin: string;
    onChange: () => void;
}): React.ReactElement {
    const [shown, setShown] = React.useState(false);
    const [confirming, setConfirming] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);

    const masked = row.value ? mask(row.value, kind) : '— pending recovery —';
    const display = shown && row.value ? row.value : masked;

    async function unlink(): Promise<void> {
        if (row.is_primary) return;
        setBusy(true);
        setErr(null);
        try {
            const r = await fetch(
                `${authOrigin}/api/auth/identities?id=${encodeURIComponent(row.id)}`,
                { method: 'DELETE', credentials: 'include' }
            );
            if (!r.ok) {
                const j = (await r.json().catch(() => ({}))) as { reason?: string };
                throw new Error(j.reason ?? `http_${r.status}`);
            }
            onChange();
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'unlink failed');
            setBusy(false);
            setConfirming(false);
        }
    }

    return (
        <div style={rowStyle} data-oc-li-row={kind}>
            <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px 12px' }}>
                    <span style={rowLabelStyle}>
                        § {kind === 'email' ? 'email' : 'bitcoin address'}
                    </span>
                    {row.is_primary && (
                        <span style={{ ...rowLabelStyle, color: V.primary }}>
                            primary · signup-time
                        </span>
                    )}
                </div>
                <div
                    style={{
                        marginTop: 4,
                        color: V.foreground,
                        fontFamily: MONO,
                        fontSize: 12,
                        wordBreak: 'break-all',
                    }}
                >
                    {display}
                </div>
                {row.verified_at && (
                    <div style={{ ...hintStyle, marginTop: 4 }}>
                        verified · {new Date(row.verified_at).toUTCString()}
                    </div>
                )}
                {err && <ErrorLine>{err}</ErrorLine>}
            </div>
            <div style={{ display: 'flex', flexShrink: 0, gap: 8, flexWrap: 'wrap' }}>
                {row.value && (
                    <button
                        type="button"
                        onClick={() => setShown((s) => !s)}
                        style={ghostBtnStyle(false)}
                    >
                        {shown ? 'hide' : 'show'}
                    </button>
                )}
                {!row.is_primary && !confirming && (
                    <button
                        type="button"
                        onClick={() => setConfirming(true)}
                        style={dangerBtnStyle(false)}
                    >
                        unlink
                    </button>
                )}
                {!row.is_primary && confirming && (
                    <>
                        <button
                            type="button"
                            onClick={() => void unlink()}
                            disabled={busy}
                            style={dangerBtnStyle(busy)}
                        >
                            {busy ? 'unlinking…' : 'confirm unlink'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setConfirming(false)}
                            disabled={busy}
                            style={ghostBtnStyle(busy)}
                        >
                            cancel
                        </button>
                    </>
                )}
            </div>
        </div>
    );
}

/* --- consolidated-accounts tombstone panel --- */

function ConsolidationPanel({ entries }: { entries: MergedFromEntry[] }): React.ReactElement {
    return (
        <div style={panelStyle('success')} data-oc-li-consolidated="">
            <SectionLabel tone="success">
                § consolidated accounts · {entries.length}
            </SectionLabel>
            <p style={bodyStyle}>
                {entries.length === 1 ? 'A previous OC account' : 'Previous OC accounts'} you
                signed up with, folded into this one under dual proof of control. Historical
                activity is unioned into this account automatically;{' '}
                {entries.length === 1 ? 'it' : 'they'} can no longer sign in.
            </p>
            <ul style={{ listStyle: 'none', margin: '12px 0 0', padding: 0 }}>
                {entries.map((e) => (
                    <li
                        key={e.did_oc}
                        style={{
                            display: 'flex',
                            flexWrap: 'wrap',
                            gap: 8,
                            padding: '8px 0',
                            borderTop: `1px solid ${V.border}`,
                            fontFamily: MONO,
                            fontSize: 11,
                        }}
                    >
                        <code style={{ color: V.foreground, wordBreak: 'break-all' }}>
                            {e.did_oc}
                        </code>
                        <span style={{ ...hintStyle, marginLeft: 'auto' }}>
                            created {new Date(e.created_at).toLocaleDateString()}
                        </span>
                    </li>
                ))}
            </ul>
        </div>
    );
}

/* --- portable-attestation pointer --- */

/**
 * A thin pointer to the OC Attest builder. The portable, self-sovereign
 * form of identity linking is a standard OrangeCheck attestation — one
 * BIP-322 signature by the Bitcoin address binding it to its handles,
 * published to Nostr. That ceremony already lives at
 * `attest.ochk.io/create` (which pre-fills the address from the signed-in
 * session); this panel routes the user there rather than re-implementing
 * it. Shown once the account has a linked Bitcoin address to attest with.
 */
function AttestationLink(): React.ReactElement {
    return (
        <div style={panelStyle()} data-oc-li-attest="">
            <SectionLabel>§ portable attestation</SectionLabel>
            <p style={bodyStyle}>
                Make your identity links portable: publish a standard OrangeCheck
                attestation — one Bitcoin-wallet signature (BIP-322) binding your address
                to your handles (Nostr, GitHub, …). It is published to Nostr and verifies
                with zero trust in OrangeCheck, so it outlives any single service.
            </p>
            <a
                href="https://attest.ochk.io/create"
                target="_blank"
                rel="noreferrer"
                style={{ ...primaryChipStyle, textDecoration: 'none', display: 'inline-block' }}
                data-oc-li-attest-link=""
            >
                open the attestation builder ↗
            </a>
        </div>
    );
}

/* --- post-sign-in link prompt (used by OcSignIn) --- */

/**
 * Shown by `<OcSignIn>` after a successful sign-in *when the user ticked
 * the "also link my other identity" checkbox on the sign-in form*. It runs
 * the complementary identity's link ceremony inline — BIP-322 for a
 * Bitcoin address, OTP for an email.
 *
 * Skipping is first-class: even though the user opted in at the form, they
 * may change their mind here — an explicit "skip, I'll do this later"
 * control exits cleanly and tells them where to link later. `onResolved`
 * (linked, or skipped) hands control back to OcSignIn's post-sign-in
 * navigation.
 */
export function LinkPromptStep({
    method,
    didOc,
    authOrigin,
    onResolved,
}: {
    /** The complementary identity to link — the opposite of the sign-in method. */
    method: 'btc' | 'email';
    didOc: string;
    authOrigin: string;
    /** Called once the user has linked the identity, or skipped. */
    onResolved: () => void;
}): React.ReactElement {
    const what = method === 'btc' ? 'a Bitcoin address' : 'an email';
    return (
        <div data-oc-linkprompt={method}>
            <div style={{ ...panelStyle('success'), marginBottom: 16 }}>
                <SectionLabel tone="success">§ signed in</SectionLabel>
                <p style={{ ...bodyStyle, margin: 0 }}>
                    You chose to also link {what}. Complete it below — or skip for now; it is
                    entirely optional and changes nothing about the sign-in you just completed.
                </p>
            </div>
            {method === 'btc' ? (
                <BtcLinkForm
                    authOrigin={authOrigin}
                    didOc={didOc}
                    onDone={onResolved}
                    onCancel={onResolved}
                />
            ) : (
                <EmailLinkForm authOrigin={authOrigin} onDone={onResolved} onCancel={onResolved} />
            )}
            <div
                data-oc-linkprompt-skip=""
                style={{ marginTop: 14, paddingTop: 14, borderTop: `1px solid ${V.border}` }}
            >
                <button type="button" onClick={onResolved} style={ghostBtnStyle(false)}>
                    skip — I&apos;ll do this later
                </button>
                <p style={{ ...hintStyle, marginTop: 8 }}>
                    {'> '}Changed your mind? Skipping continues you straight on — your sign-in is
                    unaffected. You can link {what} anytime later from your identity page,{' '}
                    me.ochk.io/me/identity.
                </p>
            </div>
        </div>
    );
}

/* --- email link form --- */

function EmailLinkForm({
    authOrigin,
    onDone,
    onCancel,
}: {
    authOrigin: string;
    onDone: () => void;
    onCancel: () => void;
}): React.ReactElement {
    const [step, setStep] = React.useState<'email' | 'code'>('email');
    const [email, setEmail] = React.useState('');
    const [code, setCode] = React.useState('');
    const [token, setToken] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);
    // Set when the auth host reports the email is linked elsewhere — the
    // user can confirm a dual-proof transfer (session + verified OTP).
    const [transfer, setTransfer] = React.useState(false);

    async function start(): Promise<void> {
        setBusy(true);
        setErr(null);
        try {
            const r = await fetch(`${authOrigin}/api/auth/email-otp/start`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: email.trim().toLowerCase() }),
            });
            const j = (await r.json()) as { ok?: boolean; token?: string; reason?: string };
            if (!r.ok || !j.token) throw new Error(j.reason ?? `http_${r.status}`);
            setToken(j.token);
            setStep('code');
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'could not send code');
        } finally {
            setBusy(false);
        }
    }

    async function verify(confirmTransfer: boolean): Promise<void> {
        setBusy(true);
        setErr(null);
        try {
            const r = await fetch(`${authOrigin}/api/auth/link/email`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    email: email.trim().toLowerCase(),
                    code: code.trim(),
                    token,
                    ...(confirmTransfer ? { confirm_transfer: true } : {}),
                }),
            });
            const j = (await r.json()) as { ok?: boolean; reason?: string };
            if (r.status === 409 && j.reason === 'email_linked_elsewhere') {
                setTransfer(true);
                setBusy(false);
                return;
            }
            if (!r.ok || !j.ok) throw new Error(j.reason ?? `http_${r.status}`);
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'link failed');
            setBusy(false);
        }
    }

    return (
        <div style={panelStyle('accent')} data-oc-li-form="email">
            <SectionLabel>§ link an email</SectionLabel>
            {step === 'email' ? (
                <>
                    <input
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="you@example.com"
                        style={inputStyle}
                    />
                    {err && <ErrorLine>{err}</ErrorLine>}
                    <FormButtons>
                        <button
                            type="button"
                            onClick={() => void start()}
                            disabled={busy || email.trim().length < 5}
                            style={primaryBtnStyle(busy || email.trim().length < 5)}
                        >
                            {busy ? 'sending…' : 'send code'}
                        </button>
                        <button type="button" onClick={onCancel} style={ghostBtnStyle(busy)}>
                            cancel
                        </button>
                    </FormButtons>
                </>
            ) : transfer ? (
                <TransferConfirm
                    what="email"
                    busy={busy}
                    onConfirm={() => void verify(true)}
                    onCancel={onCancel}
                    err={err}
                />
            ) : (
                <>
                    <p style={bodyStyle}>Enter the 6-digit code sent to {email}.</p>
                    <input
                        type="text"
                        inputMode="numeric"
                        autoComplete="one-time-code"
                        maxLength={6}
                        value={code}
                        onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                        placeholder="123456"
                        style={{ ...inputStyle, letterSpacing: '0.3em' }}
                    />
                    {err && <ErrorLine>{err}</ErrorLine>}
                    <FormButtons>
                        <button
                            type="button"
                            onClick={() => void verify(false)}
                            disabled={busy || code.length !== 6}
                            style={primaryBtnStyle(busy || code.length !== 6)}
                        >
                            {busy ? 'linking…' : 'verify + link'}
                        </button>
                        <button
                            type="button"
                            onClick={() => setStep('email')}
                            disabled={busy}
                            style={ghostBtnStyle(busy)}
                        >
                            back
                        </button>
                    </FormButtons>
                </>
            )}
        </div>
    );
}

/* --- btc link form --- */

function BtcLinkForm({
    authOrigin,
    didOc,
    onDone,
    onCancel,
}: {
    authOrigin: string;
    didOc: string | null;
    onDone: () => void;
    onCancel: () => void;
}): React.ReactElement {
    const [step, setStep] = React.useState<'request' | 'sign'>('request');
    const [addr, setAddr] = React.useState('');
    const [challenge, setChallenge] = React.useState('');
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);
    // Holds the signature awaiting transfer confirmation when the
    // address is already linked to another account.
    const [pendingSig, setPendingSig] = React.useState<string | null>(null);

    async function getChallenge(): Promise<void> {
        if (!didOc) {
            setErr('session not loaded yet · refresh and retry');
            return;
        }
        setBusy(true);
        setErr(null);
        try {
            // /api/challenge is a public primitive — no session needed.
            // audience MUST be the caller's did_oc: the link endpoint
            // verifies expectedAudience=session.did_oc, so a signature
            // obtained here can't be replayed against another account.
            const r = await fetch(
                `${authOrigin}/api/challenge?addr=${encodeURIComponent(addr)}` +
                    `&purpose=link&audience=${encodeURIComponent(didOc)}`
            );
            const j = (await r.json()) as { message?: string; reason?: string };
            if (!r.ok || !j.message) throw new Error(j.reason ?? `http_${r.status}`);
            setChallenge(j.message);
            setStep('sign');
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'challenge failed');
        } finally {
            setBusy(false);
        }
    }

    async function postLink(sig: string, confirmTransfer: boolean): Promise<void> {
        setBusy(true);
        setErr(null);
        try {
            const r = await fetch(`${authOrigin}/api/auth/link/btc`, {
                method: 'POST',
                credentials: 'include',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message: challenge,
                    signature: sig,
                    ...(confirmTransfer ? { confirm_transfer: true } : {}),
                }),
            });
            const j = (await r.json()) as { ok?: boolean; reason?: string };
            if (r.status === 409 && j.reason === 'address_linked_elsewhere') {
                setPendingSig(sig);
                setBusy(false);
                return;
            }
            if (!r.ok || !j.ok) throw new Error(j.reason ?? `http_${r.status}`);
            onDone();
        } catch (e) {
            setErr(e instanceof Error ? e.message : 'link failed');
            setBusy(false);
        }
    }

    return (
        <div style={panelStyle('accent')} data-oc-li-form="btc">
            <SectionLabel>§ link a Bitcoin address</SectionLabel>
            {step === 'request' ? (
                <>
                    <p style={bodyStyle}>
                        Enter a Bitcoin address you control. We generate a challenge and your
                        wallet signs it (BIP-322).
                    </p>
                    <input
                        type="text"
                        value={addr}
                        onChange={(e) => setAddr(e.target.value.trim())}
                        placeholder="bc1q…"
                        autoCapitalize="none"
                        spellCheck={false}
                        style={{ ...inputStyle, fontFamily: MONO }}
                    />
                    {err && <ErrorLine>{err}</ErrorLine>}
                    <FormButtons>
                        <button
                            type="button"
                            onClick={() => void getChallenge()}
                            disabled={busy || addr.length < 14}
                            style={primaryBtnStyle(busy || addr.length < 14)}
                        >
                            {busy ? 'requesting…' : 'get challenge'}
                        </button>
                        <button type="button" onClick={onCancel} style={ghostBtnStyle(busy)}>
                            cancel
                        </button>
                    </FormButtons>
                </>
            ) : pendingSig ? (
                <TransferConfirm
                    what="bitcoin address"
                    busy={busy}
                    onConfirm={() => void postLink(pendingSig, true)}
                    onCancel={onCancel}
                    err={err}
                />
            ) : (
                <>
                    <p style={bodyStyle}>
                        Sign the challenge with the wallet that controls{' '}
                        <span style={{ fontFamily: MONO, wordBreak: 'break-all' }}>{addr}</span>.
                    </p>
                    <LazyWalletButton
                        address={addr}
                        message={challenge}
                        showManual
                        layout="list"
                        heading={null}
                        onSigned={(sig: string) => void postLink(sig, false)}
                        onError={(e: { message?: string }) =>
                            setErr(e?.message ?? 'wallet rejected')
                        }
                    />
                    {err && <ErrorLine>{err}</ErrorLine>}
                    <FormButtons>
                        <button
                            type="button"
                            onClick={() => {
                                setStep('request');
                                setErr(null);
                            }}
                            disabled={busy}
                            style={ghostBtnStyle(busy)}
                        >
                            back
                        </button>
                    </FormButtons>
                </>
            )}
        </div>
    );
}

/* --- transfer-under-dual-proof confirm --- */

function TransferConfirm({
    what,
    busy,
    onConfirm,
    onCancel,
    err,
}: {
    what: string;
    busy: boolean;
    onConfirm: () => void;
    onCancel: () => void;
    err: string | null;
}): React.ReactElement {
    return (
        <>
            <p style={bodyStyle}>
                This {what} is already linked to another OrangeCheck account. You&apos;ve just
                proven control of it — you can transfer the link to this account under dual proof
                of control. The other account loses this sign-in path; its history stays
                verifiable. Continue?
            </p>
            {err && <ErrorLine>{err}</ErrorLine>}
            <FormButtons>
                <button
                    type="button"
                    onClick={onConfirm}
                    disabled={busy}
                    style={dangerBtnStyle(busy)}
                >
                    {busy ? 'transferring…' : 'transfer link here'}
                </button>
                <button type="button" onClick={onCancel} disabled={busy} style={ghostBtnStyle(busy)}>
                    cancel
                </button>
            </FormButtons>
        </>
    );
}

/* --- lazy wallet button · keeps @orangecheck/wallet-adapter optional --- */

interface WalletButtonProps {
    address: string;
    message: string;
    showManual?: boolean;
    layout?: string;
    heading?: React.ReactNode;
    onSigned: (sig: string) => void;
    onError: (err: { message?: string }, walletId?: string) => void;
}

function LazyWalletButton(props: WalletButtonProps): React.ReactElement {
    const [Comp, setComp] = React.useState<React.ComponentType<WalletButtonProps> | null>(null);
    const [failed, setFailed] = React.useState(false);

    React.useEffect(() => {
        let alive = true;
        // Static dynamic import — tsup keeps the specifier verbatim
        // (wallet-adapter is in `external`); the consumer's bundler
        // resolves it. wallet-adapter is an optional peer dep.
        import('@orangecheck/wallet-adapter/react')
            .then((m) => {
                if (alive) {
                    setComp(
                        () => (m as { OcWalletButton: React.ComponentType<WalletButtonProps> })
                            .OcWalletButton
                    );
                }
            })
            .catch(() => {
                if (alive) setFailed(true);
            });
        return () => {
            alive = false;
        };
    }, []);

    if (failed) {
        return (
            <ErrorLine>
                @orangecheck/wallet-adapter not installed · add it to your site to link a wallet
            </ErrorLine>
        );
    }
    if (!Comp) return <span style={hintStyle}>{'> '}loading wallet options…</span>;
    return <Comp {...props} />;
}

/* --- helpers --- */

function mask(value: string, kind: 'email' | 'btc'): string {
    if (kind === 'email') {
        const [user, host] = value.split('@');
        if (!user || !host) return '••••';
        const m =
            user.length <= 2
                ? '•'.repeat(user.length)
                : user[0] + '•'.repeat(user.length - 2) + user.slice(-1);
        return `${m}@${host}`;
    }
    if (value.length <= 12) return '•'.repeat(value.length);
    return `${value.slice(0, 6)}…${value.slice(-4)}`;
}

/* --- presentational atoms --- */

function SectionLabel({
    children,
    tone = 'primary',
}: {
    children: React.ReactNode;
    tone?: 'primary' | 'success' | 'warn';
}): React.ReactElement {
    const color = tone === 'success' ? V.success : tone === 'warn' ? V.warn : V.primary;
    return (
        <div
            style={{
                color,
                fontFamily: MONO,
                fontSize: 10,
                letterSpacing: '0.18em',
                textTransform: 'uppercase',
                marginBottom: 8,
            }}
        >
            {children}
        </div>
    );
}

function ErrorLine({ children }: { children: React.ReactNode }): React.ReactElement {
    return (
        <p
            role="alert"
            style={{
                margin: '8px 0 0',
                color: V.destructive,
                fontFamily: MONO,
                fontSize: 11,
            }}
        >
            {children}
        </p>
    );
}

function FormButtons({ children }: { children: React.ReactNode }): React.ReactElement {
    return (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>{children}</div>
    );
}

/* --- style tokens (CSS-variable-themed, same approach as OcSignIn) --- */

const MONO = 'ui-monospace, SFMono-Regular, monospace';

const V = {
    primary: 'var(--primary, #f97316)',
    foreground: 'var(--foreground, #fafafa)',
    muted: 'var(--muted-foreground, #a1a1aa)',
    background: 'var(--background, #0a0a0a)',
    card: 'var(--card, #111113)',
    border: 'var(--border, #27272a)',
    destructive: 'var(--destructive, #ef4444)',
    success: 'var(--success, #22c55e)',
    warn: 'var(--warning, #eab308)',
} as const;

function panelStyle(tone: 'plain' | 'accent' | 'success' | 'warn' | 'default' = 'default'): React.CSSProperties {
    const base: React.CSSProperties = {
        background: V.card,
        border: `1px solid ${V.border}`,
        padding: '1.25rem',
    };
    if (tone === 'plain') return { ...base, padding: 0 };
    if (tone === 'accent') return { ...base, borderColor: V.primary, background: 'var(--card, #111113)' };
    if (tone === 'success') return { ...base, borderColor: V.success };
    if (tone === 'warn') return { ...base, borderColor: V.warn };
    return base;
}

const bodyStyle: React.CSSProperties = {
    color: V.muted,
    fontSize: 13,
    lineHeight: 1.55,
    margin: '0 0 12px',
};

const hintStyle: React.CSSProperties = {
    color: V.muted,
    fontFamily: MONO,
    fontSize: 10.5,
    opacity: 0.8,
};

const codeStyle: React.CSSProperties = {
    fontFamily: MONO,
    color: V.foreground,
};

const rowStyle: React.CSSProperties = {
    display: 'flex',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    padding: '1rem',
};

const rowLabelStyle: React.CSSProperties = {
    color: V.foreground,
    fontFamily: MONO,
    fontSize: 10.5,
    letterSpacing: '0.12em',
    textTransform: 'uppercase',
    opacity: 0.8,
};

const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '0.55rem 0.75rem',
    background: V.background,
    color: V.foreground,
    border: `1px solid ${V.border}`,
    borderRadius: 6,
    fontFamily: MONO,
    // 16px — never lower · suppresses iOS Safari focus auto-zoom.
    fontSize: 16,
    outline: 'none',
    boxSizing: 'border-box',
};

function btnBase(disabled: boolean): React.CSSProperties {
    return {
        padding: '0.5rem 0.875rem',
        borderRadius: 6,
        fontFamily: MONO,
        fontSize: 10.5,
        letterSpacing: '0.12em',
        textTransform: 'uppercase',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
    };
}

function primaryBtnStyle(disabled: boolean): React.CSSProperties {
    return {
        ...btnBase(disabled),
        background: V.primary,
        color: 'var(--primary-foreground, #0a0a0a)',
        border: `1px solid ${V.primary}`,
        fontWeight: 600,
    };
}

function ghostBtnStyle(disabled: boolean): React.CSSProperties {
    return {
        ...btnBase(disabled),
        background: V.background,
        color: V.foreground,
        border: `1px solid ${V.border}`,
    };
}

function dangerBtnStyle(disabled: boolean): React.CSSProperties {
    return {
        ...btnBase(disabled),
        background: 'transparent',
        color: V.destructive,
        border: `1px solid ${V.destructive}`,
    };
}

const primaryChipStyle: React.CSSProperties = {
    ...btnBase(false),
    background: 'transparent',
    color: V.primary,
    border: `1px solid ${V.primary}`,
};
