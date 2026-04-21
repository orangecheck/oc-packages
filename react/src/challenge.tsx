/**
 * <OcChallengeButton />
 *
 * Runs the signed-challenge flow end-to-end in the browser:
 *
 *   1. GET /api/challenge?addr=...  → issue message + nonce
 *   2. call your wallet's sign function → BIP-322 signature
 *   3. POST /api/challenge           → verify; returns proven address
 *   4. onVerified({ address, nonce, expiresAt })
 *
 * Because every wallet's sign API is different (UniSat, Xverse, Leather, Alby,
 * sparrow-via-paste, etc.), the component takes a `sign` prop — you supply
 * the adapter, we handle everything else.
 *
 *   <OcChallengeButton
 *     address={userAddr}
 *     sign={(msg) => window.unisat.signMessage(msg, 'bip322-simple')}
 *     onVerified={(r) => router.push('/dashboard')}
 *   />
 */

import type { CSSProperties, ReactNode } from 'react';

import { useCallback, useState } from 'react';

export interface OcChallengeVerified {
    address: string;
    nonce: string;
    expiresAt: number;
    audience?: string;
    purpose?: string;
}

export interface OcChallengeButtonProps {
    /** Bitcoin address the user claims to control. */
    address: string;
    /** Wallet signing adapter. Given a canonical message, returns a BIP-322 signature. */
    sign: (message: string) => Promise<string>;
    /** Called when verification succeeds with the proven address. */
    onVerified: (result: OcChallengeVerified) => void;

    /** Optional origin-binding. */
    audience?: string;
    /** Optional purpose label. */
    purpose?: string;
    /** Challenge TTL in seconds. Default: server default (300). */
    ttlSeconds?: number;

    /** Verifier base URL. Default `https://ochk.io`. */
    apiBase?: string;

    /** Called when any step fails. */
    onError?: (err: Error) => void;

    /** Override button contents. */
    children?: ReactNode;
    /** className for the root button. */
    className?: string;
    style?: CSSProperties;
    disabled?: boolean;
}

export function OcChallengeButton({
    address,
    sign,
    onVerified,
    audience,
    purpose,
    ttlSeconds,
    apiBase = 'https://ochk.io',
    onError,
    children,
    className,
    style,
    disabled,
}: OcChallengeButtonProps) {
    const [busy, setBusy] = useState(false);

    const handleClick = useCallback(async () => {
        setBusy(true);
        try {
            // 1. Issue
            const qs = new URLSearchParams({ addr: address });
            if (audience) qs.set('audience', audience);
            if (purpose) qs.set('purpose', purpose);
            if (ttlSeconds) qs.set('ttl', String(ttlSeconds));

            const issueRes = await fetch(`${apiBase}/api/challenge?${qs}`);
            if (!issueRes.ok) {
                throw new Error(
                    `challenge issue failed: ${issueRes.status} ${issueRes.statusText}`
                );
            }
            const { message, nonce } = (await issueRes.json()) as {
                message: string;
                nonce: string;
            };

            // 2. Sign via caller-supplied adapter
            const signature = await sign(message);

            // 3. Verify
            const verifyRes = await fetch(`${apiBase}/api/challenge`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    message,
                    signature,
                    scheme: 'bip322',
                    expectedNonce: nonce,
                    ...(audience ? { expectedAudience: audience } : {}),
                    ...(purpose ? { expectedPurpose: purpose } : {}),
                }),
            });
            const body = await verifyRes.json();
            if (!verifyRes.ok || !body.ok) {
                throw new Error(`challenge verify failed: ${body.reason ?? verifyRes.statusText}`);
            }

            onVerified({
                address: body.address,
                nonce: body.nonce,
                expiresAt: body.expiresAt,
                ...(body.audience ? { audience: body.audience } : {}),
                ...(body.purpose ? { purpose: body.purpose } : {}),
            });
        } catch (err) {
            const e = err instanceof Error ? err : new Error(String(err));
            onError?.(e);
        } finally {
            setBusy(false);
        }
    }, [address, sign, onVerified, audience, purpose, ttlSeconds, apiBase, onError]);

    const isDisabled = disabled || busy;

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={isDisabled}
            className={className}
            style={style}
            aria-busy={busy}
        >
            {children ?? (busy ? 'Signing…' : 'Prove address control')}
        </button>
    );
}
