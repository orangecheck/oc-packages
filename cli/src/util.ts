/**
 * Tiny helpers shared by every subcommand.
 */

export async function readStdin(): Promise<string> {
    // Returns '' if stdin is a TTY (interactive) rather than piped.
    if (process.stdin.isTTY) return '';
    const chunks: Buffer[] = [];
    for await (const chunk of process.stdin as AsyncIterable<Buffer>) {
        chunks.push(chunk);
    }
    return Buffer.concat(chunks).toString('utf8');
}

export function exitWithJson(payload: unknown, code = 0): never {
    process.stdout.write(JSON.stringify(payload, null, 2) + '\n');
    process.exit(code);
}

export function die(message: string, code = 1): never {
    process.stderr.write(`error: ${message}\n`);
    process.exit(code);
}

export function parseIdentity(s: string): { protocol: string; identifier: string } {
    const i = s.indexOf(':');
    if (i === -1) die(`identity must be protocol:identifier, got ${JSON.stringify(s)}`);
    return { protocol: s.slice(0, i), identifier: s.slice(i + 1) };
}

/** Reads that did not finish, most decisive first (sdk 1.21.0's unreadReason, read here by name). */
const UNREAD = ['utxo_cap_unread', 'provider_refused_unread', 'chain_unread', 'attestation_unread', 'stake_unread'];

/**
 * Which read did not finish in a check() `reasons` or verify() `codes` list, or
 * null when the answer is a verdict. Before sdk 1.21.0, a chain API that never
 * answered came back as `bad_request` beside a verified signature: unread too.
 */
export function unreadOf(codes: readonly string[] | undefined): string | null {
    const list = codes ?? [];
    const named = UNREAD.find((u) => list.includes(u));
    if (named) return named;
    const sigOk = list.some((c) => c === 'sig_ok_bip322' || c === 'sig_ok_legacy');
    return sigOk && list.includes('bad_request') ? 'chain_unread' : null;
}

/** Exit code for an answer that concluded nothing: 2 is "no", and this is not one. */
export const EXIT_UNREAD = 3;

/** What an unread answer means, in words. */
export function unreadWords(unread: string, status?: number): string {
    switch (unread) {
        case 'utxo_cap_unread':
            return 'this address holds more coins than the chain API lists, so nothing is concluded';
        case 'provider_refused_unread':
            return `the chain API refused this lookup${status ? ` (HTTP ${status})` : ''}; nothing is concluded`;
        case 'attestation_unread':
            return 'the relays did not finish the read, so nothing is concluded. Try again';
        case 'stake_unread':
            return "the address's other attestations could not be read in full, so nothing is concluded. Try again";
        default:
            return 'the chain API did not answer, so nothing is concluded. Try again';
    }
}
