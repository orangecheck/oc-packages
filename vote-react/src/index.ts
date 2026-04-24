// @orangecheck/vote-react — drop-in React components for OC Vote.
//
// <OcPoll pollId="…" />       full poll card with live tally bars + vote CTA
// <OcTallyBadge pollId="…" /> compact inline pill — top option + percentage
// useTally(pollId)             React hook for custom rendering
//
// Read-only by design. Voting / creating polls requires a Bitcoin wallet
// and happens on vote.ochk.io (or your own fork of oc-vote-web). These
// components embed the tally; they don't sign anything.

export { OcPoll, type OcPollProps } from './poll.js';
export { OcTallyBadge, type OcTallyBadgeProps } from './badge.js';
export { useTally, type UseTallyOptions, type UseTallyState } from './use-tally.js';
export {
    DEFAULT_API_BASE,
    POLL_ID_RE,
    THEMES,
    type TallyResponse,
    type TallyTurnout,
    type Theme,
} from './types.js';
