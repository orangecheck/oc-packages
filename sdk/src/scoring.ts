/**
 * OrangeCheck Scoring
 *
 * The protocol registers exactly one scoring algorithm: `v0`. A `tier` helper
 * is also provided for UI convenience. RPs with specialized needs compute
 * their own score against raw metrics — the protocol does not ship an
 * algorithm zoo.
 *
 * See: docs/oc-protocol/registry/scoring.md
 */

export type ScoringAlgorithm = 'v0' | 'tier' | 'none';
export type Tier = 'platinum' | 'gold' | 'silver' | 'bronze' | 'none';
export type ScoreResult = number | Tier | null;

export interface ScoringConfig {
    algorithm: ScoringAlgorithm;
}

function scoreV0(sats: number, days: number): number {
    if (sats <= 0 || days <= 0) return 0;
    return Math.round(Math.log(1 + sats) * (1 + days / 30) * 100) / 100;
}

function scoreTier(sats: number, days: number): Tier {
    if (sats >= 10_000_000 && days >= 365) return 'platinum';
    if (sats >= 1_000_000 && days >= 180) return 'gold';
    if (sats >= 100_000 && days >= 90) return 'silver';
    if (sats >= 10_000 && days >= 30) return 'bronze';
    return 'none';
}

export function computeScore(sats: number, days: number, config: ScoringConfig): ScoreResult {
    switch (config.algorithm) {
        case 'v0':
            return scoreV0(sats, days);
        case 'tier':
            return scoreTier(sats, days);
        case 'none':
            return null;
    }
}

export function computeAllScores(sats: number, days: number) {
    return { v0: scoreV0(sats, days), tier: scoreTier(sats, days) };
}

export function formatScore(score: ScoreResult, algorithm: ScoringAlgorithm): string {
    if (score === null || algorithm === 'none') return 'N/A';
    if (algorithm === 'v0') return (score as number).toFixed(1);
    const tier = score as Tier;
    const labels: Record<Tier, string> = {
        platinum: 'Platinum',
        gold: 'Gold',
        silver: 'Silver',
        bronze: 'Bronze',
        none: '—',
    };
    return labels[tier];
}

export function getScoreColor(score: ScoreResult, algorithm: ScoringAlgorithm): string {
    if (algorithm === 'tier') {
        const colors: Record<Tier, string> = {
            platinum: '#a855f7',
            gold: '#eab308',
            silver: '#94a3b8',
            bronze: '#f97316',
            none: '#64748b',
        };
        return colors[(score as Tier) ?? 'none'] ?? '#64748b';
    }
    const n = (score as number) ?? 0;
    if (n >= 100) return '#22c55e';
    if (n >= 50) return '#3b82f6';
    if (n >= 20) return '#eab308';
    return '#f97316';
}

export function getTierNumber(tier: Tier): number {
    const map: Record<Tier, number> = {
        platinum: 4,
        gold: 3,
        silver: 2,
        bronze: 1,
        none: 0,
    };
    return map[tier] ?? 0;
}
