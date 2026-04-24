// @orangecheck/vote-core — reference implementation of oc-vote-protocol v0.
//
// This package is the normative tally function and canonicalization toolkit for
// the OC Vote protocol. It is a pure library: no Nostr, no wallet, no UI.
// Consumers (oc-vote-web, oc-vote-cli, third-party clients) compose around it.
//
// Protocol spec: https://github.com/orangecheck/oc-vote-protocol

export { canonicalBytes, canonicalize } from './canonical.js';
export { ballotId, pollId, revealId } from './ids.js';
export { buildCommitMessage, commit } from './commit.js';
export {
    ageDays,
    isSupportedMode,
    qualifyingUtxos,
    totalQualifyingSats,
    voterWeight,
} from './weight.js';
export { tally } from './tally.js';
export type {
    AwaitingRevealResult,
    Ballot,
    BallotSecret,
    BipSig,
    Poll,
    PollMode,
    PollOption,
    Reveal,
    TalliedResult,
    TallyResult,
    TallyTurnout,
    Tiebreak,
    Utxo,
    UtxoLookup,
    VoteErrorCode,
    WeightMode,
    WeightParams,
} from './types.js';
