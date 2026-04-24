// Types for oc-vote-protocol v0 objects.
// Mirrors the schemas in SPEC.md §3 (poll), §4 (ballot), §6.3 (reveal).

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

export interface TalliedResult {
    state: 'tallied';
    snapshot_block: number;
    turnout: TallyTurnout;
    tallies: Record<string, number>;
}

export interface AwaitingRevealResult {
    state: 'awaiting_reveal';
}

export type TallyResult = TalliedResult | AwaitingRevealResult;

/** Error codes per SPEC §9. Non-weight-returning conditions. */
export type VoteErrorCode =
    | 'E_BAD_SIG'
    | 'E_WRONG_POLL'
    | 'E_PAST_DEADLINE'
    | 'E_UNKNOWN_OPTION'
    | 'E_COMMIT_MISMATCH'
    | 'E_BELOW_THRESHOLD'
    | 'E_NO_REVEAL'
    | 'E_REORG'
    | 'E_UNSUPPORTED_MODE';
