// Wire types for the /api/tally response, the fields the components render.
// vote.ochk.io's answer carries poll_id, state, snapshot_block, turnout,
// tallies, ballot_count, reveal_published and deadline. question, creator,
// weight_mode and mode come only from initialData or a server that adds them.

export interface TallyTurnout {
    voters: number;
    weight: number;
}

export interface TallyResponse {
    poll_id: string;
    /** 200: `tallied`, `provisional` (an anchored poll's count before it is
     *  final) or `awaiting_reveal`. 409: `deferred` (the snapshot block is not
     *  yet buried), which `useTally` reports as an error. `unread` (vote-core
     *  2.2.0: some voters' coins could not be read, so there is no count)
     *  comes once vote.ochk.io runs that version. */
    state: 'tallied' | 'provisional' | 'awaiting_reveal' | 'deferred' | 'unread';
    question?: string;
    creator?: string;
    /** The poll's deadline (iso8601_utc), sent by vote.ochk.io since oc-vote-web `8f135c54`. OcPoll reads open or closed by it. */
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
