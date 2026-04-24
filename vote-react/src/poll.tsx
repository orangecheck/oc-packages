'use client';

/**
 * <OcPoll pollId="…" />
 *
 * Full poll card: question, options as bars, turnout, status pill, "cast a
 * ballot" CTA that opens vote.ochk.io/p/<id> in a new tab.
 *
 * Read-only — the component doesn't sign anything. Voting requires a Bitcoin
 * wallet; we delegate that to the full web app at vote.ochk.io. Embed this
 * card in your own site / Discord webhook preview / docs page as the
 * canonical reference view.
 */

import type { CSSProperties } from 'react';
import { memo, useMemo } from 'react';

import { THEMES, type Theme, type TallyResponse } from './types.js';
import { useTally } from './use-tally.js';

export interface OcPollProps {
    /** 64-hex poll id. */
    pollId: string;
    /** Theme. Default `light`. */
    theme?: 'light' | 'dark';
    /** Override /api/tally origin. Default `https://vote.ochk.io`. */
    baseUrl?: string;
    /** Auto-refresh interval in ms. Default 60000. Set to 0 to disable. */
    refreshMs?: number;
    /** SSR-hydrated initial data. */
    initialData?: TallyResponse;
    /** Extra class on the outer element. */
    className?: string;
    /** Inline style override. */
    style?: CSSProperties;
    /** Hide the "cast a ballot" CTA (read-only mode). */
    hideCta?: boolean;
}

const OcPollImpl = ({
    pollId,
    theme = 'light',
    baseUrl,
    refreshMs,
    initialData,
    className,
    style,
    hideCta = false,
}: OcPollProps) => {
    const { data, error, loading } = useTally(pollId, {
        ...(baseUrl !== undefined ? { baseUrl } : {}),
        ...(refreshMs !== undefined ? { refreshMs } : {}),
        ...(initialData !== undefined ? { initialData } : {}),
    });
    const t = THEMES[theme];
    const resolvedBase = baseUrl ?? 'https://vote.ochk.io';
    const isPast = data?.deadline ? Date.parse(data.deadline) < Date.now() : false;

    const total = data?.turnout?.weight ?? 0;
    const sorted = useMemo(() => {
        if (!data?.tallies) return [] as Array<[string, number]>;
        return Object.entries(data.tallies).sort((a, b) => b[1] - a[1]);
    }, [data]);

    const outerStyle: CSSProperties = {
        border: `1px solid ${t.border}`,
        borderRadius: 8,
        background: t.bg,
        color: t.text,
        fontFamily:
            'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif',
        fontSize: 14,
        lineHeight: 1.5,
        padding: 16,
        maxWidth: 520,
        ...style,
    };
    const monoStyle: CSSProperties = {
        fontFamily: 'ui-monospace, Menlo, monospace',
        fontSize: 11,
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
        color: t.muted,
    };

    return (
        <div className={className} style={outerStyle} data-slot="oc-poll">
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                <div style={monoStyle}>oc vote · {data?.weight_mode?.replace('_', ' ') ?? '—'}</div>
                <StatusPill data={data} error={error} loading={loading} theme={t} />
            </div>
            <div style={{ fontSize: 18, fontWeight: 700, lineHeight: 1.25, marginBottom: 10 }}>
                {data?.question ?? (loading ? 'loading poll…' : error ? error.message : pollId.slice(0, 16) + '…')}
            </div>

            {data?.state === 'awaiting_reveal' ? (
                <div
                    style={{
                        padding: 10,
                        border: `1px solid ${t.border}`,
                        background: t.accentSoft,
                        color: t.text,
                        fontSize: 13,
                    }}
                >
                    <strong style={{ color: t.accent }}>awaiting reveal</strong> — the creator
                    of this secret-mode poll has not yet published reveal_sk.{' '}
                    <span style={{ color: t.muted }}>
                        ballots observed: {data.ballot_count ?? 0}
                    </span>
                </div>
            ) : data?.state === 'tallied' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {sorted.map(([opt, weight]) => {
                        const pct = total > 0 ? (weight / total) * 100 : 0;
                        return (
                            <div key={opt}>
                                <div
                                    style={{
                                        display: 'flex',
                                        justifyContent: 'space-between',
                                        fontSize: 13,
                                        marginBottom: 4,
                                    }}
                                >
                                    <span style={{ fontWeight: 600 }}>{opt}</span>
                                    <span style={{ color: t.muted, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 12 }}>
                                        {fmt(weight)} · {pct.toFixed(1)}%
                                    </span>
                                </div>
                                <div
                                    style={{
                                        height: 6,
                                        background: t.border,
                                        borderRadius: 3,
                                        overflow: 'hidden',
                                    }}
                                >
                                    <div
                                        style={{
                                            height: '100%',
                                            width: `${Math.max(2, pct)}%`,
                                            background: t.accent,
                                        }}
                                    />
                                </div>
                            </div>
                        );
                    })}
                    {sorted.length === 0 && (
                        <div style={{ color: t.muted, fontSize: 13 }}>no ballots yet</div>
                    )}
                </div>
            ) : (
                <div style={{ color: t.muted, fontSize: 13 }}>
                    {loading ? 'loading…' : error?.message ?? 'no data'}
                </div>
            )}

            <div
                style={{
                    marginTop: 14,
                    paddingTop: 10,
                    borderTop: `1px solid ${t.border}`,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 8,
                    fontSize: 12,
                    color: t.muted,
                    fontFamily: 'ui-monospace, Menlo, monospace',
                }}
            >
                <span>
                    {data?.turnout?.voters ?? 0} voters
                    {data?.deadline && ' · '}
                    {data?.deadline && (isPast ? 'closed' : 'closes')}
                    {data?.deadline && ' ' + data.deadline.slice(0, 16).replace('T', ' ')}
                </span>
                {!hideCta && !isPast && (
                    <a
                        href={`${resolvedBase}/p/${pollId}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{
                            padding: '5px 10px',
                            background: t.accent,
                            color: '#0a0a0a',
                            textDecoration: 'none',
                            borderRadius: 4,
                            fontWeight: 700,
                            fontSize: 11,
                            letterSpacing: '0.05em',
                            textTransform: 'uppercase',
                        }}
                    >
                        cast a ballot →
                    </a>
                )}
            </div>
        </div>
    );
};

function StatusPill({
    data,
    error,
    loading,
    theme: t,
}: {
    data: TallyResponse | null;
    error: Error | null;
    loading: boolean;
    theme: Theme;
}) {
    let label = '—';
    let color = t.muted;
    if (error) {
        label = 'error';
        color = '#ef4444';
    } else if (loading && !data) {
        label = 'loading';
    } else if (data?.state === 'awaiting_reveal') {
        label = 'awaiting reveal';
        color = t.accent;
    } else if (data?.state === 'tallied') {
        const isPast = data.deadline ? Date.parse(data.deadline) < Date.now() : false;
        label = isPast ? 'closed' : 'open';
        color = isPast ? t.muted : '#10b981';
    }
    return (
        <span
            style={{
                padding: '2px 8px',
                border: `1px solid ${color}`,
                color,
                borderRadius: 4,
                fontSize: 10,
                letterSpacing: '0.08em',
                textTransform: 'uppercase',
                fontFamily: 'ui-monospace, Menlo, monospace',
            }}
        >
            {label}
        </span>
    );
}

function fmt(n: number): string {
    return n.toLocaleString('en-US');
}

export const OcPoll = memo(OcPollImpl);
