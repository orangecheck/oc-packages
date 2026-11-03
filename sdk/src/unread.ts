/**
 * Unread is not a verdict. When check() or verify() could not read what its
 * answer rests on, `reasons` / `codes` say so with one of these, and the answer
 * is `ok: false` with no `below_min_*`: nothing is concluded about the subject.
 * `sats`, `days` and `score` beside any of them are not a reading.
 *
 * - `chain_unread`: no chain API answered for the coins (429, 5xx, timeout,
 *   network). Asking again later may help. The only one a caller's failOpen
 *   may cover, and only behind a signature that verified.
 * - `utxo_cap_unread`: the address holds more coins than the chain APIs list
 *   (about 500 on mempool.space). Asking again does not help, and anyone can
 *   put an address there by sending it dust, so it never fails open.
 * - `provider_refused_unread`: a chain API refused the lookup (a 4xx other
 *   than 429; `chain_status` says which). Never fails open.
 * - `attestation_unread`: the relays did not finish the read, or forged copies
 *   used up the signature budget. Ask again.
 * - `stake_unread`: the address's other attestations could not be read in
 *   full, so one address, one bond was not checked. Ask again.
 */
export type UnreadReason =
    | 'utxo_cap_unread'
    | 'provider_refused_unread'
    | 'chain_unread'
    | 'attestation_unread'
    | 'stake_unread';

/** In the order they outrank each other: a cap or a refusal beats an outage. */
const UNREAD: readonly UnreadReason[] = [
    'utxo_cap_unread',
    'provider_refused_unread',
    'chain_unread',
    'attestation_unread',
    'stake_unread',
];

/**
 * Which unread a check() `reasons` or a verify() `codes` list holds, or null
 * when the answer is a reading. Decode with this before mapping any other
 * reason to words: beside `chain_unread`, `bad_request` means the chain did not
 * answer, never that the attestation is malformed.
 */
export function unreadReason(reasonsOrCodes: readonly string[] | undefined): UnreadReason | null {
    const list = reasonsOrCodes ?? [];
    return UNREAD.find((u) => list.includes(u)) ?? null;
}
