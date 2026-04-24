'use client';

/**
 * <OcTallyBadge pollId="…" />
 *
 * Compact inline pill. Shows:
 *   - a colored dot (green=tallied, orange=awaiting_reveal, gray=loading, red=error)
 *   - the top option + its percentage (tallied), or the state label (otherwise)
 *   - a subtle link to vote.ochk.io/p/<id>
 *
 * Use on a feed row / profile card / sidebar. For the full poll card, use <OcPoll />.
 */

import type { CSSProperties } from 'react';
import { memo, useMemo } from 'react';

import { THEMES, type Theme, type TallyResponse } from './types.js';
import { useTally } from './use-tally.js';

export interface OcTallyBadgeProps {
    /** 64-hex poll id. */
    pollId: string;
    /** Theme. Default `light`. */
    theme?: 'light' | 'dark';
    /** Override /api/tally origin. Default `https://vote.ochk.io`. */
    baseUrl?: string;
    /** Auto-refresh interval in ms. Default 60000. Set to 0 to disable. */
    refreshMs?: number;
    /** Supply SSR-hydrated data to skip the initial fetch. */
    initialData?: TallyResponse;
    /** Extra class on the outer element. */
    className?: string;
    /** Inline style override. */
    style?: CSSProperties;
    /** Target for the link. Default `_blank`. */
    target?: '_blank' | '_self';
}

const OcTallyBadgeImpl = ({
    pollId,
    theme = 'light',
    baseUrl,
    refreshMs,
    initialData,
    className,
    style,
    target = '_blank',
}: OcTallyBadgeProps) => {
    const { data, error, loading } = useTally(pollId, {
        ...(baseUrl !== undefined ? { baseUrl } : {}),
        ...(refreshMs !== undefined ? { refreshMs } : {}),
        ...(initialData !== undefined ? { initialData } : {}),
    });
    const t = THEMES[theme];

    const { dotColor, label } = useMemo(() => renderState(data, error, loading, t), [data, error, loading, t]);

    const href = `${baseUrl ?? 'https://vote.ochk.io'}/p/${pollId}`;

    const outerStyle: CSSProperties = {
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        padding: '4px 10px',
        border: `1px solid ${t.border}`,
        borderRadius: 6,
        background: t.bg,
        color: t.text,
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: 12,
        textDecoration: 'none',
        lineHeight: 1.4,
        ...style,
    };

    return (
        <a
            href={href}
            target={target}
            rel={target === '_blank' ? 'noopener noreferrer' : undefined}
            className={className}
            style={outerStyle}
            data-slot="oc-tally-badge"
        >
            <span
                aria-hidden
                style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: dotColor,
                    flexShrink: 0,
                }}
            />
            <span style={{ fontWeight: 600 }}>oc vote</span>
            <span style={{ color: t.muted }}>·</span>
            <span>{label}</span>
        </a>
    );
};

function renderState(
    data: TallyResponse | null,
    error: Error | null,
    loading: boolean,
    t: Theme
): { dotColor: string; label: string } {
    if (error) return { dotColor: '#ef4444', label: error.message };
    if (loading && !data) return { dotColor: t.muted, label: 'loading…' };
    if (!data) return { dotColor: t.muted, label: 'no data' };
    if (data.state === 'awaiting_reveal')
        return { dotColor: t.accent, label: `awaiting reveal · ${data.ballot_count ?? 0} ballots` };
    if (data.state !== 'tallied') return { dotColor: t.muted, label: String(data.state) };

    const total = data.turnout?.weight ?? 0;
    const tallies = data.tallies ?? {};
    const sorted = Object.entries(tallies).sort((a, b) => b[1] - a[1]);
    if (sorted.length === 0 || total === 0) return { dotColor: t.muted, label: 'no ballots yet' };

    const [topId, topW] = sorted[0]!;
    const pct = (topW / total) * 100;
    return {
        dotColor: '#10b981',
        label: `${topId} · ${pct.toFixed(0)}% of ${fmt(total)}`,
    };
}

function fmt(n: number): string {
    if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(1) + 'B';
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
    if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
    return String(n);
}

export const OcTallyBadge = memo(OcTallyBadgeImpl);
