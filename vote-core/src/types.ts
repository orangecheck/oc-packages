// Types for oc-vote-protocol v0 objects.
// Mirrors the schemas in SPEC.md §3 (poll), §4 (ballot), §6.3 (reveal).

/** SPEC §12. The `v: 0` on each interface below is a compile-time literal, and
 *  types are erased — these constants are what the runtime gates compare
 *  against, the same role `ENVELOPE_VERSION` plays in lock/stamp/pledge/agent. */
export const POLL_VERSION = 0 as const;
export const BALLOT_VERSION = 0 as const;
export const REVEAL_VERSION = 0 as const;

export type WeightMode = 'one_per_address' | 'sats' | 'sats_days' | string;
export type PollMode = 'public' | 'secret';
export type Tiebreak = 'latest' | 'first';

export interface PollOption {
    id: string;
    label: string;
}

export interface BipSig {
    alg: 'bip322';
    pubkey: string;
    value: string;
}

export interface WeightParams {
    cap_days?: number;
    [k: string]: unknown;
}

export interface Poll {
    v: 0;
    kind: 'oc-vote/poll';
    creator: string;
    question: string;
    options: PollOption[];
    deadline: string;
    snapshot_block: number | 'deadline';
    weight_mode: WeightMode;
    weight_params: WeightParams | null;
    min_sats: number;
    min_days: number;
    mode: PollMode;
    reveal_pk: string | null;
    tiebreak: Tiebreak;
    notes: string | null;
    created_at: string;
    sig: BipSig;
}

export interface BallotSecret {
    /** OC Lock v2 envelope encrypting the chosen option id to the poll's reveal_pk. */
    envelope: Record<string, unknown>;
    /** SHA-256 of `oc-vote/v0/commit\npoll_id: …\nvoter: …\noption: …\n`. */
    commit: string;
}

export interface Ballot {
    v: 0;
    kind: 'oc-vote/ballot';
    poll_id: string;
    voter: string;
    /** In public mode: the chosen option id, or "withdraw". In secret mode: null. */
    option: string | null;
    attestation_id: string | null;
    secret: BallotSecret | null;
    created_at: string;
    sig: BipSig;
}

export interface Reveal {
    v: 0;
    kind: 'oc-vote/reveal';
    poll_id: string;
    reveal_sk: string;
    revealed_at: string;
    sig: BipSig;
}

/** A UTXO at a snapshot block, for weight computation. */
export interface Utxo {
    value: number;
    confirmed_height: number;
}

/** `(addr, snapshot_height) -> list of UTXOs controlled by addr at that height`. */
export type UtxoLookup = (addr: string, snapshot: number) => Utxo[] | Promise<Utxo[]>;

export interface TallyTurnout {
    voters: number;
    weight: number;
}

/** Fields every tally result carries (SPEC §8). */
export interface TallyResultHead {
    /** What decided whether a ballot was in time: its anchor, or the voter's own `created_at`. */
    basis: 'anchored' | 'voter_clocks';
    /** `H_close` for an anchored poll, null until a block's median_time_past passes the deadline; absent otherwise. */
    close_height?: number | null;
}

export interface TalliedResult extends TallyResultHead {
    /** `provisional` until an anchored poll's tip reaches `H_close + G + 6` (SPEC §4.6, §8). */
    state: 'tallied' | 'provisional';
    snapshot_block: number;
    turnout: TallyTurnout;
    tallies: Record<string, number>;
    /** Ascending `ballot_id` of the ballot that stood for each voter, withdrawals and zero weights included. */
    counted: string[];
    /** Provisional tallies only: how many counted ballots have no anchor at or below `H_close + G` yet. */
    unanchored?: number;
}

export interface AwaitingRevealResult extends TallyResultHead {
    state: 'awaiting_reveal';
}

/** The snapshot block is not yet known or has fewer than 6 confirmations (SPEC §10.5). */
export interface DeferredResult extends TallyResultHead {
    state: 'deferred';
    code: 'E_REORG';
}

export type TallyResult = TalliedResult | AwaitingRevealResult | DeferredResult;

/** Error codes per SPEC §9. Non-weight-returning conditions. */
export type VoteErrorCode =
    | 'E_BAD_SIG'
    | 'E_WRONG_POLL'
    | 'E_PAST_DEADLINE'
    | 'E_UNKNOWN_OPTION'
    | 'E_COMMIT_MISMATCH'
    | 'E_BELOW_THRESHOLD'
    | 'E_NO_REVEAL'
    | 'E_NOT_ANCHORED'
    | 'E_REORG'
    | 'E_UNSUPPORTED_MODE';
