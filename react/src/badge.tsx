/**
 * <OcBadge />
 *
 * Renders a proof-of-Bitcoin-stake badge. Accepts the shape returned by the
 * SDK's `check()` / `verify()` directly, so consumers don't have to transform.
 *
 * Two variants:
 *   - `compact` (default): inline pill suitable for sidebars / profile rows.
 *   - `card`: stand-alone card with address + metrics + footer.
 *
 * Two themes: `light` and `dark`.
 */

import type { ScoringAlgorithm } from '@orangecheck/sdk';
import type { CSSProperties } from 'react';

import { computeScore, formatScore, getScoreColor } from '@orangecheck/sdk/scoring';
import { memo, useMemo } from 'react';

const THEMES = {
    light: { bg: '#ffffff', text: '#0a0a0a', muted: '#666', border: '#e5e5e5' },
    dark: { bg: '#0a0a0a', text: '#fafafa', muted: '#a0a0a0', border: '#262626' },
} as const;

export interface OcBadgeProps {
    /** Bitcoin address the proof is bound to. */
    address: string;
    /** Sats bonded (from the `sats` field of a CheckResult or `sats_bonded` of a VerifyOutcome.metrics). */
    sats: number;
    /** Days unspent. */
    days: number;
    /** Optional reference score (from `score`). Computed from sats/days if omitted. */
    score?: number;
    /** Scoring display mode. Default `v0`. */
    algorithm?: ScoringAlgorithm;
    /** Visual variant. Default `compact`. */
    variant?: 'compact' | 'card';
    /** Colour theme. Default `light`. */
    theme?: 'light' | 'dark';
    /** Hide the score entirely; show only raw metrics. */
    hideScore?: boolean;
    /** Extra className passed through to the root element. */
    className?: string;
    /** Inline style override. */
    style?: CSSProperties;
}

function fmtSats(n: number): string {
    // 12_345 → "12,345"
    return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function shortAddr(a: string): string {
    return a.length > 18 ? `${a.slice(0, 8)}…${a.slice(-6)}` : a;
}

const OcBadgeImpl = ({
    address,
    sats,
    days,
    score,
    algorithm = 'v0',
    variant = 'compact',
    theme = 'light',
    hideScore = false,
    className,
    style,
}: OcBadgeProps) => {
    const resolvedScore = useMemo(() => {
        if (hideScore) return null;
        if (algorithm === 'tier') return computeScore(sats, days, { algorithm: 'tier' });
        return score ?? (computeScore(sats, days, { algorithm: 'v0' }) as number);
    }, [score, sats, days, algorithm, hideScore]);

    const scoreLabel = useMemo(
        () => (hideScore || resolvedScore == null ? '' : formatScore(resolvedScore, algorithm)),
        [hideScore, resolvedScore, algorithm]
    );
    const scoreColor = useMemo(
        () => (hideScore || resolvedScore == null ? '' : getScoreColor(resolvedScore, algorithm)),
        [hideScore, resolvedScore, algorithm]
    );

    const c = THEMES[theme];
    const rootClass = ['oc-badge', `oc-badge-${variant}`, className].filter(Boolean).join(' ');

    if (variant === 'compact') {
        return (
            <span
                className={rootClass}
                role="img"
                aria-label={`OrangeCheck: ${fmtSats(sats)} sats, ${days} days`}
                style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '6px 12px',
                    background: c.bg,
                    color: c.text,
                    border: `1px solid ${c.border}`,
                    borderRadius: 9999,
                    fontFamily: 'system-ui, sans-serif',
                    fontSize: 13,
                    ...style,
                }}
            >
                <strong style={{ fontWeight: 600 }}>OC</strong>
                <span style={{ color: c.muted }}>·</span>
                <span>{fmtSats(sats)} sats</span>
                <span style={{ color: c.muted }}>·</span>
                <span>{days}d</span>
                {!hideScore && scoreLabel && (
                    <>
                        <span style={{ color: c.muted }}>·</span>
                        <span style={{ color: scoreColor, fontWeight: 600 }}>{scoreLabel}</span>
                    </>
                )}
            </span>
        );
    }

    // card
    return (
        <div
            className={rootClass}
            role="region"
            aria-label="OrangeCheck proof of Bitcoin stake"
            style={{
                display: 'inline-block',
                minWidth: 280,
                padding: 16,
                background: c.bg,
                color: c.text,
                border: `1px solid ${c.border}`,
                borderRadius: 12,
                fontFamily: 'system-ui, sans-serif',
                ...style,
            }}
        >
            <div style={{ fontSize: 11, color: c.muted, marginBottom: 4, letterSpacing: 0.4 }}>
                PROOF OF BITCOIN STAKE
            </div>
            <div
                style={{
                    fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    fontSize: 13,
                    fontWeight: 500,
                    marginBottom: 12,
                }}
            >
                {shortAddr(address)}
            </div>

            {!hideScore && scoreLabel && (
                <div style={{ marginBottom: 12 }}>
                    <div style={{ fontSize: 11, color: c.muted, marginBottom: 2 }}>
                        SCORE ({algorithm})
                    </div>
                    <div style={{ fontSize: 22, fontWeight: 700, color: scoreColor }}>
                        {scoreLabel}
                    </div>
                </div>
            )}

            <div
                style={{
                    display: 'grid',
                    gridTemplateColumns: '1fr 1fr',
                    gap: 8,
                    fontSize: 12,
                }}
            >
                <div>
                    <div style={{ color: c.muted, fontSize: 11 }}>BONDED</div>
                    <div style={{ fontWeight: 600 }}>{fmtSats(sats)} sats</div>
                </div>
                <div>
                    <div style={{ color: c.muted, fontSize: 11 }}>UNSPENT</div>
                    <div style={{ fontWeight: 600 }}>{days} days</div>
                </div>
            </div>

            <div
                style={{
                    marginTop: 12,
                    paddingTop: 10,
                    borderTop: `1px solid ${c.border}`,
                    fontSize: 10,
                    color: c.muted,
                    textAlign: 'center',
                }}
            >
                Verified via BIP-322 · ochk.io
            </div>
        </div>
    );
};

export const OcBadge = memo(OcBadgeImpl);
OcBadge.displayName = 'OcBadge';
