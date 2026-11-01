/**
 * The signature verified but neither Esplora endpoint answered (sdk verify()
 * reports `bad_request` after a `sig_ok_*` code). The bond is unknown, not
 * absent: the only state `failOpen` may let through.
 */
export function chainUnreachable(codes: readonly string[] = []): boolean {
    return codes.includes('bad_request') && codes.some((c) => c === 'sig_ok_bip322' || c === 'sig_ok_legacy');
}

/**
 * The SDK could not read what its verdict rests on, and nothing else failed:
 * `stake_unread` (sdk 1.18.3) as the one reason, where everything else passed
 * and a flood cut off the read of the address's other attestations. Beside any
 * other reason the proof has failed on that reason, and is judged by it.
 */
export function readIncomplete(codes: readonly string[] = []): boolean {
    return codes.length === 1 && codes[0]!.endsWith('_unread');
}
