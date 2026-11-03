/**
 * <OcGate />
 *
 * Client-side gate: renders `children` only when the subject's OrangeCheck
 * proof passes the configured thresholds. While loading, on a failure, or when
 * nothing could be concluded, renders `loading`, `fallback` or `unread`.
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
    /**
     * Rendered when nothing could be concluded: no chain API or relay answered,
     * the check threw (the result is then null), or the address holds more coins
     * than the chain API lists. Say "couldn't check", never "below threshold":
     * `sats` and `days` in such a result are not a reading. Default `fallback`,
     * so the gate stays closed.
     */
    unread?: ReactNode | ((result: CheckResult | null) => ReactNode);

    /** Optional callback when the check resolves (pass or fail). */
    onResult?: (result: CheckResult) => void;

    /** Override discovery relays. */
    relays?: string[];
}

/** Reads that did not finish, most decisive first (sdk 1.21.0's unreadReason, read here by name). */
const UNREAD = ['utxo_cap_unread', 'provider_refused_unread', 'chain_unread', 'attestation_unread', 'stake_unread'];

/**
 * Whether check() concluded nothing. Before sdk 1.21.0, a chain API that never
 * answered came back as `bad_request` beside a verified signature, with
 * `below_min_*` on top: that is unread too, never a subject who fell short.
 */
function unreadOf(result: CheckResult): boolean {
    if (result.ok) return false;
    const reasons = result.reasons ?? [];
    if (UNREAD.some((u) => reasons.includes(u))) return true;
    return reasons.includes('bad_request') && reasons.some((r) => r === 'sig_ok_bip322' || r === 'sig_ok_legacy');
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
    unread,
    onResult,
    relays,
}: OcGateProps): ReactNode {
    const [state, setState] = useState<'pending' | 'ok' | 'fail' | 'unread'>('pending');
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
                setState(r.ok ? 'ok' : unreadOf(r) ? 'unread' : 'fail');
                onResult?.(r);
            } catch {
                if (cancelled) return;
                setState('unread');
            }
        })();

        return () => {
            cancelled = true;
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [address, attestationId, idKey, minSats, minDays, relayKey]);

    if (state === 'pending') return loading;
    if (state === 'unread' && unread !== undefined) {
        return typeof unread === 'function' ? unread(result) : unread;
    }
    if (state === 'fail' || state === 'unread') {
        return typeof fallback === 'function' ? fallback(result) : fallback;
    }
    // ok — we know result is not null
    return typeof children === 'function' ? children(result as CheckResult) : children;
}
