'use client';

/**
 * OcBond · back the signed-in account with bitcoin (oc-attest-protocol
 * BOND.md). The person pledges one coin they hold; it never moves and nobody
 * holds it. Apps they sign in to see floors and a number unique to that app,
 * never the coin. Optional: every account signs in without one.
 *
 * Runs against the auth host's /api/auth/bond with the family cookie, like
 * OcLinkedIdentities, so any *.ochk.io site can mount it. A change re-mints
 * the cookie there; `onChange` lets the site refresh its session view.
 */
import * as React from 'react';

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

const DEFAULT_AUTH_ORIGIN = 'https://ochk.io';
const MIN_CONFIRMATIONS = 6;

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

const REFUSAL: Record<string, string> = {
    invalid_address: "that isn't a Bitcoin address we can read",
    chain_unavailable: "couldn't read the chain just now · nothing changed, try again in a minute",
    sig_invalid: "that signature isn't from this coin's address · sign with the wallet that holds it",
    bond_expired: 'the message expired · start again',
    bond_not_yet_valid: "your device's clock looks wrong",
    bond_subject_mismatch: 'that message was for another account · start again',
    bond_malformed: 'the signed message changed on the way · start again',
    coin_not_found: "that coin doesn't exist on-chain",
    coin_address_mismatch: "that coin isn't at this address",
    coin_unconfirmed: "that coin isn't confirmed yet",
    coin_too_recent: 'that coin needs six confirmations first, about an hour',
    coin_spent: 'that coin has been spent · pick one still in your wallet',
    coin_backs_another_account: 'that coin already backs another orangecheck account',
    not_authenticated: 'your session ended · sign in again',
};
const refusal = (reason?: string) =>
    (reason && REFUSAL[reason]) || "your backing didn't save · nothing changed, try again";

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
            };
            return { ok: r.ok && j.ok === true, ...j };
        },
        [authOrigin]
    );

    async function release(): Promise<void> {
        setBusy(true);
        setErr(null);
        const j = await call('DELETE').catch(() => ({ ok: false, reason: 'network' }));
        setBusy(false);
        if (!j.ok) return setErr(refusal(j.reason));
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
                <span style={hintStyle}>{'> '}reading your backing…</span>
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
                    <FormButtons>
                        <button type="button" style={ghostBtnStyle(busy)} disabled={busy} onClick={() => setAdding(true)}>
                            use another coin
                        </button>
                        <button type="button" style={dangerBtnStyle(busy)} disabled={busy} onClick={() => void release()}>
                            stop backing
                        </button>
                    </FormButtons>
                    {err ? <ErrorLine>{err}</ErrorLine> : null}
                </div>
            ) : null}
            {!bond && !adding ? (
                <div style={panelStyle()}>
                    <SectionLabel>§ not backed</SectionLabel>
                    <p style={bodyStyle}>
                        your account works everywhere as it is. apps that want to keep out bots can ask
                        for a backed account: one coin you hold, that never moves and that they never
                        see.
                    </p>
                    <button type="button" style={primaryBtnStyle(false)} onClick={() => setAdding(true)}>
                        back it with a coin
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
            <p style={hintStyle}>
                {'> '}apps see that a coin backs you, in rough steps, and a number unique to each
                app, so they can&apos;t compare notes. an app can block that number; getting past
                it means moving the coin, and a moved coin starts its age again.
            </p>
        </div>
    );
}

type Call = (method: string, body?: unknown) => Promise<Record<string, unknown> & { ok: boolean; reason?: string }>;

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

    async function run(fn: () => Promise<void>): Promise<void> {
        setBusy(true);
        setErr(null);
        try {
            await fn();
        } catch {
            setErr(refusal('chain_unavailable'));
        } finally {
            setBusy(false);
        }
    }

    const findCoins = () =>
        run(async () => {
            const j = await call('POST', { action: 'coins', address: address.trim() });
            if (!j.ok) return setErr(refusal(j.reason));
            const list = (j.coins as Coin[]) ?? [];
            setCoins(list);
            setChosen(list.find((c) => c.age_blocks >= MIN_CONFIRMATIONS)?.outpoint ?? '');
        });

    const getMessage = () =>
        run(async () => {
            const j = await call('POST', { action: 'message', address: address.trim(), outpoint: chosen });
            if (!j.ok || typeof j.message !== 'string') return setErr(refusal(j.reason));
            setMessage(j.message);
        });

    const submit = (signature: string) =>
        run(async () => {
            const j = await call('POST', { action: 'bond', message, signature });
            if (!j.ok || !j.bond) return setErr(refusal(j.reason));
            onDone(j.bond as OcBondView);
        });

    return (
        <div style={panelStyle('accent')} data-oc-bond-form="">
            <SectionLabel>§ back your account with a coin</SectionLabel>
            {message ? (
                <>
                    <p style={bodyStyle}>
                        sign with the wallet that holds{' '}
                        <span style={{ wordBreak: 'break-all', color: V.foreground }}>{address.trim()}</span>. the
                        coin doesn&apos;t move and nothing is spent.
                    </p>
                    <LazyWalletButton
                        address={address.trim()}
                        message={message}
                        showManual
                        onSigned={(sig) => void submit(sig)}
                        onError={(e) => setErr(e.message ?? 'the wallet refused to sign')}
                    />
                </>
            ) : coins ? (
                coins.length === 0 ? (
                    <p style={bodyStyle}>
                        no confirmed coins at that address · send some sats there and wait for six
                        confirmations, about an hour. the longer a coin sits, the more it says.
                    </p>
                ) : (
                    <div role="radiogroup" aria-label="pick one coin" style={{ display: 'grid', gap: 8 }}>
                        <p style={bodyStyle}>pick one coin · value spread over several coins doesn&apos;t add up</p>
                        {coins.map((c) => {
                            const young = c.age_blocks < MIN_CONFIRMATIONS;
                            return (
                                <label
                                    key={c.outpoint}
                                    style={{
                                        ...panelStyle(chosen === c.outpoint ? 'accent' : 'default'),
                                        padding: '0.75rem',
                                        display: 'flex',
                                        gap: 10,
                                        alignItems: 'flex-start',
                                        cursor: young ? 'not-allowed' : 'pointer',
                                        opacity: young ? 0.6 : 1,
                                    }}
                                >
                                    <input
                                        type="radio"
                                        name="oc-bond-coin"
                                        value={c.outpoint}
                                        checked={chosen === c.outpoint}
                                        disabled={young}
                                        onChange={() => setChosen(c.outpoint)}
                                    />
                                    <span style={{ display: 'grid', gap: 2, minWidth: 0 }}>
                                        <span style={{ color: V.foreground, fontSize: 13 }}>
                                            {n(c.sats)} sats, held {Math.floor(c.age_blocks / 144)} days
                                        </span>
                                        <span style={hintStyle}>
                                            {young ? 'too recent: needs six confirmations' : `apps would see ${bondFloorsText(c)}`}
                                        </span>
                                        <span style={{ ...hintStyle, wordBreak: 'break-all' }}>{short(c.outpoint)}</span>
                                    </span>
                                </label>
                            );
                        })}
                    </div>
                )
            ) : (
                <>
                    <p style={bodyStyle}>
                        which address holds the coin? use one that holds nothing else of yours:
                        orangecheck learns its address and amount. apps never do.
                    </p>
                    <input
                        style={inputStyle}
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="bc1q…"
                        spellCheck={false}
                        autoComplete="off"
                        aria-label="Bitcoin address"
                    />
                </>
            )}
            {err ? <ErrorLine>{err}</ErrorLine> : null}
            <FormButtons>
                {!coins && !message ? (
                    <button
                        type="button"
                        style={primaryBtnStyle(busy || address.trim().length < 14)}
                        disabled={busy || address.trim().length < 14}
                        onClick={() => void findCoins()}
                    >
                        find its coins
                    </button>
                ) : null}
                {coins && coins.length > 0 && !message ? (
                    <button
                        type="button"
                        style={primaryBtnStyle(busy || !chosen)}
                        disabled={busy || !chosen}
                        onClick={() => void getMessage()}
                    >
                        continue
                    </button>
                ) : null}
                <button type="button" style={ghostBtnStyle(busy)} disabled={busy} onClick={onCancel}>
                    cancel
                </button>
            </FormButtons>
        </div>
    );
}
