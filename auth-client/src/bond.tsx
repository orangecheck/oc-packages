'use client';

/**
 * OcBond · back the signed-in account with bitcoin (oc-attest-protocol
 * BOND.md). The person signs for one coin they hold. It stays in their wallet,
 * and spending it ends the backing. Apps they sign in to see floors and a
 * number unique to that app, never the coin. Optional: every account signs in
 * without one.
 *
 * Runs against the auth host's /api/auth/bond with the family cookie, like
 * OcLinkedIdentities, so any *.ochk.io site can mount it. A change re-mints
 * the session there, and a tab pinned to this account re-pins with the fresh
 * token; `onChange` lets the site refresh its session view.
 */
import * as React from 'react';

import { addressInputValue } from './address';
import { SIGNIN_FONT } from './appearance';
import {
    bodyStyle,
    dangerBtnStyle,
    ErrorLine,
    FormButtons,
    ghostBtnStyle,
    hintStyle,
    inputStyle,
    LazyWalletButton,
    panelStyle,
    primaryBtnStyle,
    SectionLabel,
    V,
} from './linked-identities';
import { readTabSession, writeTabSession } from './tab-session';

const DEFAULT_AUTH_ORIGIN = 'https://ochk.io';
const MIN_CONFIRMATIONS = 6;
/** Smaller coins meet no floor, so the auth host refuses them (`coin_too_small`). */
const MIN_SATS = 1_000;

interface Floors {
    sats_floor: number;
    days_floor: number;
}

/** The account's bond as the auth host shows it to the account itself. */
export interface OcBondView extends Floors {
    address: string;
    outpoint: string;
    sats: number;
    confirmed_height: number;
    checked_at: string;
    checked_height: number;
    created_at: string;
}

interface Coin extends Floors {
    outpoint: string;
    sats: number;
    age_blocks: number;
}

export interface OcBondProps {
    /** The auth host. Default https://ochk.io; pass the current origin on ochk.io itself. */
    authOrigin?: string;
    /** After a bond is made or released, so the site can refresh its session. */
    onChange?: (bond: OcBondView | null) => void;
    className?: string;
}

const n = (v: number) => v.toLocaleString('en-US');

/** "at least 100,000 sats, held 90 days or more". */
export function bondFloorsText(f: Floors): string {
    const sats = f.sats_floor > 0 ? `at least ${n(f.sats_floor)} sats` : 'under 1,000 sats';
    const days = f.days_floor > 0 ? `held ${f.days_floor} days or more` : 'held under 7 days';
    return `${sats}, ${days}`;
}

const short = (outpoint: string) => {
    const [txid = '', vout = ''] = outpoint.split(':');
    return `${txid.slice(0, 8)}…${txid.slice(-4)}:${vout}`;
};

const usable = (c: Coin) => c.sats >= MIN_SATS && c.age_blocks >= MIN_CONFIRMATIONS;

const dustText = (count: number) =>
    `${n(count)} ${count === 1 ? 'coin' : 'coins'} under ${n(MIN_SATS)} sats, ` +
    'too small to back an account';

const REFUSAL: Record<string, string> = {
    invalid_address: "that isn't a Bitcoin address we can read",
    chain_unavailable: "couldn't read the chain just now · nothing changed, try again in a minute",
    sig_invalid:
        "that signature isn't from this coin's address · sign with the wallet that holds it",
    bond_expired: 'the message expired · start again',
    bond_not_yet_valid: "your device's clock looks wrong · check it and start again",
    bond_subject_mismatch: 'that message was for another account · start again',
    bond_malformed: 'the signed message changed on the way · start again',
    bond_window_too_long: "that message's signing window is too long · start again",
    coin_not_found: "that coin doesn't exist on-chain",
    coin_address_mismatch: "that coin isn't at this address",
    coin_unconfirmed: "that coin isn't confirmed yet",
    coin_too_recent: 'that coin needs six confirmations first, about an hour',
    coin_spent: 'that coin has been spent · pick one still in your wallet',
    coin_too_small: `that coin is under ${n(MIN_SATS)} sats, too small to back an account`,
    coin_backs_another_account: 'that coin already backs another orangecheck account',
    coin_backed_another_recently:
        'that coin backed another account until recently · ' +
        'it can back this one 30 days after it was released',
    not_authenticated: 'your session ended · sign in again',
    rate_limited: 'too many tries · wait a minute, then try again',
};

/** A refusal from /api/auth/bond, in the component's voice. Not exported from the index. */
export const bondRefusal = (reason?: string): string =>
    (reason && REFUSAL[reason]) || "your backing didn't save · nothing changed, try again";

/* Small print stays legible: 12px or more, and never dimmed below the muted tone. */
const smallStyle: React.CSSProperties = { ...bodyStyle, fontSize: 12, margin: 0 };
const explainerStyle: React.CSSProperties = {
    ...hintStyle,
    fontSize: 12,
    lineHeight: 1.55,
    opacity: 1,
    margin: 0,
};
const fieldLabelStyle: React.CSSProperties = {
    display: 'block',
    color: V.foreground,
    fontSize: 13,
    fontWeight: 500,
    margin: '0 0 4px',
};
const addressStyle: React.CSSProperties = { wordBreak: 'break-all', color: V.foreground };

function coinStyle(picked: boolean, young: boolean): React.CSSProperties {
    return {
        background: V.card,
        border: `1px ${young ? 'dashed' : 'solid'} ${picked ? V.primary : V.border}`,
        padding: '0.75rem',
        display: 'flex',
        gap: 10,
        alignItems: 'flex-start',
        cursor: young ? 'not-allowed' : 'pointer',
    };
}

/** The account's bond, or null. Throws when the auth host can't be read. */
export async function fetchOcBond(opts?: { authOrigin?: string }): Promise<OcBondView | null> {
    const r = await fetch(`${opts?.authOrigin ?? DEFAULT_AUTH_ORIGIN}/api/auth/bond`, {
        credentials: 'include',
    });
    const j = (await r.json().catch(() => ({}))) as { ok?: boolean; bond?: OcBondView | null };
    if (!r.ok || !j.ok) throw new Error(`http_${r.status}`);
    return j.bond ?? null;
}

export function OcBond({
    authOrigin = DEFAULT_AUTH_ORIGIN,
    onChange,
    className,
}: OcBondProps): React.ReactElement {
    const [bond, setBond] = React.useState<OcBondView | null | undefined>(undefined);
    const [loadErr, setLoadErr] = React.useState(false);
    const [nonce, setNonce] = React.useState(0);
    const [adding, setAdding] = React.useState(false);
    const [confirming, setConfirming] = React.useState(false);
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);

    React.useEffect(() => {
        let alive = true;
        fetchOcBond({ authOrigin }).then(
            (b) => alive && setBond(b),
            () => alive && setLoadErr(true)
        );
        return () => {
            alive = false;
        };
    }, [authOrigin, nonce]);

    const call = React.useCallback(
        async (method: string, body?: unknown) => {
            const r = await fetch(`${authOrigin}/api/auth/bond`, {
                method,
                credentials: 'include',
                headers: body ? { 'Content-Type': 'application/json' } : undefined,
                body: body ? JSON.stringify(body) : undefined,
            });
            const j = (await r.json().catch(() => ({}))) as Record<string, unknown> & {
                ok?: boolean;
                reason?: string;
                token?: unknown;
            };
            // The host minted for the account this tab shows; keep the pin current.
            const pin = readTabSession();
            if (pin && r.ok && typeof j.token === 'string') {
                writeTabSession({ token: j.token, didOc: pin.didOc });
            }
            return { ok: r.ok && j.ok === true, ...j };
        },
        [authOrigin]
    );

    async function release(): Promise<void> {
        setBusy(true);
        setErr(null);
        const j = await call('DELETE').catch(() => ({ ok: false, reason: 'network' }));
        setBusy(false);
        if (!j.ok) return setErr(bondRefusal(j.reason));
        setConfirming(false);
        setBond(null);
        onChange?.(null);
    }

    if (loadErr) {
        return (
            <div className={className} data-oc-bond="" style={panelStyle('warn')} role="alert">
                <p style={bodyStyle}>couldn&apos;t read your backing · nothing was changed</p>
                <button
                    type="button"
                    style={ghostBtnStyle(false)}
                    onClick={() => {
                        setLoadErr(false);
                        setNonce((x) => x + 1);
                    }}
                >
                    try again
                </button>
            </div>
        );
    }
    if (bond === undefined) {
        return (
            <div className={className} data-oc-bond="" style={panelStyle()}>
                <span style={hintStyle}>reading your backing…</span>
            </div>
        );
    }

    return (
        <div className={className} data-oc-bond="" style={{ display: 'grid', gap: 16 }}>
            {bond && !adding ? (
                <div style={panelStyle('success')}>
                    <SectionLabel tone="success">§ backed by bitcoin</SectionLabel>
                    <p style={{ ...bodyStyle, color: V.foreground }}>
                        apps see a coin {bondFloorsText(bond)}.
                    </p>
                    <p style={bodyStyle}>
                        coin {short(bond.outpoint)}, {n(bond.sats)} sats · last found unspent at
                        block {n(bond.checked_height)} · only you and orangecheck see this line
                    </p>
                    {confirming ? (
                        <div role="group" aria-label="stop backing" data-oc-bond-confirm="">
                            <p style={{ ...bodyStyle, color: V.foreground, margin: 0 }}>
                                stop backing? apps that ask for a backed account may stop letting
                                you in.
                            </p>
                            <FormButtons>
                                <button
                                    type="button"
                                    style={dangerBtnStyle(busy)}
                                    disabled={busy}
                                    onClick={() => void release()}
                                >
                                    stop backing
                                </button>
                                <button
                                    type="button"
                                    style={ghostBtnStyle(busy)}
                                    disabled={busy}
                                    autoFocus
                                    onClick={() => {
                                        setErr(null);
                                        setConfirming(false);
                                    }}
                                >
                                    keep
                                </button>
                            </FormButtons>
                        </div>
                    ) : (
                        <FormButtons>
                            <button
                                type="button"
                                style={ghostBtnStyle(false)}
                                onClick={() => {
                                    setErr(null);
                                    setAdding(true);
                                }}
                            >
                                use another coin
                            </button>
                            <button
                                type="button"
                                style={dangerBtnStyle(false)}
                                onClick={() => setConfirming(true)}
                            >
                                stop backing
                            </button>
                        </FormButtons>
                    )}
                    {err ? <ErrorLine>{err}</ErrorLine> : null}
                </div>
            ) : null}
            {!bond && !adding ? (
                <div style={panelStyle()}>
                    <SectionLabel>§ not backed</SectionLabel>
                    <p style={bodyStyle}>
                        your account works everywhere as it is. some apps let in only accounts
                        backed by a coin you hold. it stays in your wallet, and apps never see
                        which coin.
                    </p>
                    <button
                        type="button"
                        style={primaryBtnStyle(false)}
                        onClick={() => setAdding(true)}
                    >
                        back your account
                    </button>
                </div>
            ) : null}
            {adding ? (
                <BondForm
                    call={call}
                    onCancel={() => setAdding(false)}
                    onDone={(b) => {
                        setBond(b);
                        setAdding(false);
                        onChange?.(b);
                    }}
                />
            ) : null}
            <p style={explainerStyle}>
                Apps see only rough floors, like “at least 100,000 sats, held 30 days or
                more”, and a number unique to that app. Never the coin, your address or your
                balance. An app can block that number; only moving the coin gets past it, and a
                moved coin starts its age again.
            </p>
        </div>
    );
}

type Call = (
    method: string,
    body?: unknown
) => Promise<Record<string, unknown> & { ok: boolean; reason?: string }>;

function BondForm({
    call,
    onCancel,
    onDone,
}: {
    call: Call;
    onCancel: () => void;
    onDone: (bond: OcBondView) => void;
}): React.ReactElement {
    const [address, setAddress] = React.useState('');
    const [coins, setCoins] = React.useState<Coin[] | null>(null);
    const [chosen, setChosen] = React.useState('');
    const [message, setMessage] = React.useState<string | null>(null);
    const [busy, setBusy] = React.useState(false);
    const [err, setErr] = React.useState<string | null>(null);
    const id = React.useId();

    const addr = address.trim();
    const canFind = addr.length >= 14;

    async function run(fn: () => Promise<void>): Promise<void> {
        setBusy(true);
        setErr(null);
        try {
            await fn();
        } catch {
            setErr(bondRefusal('chain_unavailable'));
        } finally {
            setBusy(false);
        }
    }

    const findCoins = () =>
        run(async () => {
            const j = await call('POST', { action: 'coins', address: addr });
            if (!j.ok) return setErr(bondRefusal(j.reason));
            const list = (j.coins as Coin[]) ?? [];
            setCoins(list);
            setChosen(list.find(usable)?.outpoint ?? '');
        });

    const getMessage = () =>
        run(async () => {
            const j = await call('POST', { action: 'message', address: addr, outpoint: chosen });
            if (!j.ok || typeof j.message !== 'string') return setErr(bondRefusal(j.reason));
            setMessage(j.message);
        });

    const submit = (signature: string) =>
        run(async () => {
            const j = await call('POST', { action: 'bond', message, signature });
            if (!j.ok || !j.bond) return setErr(bondRefusal(j.reason));
            onDone(j.bond as OcBondView);
        });

    /** Back one step: from signing to the coin list, or from the coins to the address. */
    function back(): void {
        setErr(null);
        if (message) setMessage(null);
        else setCoins(null);
    }

    const error = err ? <ErrorLine>{err}</ErrorLine> : null;
    const backButton = (
        <button type="button" style={ghostBtnStyle(busy)} disabled={busy} onClick={back}>
            back
        </button>
    );
    const cancelButton = (
        <button type="button" style={ghostBtnStyle(busy)} disabled={busy} onClick={onCancel}>
            cancel
        </button>
    );

    let step: React.ReactNode;
    if (message) {
        step = (
            <>
                <p style={bodyStyle}>
                    sign with the wallet that holds <span style={addressStyle}>{addr}</span>.
                    signing spends nothing, and the coin stays in your wallet.
                </p>
                <LazyWalletButton
                    address={addr}
                    message={message}
                    showManual
                    onSigned={(sig) => void submit(sig)}
                    onError={(e) => setErr(e.message ?? 'the wallet refused to sign')}
                />
                {error}
                <FormButtons>
                    {backButton}
                    {cancelButton}
                </FormButtons>
            </>
        );
    } else if (coins) {
        const eligible = coins.filter((c) => c.sats >= MIN_SATS);
        const dust = coins.length - eligible.length;
        step = (
            <>
                {coins.length === 0 ? (
                    <p style={bodyStyle}>
                        no confirmed coins at that address · send at least {n(MIN_SATS)} sats
                        there and wait for six confirmations, about an hour. the longer a coin
                        sits, the more it says.
                    </p>
                ) : eligible.length === 0 ? (
                    <>
                        <p style={{ ...bodyStyle, color: V.foreground }}>{dustText(dust)}</p>
                        <p style={bodyStyle}>
                            send at least {n(MIN_SATS)} sats there in one payment and wait for six
                            confirmations, about an hour. coins aren&apos;t added together.
                        </p>
                    </>
                ) : (
                    <>
                        <p id={`${id}-pick`} style={bodyStyle}>
                            pick one coin · coins aren&apos;t added together
                        </p>
                        <div
                            role="radiogroup"
                            aria-labelledby={`${id}-pick`}
                            style={{ display: 'grid', gap: 8 }}
                        >
                            {eligible.map((c) => {
                                const young = c.age_blocks < MIN_CONFIRMATIONS;
                                return (
                                    <label
                                        key={c.outpoint}
                                        style={coinStyle(chosen === c.outpoint, young)}
                                    >
                                        <input
                                            type="radio"
                                            name="oc-bond-coin"
                                            value={c.outpoint}
                                            checked={chosen === c.outpoint}
                                            disabled={young}
                                            onChange={() => setChosen(c.outpoint)}
                                            style={{ accentColor: V.primary, margin: '2px 0 0' }}
                                        />
                                        <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                                            <span
                                                style={{
                                                    color: young ? V.muted : V.foreground,
                                                    fontSize: 13,
                                                }}
                                            >
                                                {n(c.sats)} sats, held{' '}
                                                {Math.floor(c.age_blocks / 144)} days
                                            </span>
                                            <span style={smallStyle}>
                                                {young
                                                    ? 'too recent: needs six confirmations'
                                                    : `apps would see ${bondFloorsText(c)}`}
                                            </span>
                                            <span
                                                style={{
                                                    ...smallStyle,
                                                    fontFamily: SIGNIN_FONT,
                                                    wordBreak: 'break-all',
                                                }}
                                            >
                                                {short(c.outpoint)}
                                            </span>
                                        </span>
                                    </label>
                                );
                            })}
                        </div>
                        {dust > 0 ? (
                            <p style={{ ...smallStyle, marginTop: 8 }}>{dustText(dust)}</p>
                        ) : null}
                    </>
                )}
                {error}
                <FormButtons>
                    {eligible.length > 0 ? (
                        <button
                            type="button"
                            style={primaryBtnStyle(busy || !chosen)}
                            disabled={busy || !chosen}
                            onClick={() => void getMessage()}
                        >
                            continue
                        </button>
                    ) : null}
                    {backButton}
                    {cancelButton}
                </FormButtons>
            </>
        );
    } else {
        step = (
            <form
                style={{ margin: 0 }}
                onSubmit={(e) => {
                    e.preventDefault();
                    if (canFind && !busy) void findCoins();
                }}
            >
                <label htmlFor={`${id}-address`} style={fieldLabelStyle}>
                    bitcoin address that holds the coin
                </label>
                <p id={`${id}-advice`} style={{ ...bodyStyle, margin: '0 0 8px' }}>
                    use one that holds nothing else of yours: orangecheck learns its address and
                    amount. apps never do.
                </p>
                <input
                    data-oca-field=""
                    id={`${id}-address`}
                    aria-describedby={`${id}-advice`}
                    style={inputStyle}
                    value={address}
                    onChange={(e) => setAddress(addressInputValue(e.target.value))}
                    placeholder="bc1q…"
                    spellCheck={false}
                    autoComplete="off"
                    autoCapitalize="off"
                />
                {error}
                <FormButtons>
                    <button
                        type="submit"
                        style={primaryBtnStyle(busy || !canFind)}
                        disabled={busy || !canFind}
                    >
                        find its coins
                    </button>
                    {cancelButton}
                </FormButtons>
            </form>
        );
    }

    return (
        <div style={panelStyle('accent')} data-oc-bond-form="">
            <SectionLabel>§ back your account</SectionLabel>
            {step}
        </div>
    );
}
