/**
 * <OcWalletButton />
 *
 * Detects installed browser Bitcoin wallets and lets the user pick one. When
 * clicked, calls the wallet's sign API with the `message` you supply and
 * passes the signature to `onSigned`. Falls back to a manual/paste option so
 * Sparrow, Bitcoin Core, and hardware wallets still work.
 *
 *   <OcWalletButton
 *     address={userAddr}
 *     message={challenge.message}
 *     onSigned={(sig) => postVerify({ signature: sig })}
 *   />
 */

import type { CSSProperties, ReactNode } from 'react';
import type { WalletId, WalletInfo } from './types';

import { useEffect, useMemo, useState } from 'react';

import { detectWallets } from './detect';
import { getSigner } from './sign';

export interface OcWalletButtonProps {
    /** Bitcoin address the user is signing under. */
    address: string;
    /**
     * Canonical message to sign. If you already have a `<OcChallengeButton>`
     * managing the challenge flow, use that instead — this component is the
     * lower-level primitive for custom flows that need a pre-built wallet
     * picker.
     */
    message: string;
    /** Called with the BIP-322 signature on success. */
    onSigned: (signature: string, walletId: WalletId) => void;
    /** Called if signing fails (user cancels, wallet errors, etc). */
    onError?: (err: Error, walletId: WalletId) => void;

    /** Hide wallets that aren't installed. Default `false` (they render as install prompts). */
    hideUninstalled?: boolean;
    /** className for the root `<div>`. */
    className?: string;
    style?: CSSProperties;
    /** Text for the header above the wallet list. Default "Sign with your wallet". */
    heading?: ReactNode;
    /** Text when no browser wallets are installed. */
    emptyState?: ReactNode;
}

const BUTTON_BASE: CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    padding: '10px 14px',
    marginBottom: 8,
    background: 'transparent',
    color: 'inherit',
    border: '1px solid rgba(127,127,127,0.35)',
    borderRadius: 8,
    fontSize: 14,
    cursor: 'pointer',
    textAlign: 'left',
};

export function OcWalletButton({
    address,
    message,
    onSigned,
    onError,
    hideUninstalled = false,
    className,
    style,
    heading = 'Sign with your wallet',
    emptyState,
}: OcWalletButtonProps) {
    const [wallets, setWallets] = useState<WalletInfo[]>([]);
    const [busyId, setBusyId] = useState<WalletId | null>(null);

    // Wallets are browser-globals — detect only after mount to avoid SSR mismatch.
    useEffect(() => {
        setWallets(detectWallets());
    }, []);

    const visible = useMemo(
        () => (hideUninstalled ? wallets.filter((w) => w.detected) : wallets),
        [wallets, hideUninstalled]
    );

    const handleSign = async (wallet: WalletInfo) => {
        if (busyId) return;
        if (!wallet.detected && !wallet.isManual) {
            window.open(wallet.installUrl, '_blank', 'noopener,noreferrer');
            return;
        }
        setBusyId(wallet.id);
        try {
            const sig = await getSigner(wallet.id, { address })(message);
            onSigned(sig, wallet.id);
        } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            onError?.(e, wallet.id);
        } finally {
            setBusyId(null);
        }
    };

    return (
        <div className={className} style={style}>
            {heading && (
                <div
                    style={{
                        marginBottom: 10,
                        fontSize: 13,
                        fontWeight: 600,
                        opacity: 0.7,
                        letterSpacing: 0.4,
                        textTransform: 'uppercase',
                    }}
                >
                    {heading}
                </div>
            )}

            {visible.length === 0 ? (
                <div style={{ fontSize: 13, opacity: 0.7 }}>
                    {emptyState ??
                        'No Bitcoin wallets detected. Install UniSat, Xverse, Leather, or Alby — or paste a signature manually.'}
                </div>
            ) : (
                visible.map((w) => {
                    const busy = busyId === w.id;
                    const disabled = Boolean(busyId) && !busy;
                    return (
                        <button
                            key={w.id}
                            type="button"
                            onClick={() => handleSign(w)}
                            disabled={disabled}
                            aria-busy={busy}
                            style={{
                                ...BUTTON_BASE,
                                opacity: disabled ? 0.5 : 1,
                                cursor: disabled ? 'not-allowed' : 'pointer',
                            }}
                        >
                            <span>{w.name}</span>
                            <span style={{ fontSize: 11, opacity: 0.6 }}>
                                {busy
                                    ? 'Signing…'
                                    : w.isManual
                                      ? 'paste'
                                      : w.detected
                                        ? 'ready'
                                        : 'install'}
                            </span>
                        </button>
                    );
                })
            )}
        </div>
    );
}
