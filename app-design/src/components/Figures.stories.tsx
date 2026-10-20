import type { Meta, StoryObj } from '@storybook/react';

import { ChartFrame, chartColor, HudCard, KeyValueList, Panel, SourceNote, Sparkline, StatCard, StatGrid } from './index';

/* btc's desk and globe's HUD are the samples: figures, their charts, and where each comes from. */
const meta: Meta = { title: 'Figures' };
export default meta;

// A year of made-up closes, two series, drawn by hand the way btc's LineChart is.
const DAYS = 60;
const price = Array.from({ length: DAYS }, (_, i) => 52 + i * 0.28 + Math.sin(i / 4) * 3 + Math.sin(i / 1.7) * 1.2);
const mean = Array.from({ length: DAYS }, (_, i) => 50 + i * 0.22);

function LineChart({ height }: { height: number }) {
    const w = 640;
    const pad = { l: 40, r: 12, t: 10, b: 22 };
    const lo = 45;
    const hi = 75;
    const x = (i: number) => pad.l + (i / (DAYS - 1)) * (w - pad.l - pad.r);
    const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b);
    const path = (s: number[]) => s.map((v, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
    return (
        <svg viewBox={`0 0 ${w} ${height}`} className="h-auto w-full" role="img" aria-label="Price and its mean over 60 days, rising from 52 to 70">
            {[50, 60, 70].map((v) => (
                <g key={v}>
                    <line className="oca-chart-grid" x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} />
                    <text className="oca-chart-tick" x={pad.l - 8} y={y(v) + 3} textAnchor="end">
                        {v}k
                    </text>
                </g>
            ))}
            <line className="oca-chart-axis" x1={pad.l} x2={w - pad.r} y1={height - pad.b} y2={height - pad.b} />
            {['Aug', 'Sep', 'Oct'].map((m, i) => (
                <text key={m} className="oca-chart-tick" x={x(i * 29)} y={height - 6} textAnchor={i === 0 ? 'start' : i === 2 ? 'end' : 'middle'}>
                    {m}
                </text>
            ))}
            <line className="oca-chart-marker" x1={x(40)} x2={x(40)} y1={pad.t} y2={height - pad.b} />
            <path d={path(mean)} fill="none" stroke={chartColor('neutral')} strokeWidth={1.5} strokeDasharray="4 3" />
            <path d={path(price)} fill="none" stroke={chartColor(0)} strokeWidth={1.7} />
        </svg>
    );
}

const source = <SourceNote source="mempool.space" href="https://mempool.space/docs/api" detail={<code>GET /api/v1/prices</code>} updated="Updated 2 min ago" />;

export const Desk: StoryObj = {
    name: 'A desk of figures',
    render: () => (
        <div className="flex max-w-5xl flex-col gap-6">
            <StatGrid>
                <StatCard label="Price" value="$68,240" delta={{ value: 2.4, suffix: '%', label: '24h' }} />
                <StatCard label="Fees, next block" value="12 sat/vB" delta={{ value: -18, suffix: '%', good: 'down', label: '24h' }} />
                <StatCard label="Hashrate" value="642 EH/s" delta={{ value: 0 }} />
            </StatGrid>
            <Panel
                title="Price and its 200-week mean"
                description="Daily close, 60 days"
                expandable
                source={<SourceNote variant="line" source="mempool.space" href="https://mempool.space/docs/api" updated="Updated 2 min ago" />}
            >
                {(expanded) => (
                    <ChartFrame
                        legend={[
                            { label: 'Price', color: 1 },
                            { label: '200-week mean', color: 'neutral', dashed: true },
                        ]}
                    >
                        <LineChart height={expanded ? 420 : 220} />
                    </ChartFrame>
                )}
            </Panel>
            <div className="grid gap-6 md:grid-cols-2">
                <Panel title="On-chain" actions={source}>
                    <KeyValueList
                        items={[
                            { label: 'MVRV', value: '1.8', note: 'Fair value', tone: 'good' },
                            { label: 'Puell multiple', value: '0.62', note: 'Miners under strain', tone: 'caution' },
                            { label: 'Funding rate', value: '0.041%', note: 'Crowded long', tone: 'bad' },
                            { label: 'Days since halving', value: '548' },
                        ]}
                    />
                </Panel>
                <Panel title="Trends, 30 days">
                    <ul className="flex flex-col divide-y divide-border">
                        {[
                            { label: 'Active addresses', values: [8, 9, 9, 11, 10, 12, 14, 13, 15, 17], tone: 'trend' as const },
                            { label: 'Exchange balance', values: [20, 19, 19, 18, 17, 17, 16, 15, 15, 14], tone: 'trend' as const },
                            { label: 'Lightning capacity', values: [5, 5, 6, 6, 6, 7, 7, 7, 8, 8], tone: 2 as const },
                        ].map((t) => (
                            <li key={t.label} className="flex items-center justify-between gap-4 py-3 text-[0.9375rem]">
                                {t.label}
                                <Sparkline values={t.values} tone={t.tone} area label={`${t.label}, 30 days, ${t.values[0]} to ${t.values[t.values.length - 1]}`} className="h-6 w-28" />
                            </li>
                        ))}
                    </ul>
                </Panel>
            </div>
        </div>
    ),
};

export const Series: StoryObj = {
    name: 'Chart colours',
    render: () => (
        <div className="flex max-w-xl flex-col gap-3">
            <p className="oca-body">
                Four series and a neutral, orange first. Each clears 3:1 on the card and the page, and every pair stays apart with red-green
                colour blindness too. Up and down are the status colours.
            </p>
            <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {([1, 2, 3, 4, 'neutral', 'up', 'down'] as const).map((t) => (
                    <li key={t} className="flex items-center gap-2 rounded-xl border border-border bg-card px-3 py-2 text-[0.875rem]">
                        <span aria-hidden className="h-1 w-6 rounded-full" style={{ background: chartColor(t) }} />
                        {typeof t === 'number' ? `Series ${t}` : t}
                    </li>
                ))}
            </ul>
        </div>
    ),
};

export const Hud: StoryObj = {
    name: 'HUD over a scene',
    parameters: { fullBleed: true },
    render: () => (
        <div className="relative h-[34rem] overflow-hidden bg-[radial-gradient(circle_at_40%_45%,#f66d36_0,#7a2e10_18%,#0a0a0a_45%)]">
            <div className="absolute bottom-4 right-4 flex flex-col gap-3">
                <HudCard eyebrow="Next block" live title="~4 min" footer={<SourceNote variant="line" source="mempool.space" updated="Every block" />}>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full w-[62%] rounded-full bg-oca-orange-deep" />
                    </div>
                    <p className="flex justify-between text-muted-foreground">
                        Fees <span className="text-foreground oca-tabular">12 sat/vB</span>
                    </p>
                </HudCard>
                <HudCard eyebrow="Difficulty" title="+3.2%">
                    <p className="text-muted-foreground">Retarget in 1,204 blocks.</p>
                </HudCard>
            </div>
        </div>
    ),
};
