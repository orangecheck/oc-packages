/**
 * A chain API answered about the address without listing its coins (sdk
 * 1.21.0): past the ~500-UTXO cap (`utxo_cap_unread`), or a refusal such as a
 * 403 (`provider_refused_unread`). Unread, never an outage: anyone can put an
 * address past the cap by sending it dust, so `failOpen` never covers either.
 */
export function chainRefused(codes: readonly string[] = []): 'utxo_cap_unread' | 'provider_refused_unread' | null {
    if (codes.includes('utxo_cap_unread')) return 'utxo_cap_unread';
    if (codes.includes('provider_refused_unread')) return 'provider_refused_unread';
    return null;
}

/**
 * The signature verified but no chain API answered: sdk 1.21.0 says
 * `chain_unread`; before it, verify() reported `bad_request` after a `sig_ok_*`
 * code. The bond is unknown, not absent: the only state `failOpen` may let
 * through.
 */
export function chainUnreachable(codes: readonly string[] = []): boolean {
    if (chainRefused(codes)) return false;
    return (
        codes.includes('chain_unread') ||
        (codes.includes('bad_request') && codes.some((c) => c === 'sig_ok_bip322' || c === 'sig_ok_legacy'))
    );
}

/** What a relay tells a writer whose address's coins a chain API would not list. */
export function refusedMessage(refused: 'utxo_cap_unread' | 'provider_refused_unread', status?: number): string {
    return refused === 'utxo_cap_unread'
        ? 'orangecheck: this Bitcoin address holds more coins than the chain API lists, so its bond cannot be read; bond from an address that holds fewer coins'
        : `orangecheck: the chain API refused this lookup${status ? ` (HTTP ${status})` : ''}; nothing is concluded`;
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
