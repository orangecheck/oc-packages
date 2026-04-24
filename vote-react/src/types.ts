// Wire types for the /api/tally response.
// Deliberately a subset of what vote.ochk.io returns — we don't re-export
// every field, just what the components render.

export interface TallyTurnout {
    voters: number;
    weight: number;
}

export interface TallyResponse {
    poll_id: string;
    state: 'tallied' | 'awaiting_reveal';
    question?: string;
    creator?: string;
    deadline?: string;
    weight_mode?: string;
    mode?: 'public' | 'secret';
    snapshot_block?: number;
    turnout?: TallyTurnout;
    tallies?: Record<string, number>;
    ballot_count?: number;
    reveal_published?: boolean;
    error?: string;
}

export interface Theme {
    bg: string;
    text: string;
    muted: string;
    border: string;
    accent: string;
    accentSoft: string;
}

export const THEMES: Record<'light' | 'dark', Theme> = {
    light: {
        bg: '#ffffff',
        text: '#0a0a0a',
        muted: '#666666',
        border: '#e5e5e5',
        accent: '#f97316',
        accentSoft: '#fff4ec',
    },
    dark: {
        bg: '#0a0a0a',
        text: '#fafafa',
        muted: '#a0a0a0',
        border: '#262626',
        accent: '#fb923c',
        accentSoft: '#2a1a0a',
    },
};

export const DEFAULT_API_BASE = 'https://vote.ochk.io';

export const POLL_ID_RE = /^[0-9a-f]{64}$/;
