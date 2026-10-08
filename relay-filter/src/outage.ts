/**
 * The signature verified but neither Esplora endpoint answered (sdk verify()
 * reports `bad_request` after a `sig_ok_*` code). The bond is unknown, not
 * absent: the only state `failOpen` may let through.
 */
export function chainUnreachable(codes: readonly string[] = []): boolean {
    return codes.includes('bad_request') && codes.some((c) => c === 'sig_ok_bip322' || c === 'sig_ok_legacy');
}
