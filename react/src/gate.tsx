/**
 * <OcGate />
 *
 * Client-side gate: renders `children` only when the subject's OrangeCheck
 * proof passes the configured thresholds. While loading or on failure, renders
 * `loading` / `fallback` respectively.
 *
 *   <OcGate address="bc1q..." minSats={100_000} minDays={30}>
 *     <CommentForm />
 *   </OcGate>
 *
 * This is a convenience for rendering UI differently based on OC status. It
 * is NOT a security boundary — real access control must happen on the server
 * using `@orangecheck/gate` or `/api/check`. Client state is always suspect.
 */

import type { CheckResult } from '@orangecheck/sdk';
import type { ReactNode } from 'react';

import { check } from '@orangecheck/sdk';
import { useEffect, useState } from 'react';

export interface OcGateProps {
    /** Bitcoin address. Pick one of address / attestationId / identity. */
    address?: string;
    /** Attestation ID (SHA-256 hex). */
    attestationId?: string;
    /** Identity binding, e.g. `{ protocol: 'github', identifier: 'alice' }`. */
    identity?: { protocol: string; identifier: string };

    /** Minimum sats bonded. Default 0. */
    minSats?: number;
    /** Minimum days unspent. Default 0. */
    minDays?: number;

    /** Rendered when the check passes. The resolved CheckResult is passed through. */
    children?: ReactNode | ((result: CheckResult) => ReactNode);
    /** Rendered while the check is pending. Default `null`. */
    loading?: ReactNode;
    /** Rendered when the check fails. Receives the CheckResult so you can explain why. */
    fallback?: ReactNode | ((result: CheckResult | null) => ReactNode);

    /** Optional callback when the check resolves (pass or fail). */
    onResult?: (result: CheckResult) => void;

    /** Override discovery relays. */
    relays?: string[];
}

export function OcGate({
    address,
    attestationId,
    identity,
    minSats,
    minDays,
    children,
    loading = null,
    fallback = null,
    onResult,
    relays,
}: OcGateProps): ReactNode {
    const [state, setState] = useState<'pending' | 'ok' | 'fail'>('pending');
    const [result, setResult] = useState<CheckResult | null>(null);

    // Re-run when the inputs change. Key by stable strings so object identity
    // doesn't thrash effects.
    const idKey = identity ? `${identity.protocol}:${identity.identifier}` : '';
    const relayKey = relays?.join('|') ?? '';

    useEffect(() => {
        let cancelled = false;
        setState('pending');
        setResult(null);

        (async () => {
            try {
                const params: Parameters<typeof check>[0] = {
                    minSats,
                    minDays,
                    ...(relays ? { relays } : {}),
                };
                if (attestationId) params.id = attestationId;
                else if (address) params.addr = address;
                else if (identity) params.identity = identity;

                const r = await check(params);
                if (cancelled) return;
                setResult(r);
                setState(r.ok ? 'ok' : 'fail');
                onResult?.(r);
            } catch {
                if (cancelled) return;
                setState('fail');
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address, attestationId, idKey, minSats, minDays, relayKey]);

    if (state === 'pending') return loading;
    if (state === 'fail') {
        return typeof fallback === 'function' ? fallback(result) : fallback;
    }
    // ok — we know result is not null
    return typeof children === 'function' ? children(result as CheckResult) : children;
}
