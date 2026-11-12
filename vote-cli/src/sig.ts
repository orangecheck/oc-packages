// Interactive signature prompt.
// The CLI never holds a Bitcoin private key. To sign a poll / ballot / reveal,
// the caller either passes --sig <base64> on the command line, or we compute
// the canonical id, print it, and ask the user to sign elsewhere (UniSat,
// Xverse, Leather, sparrow-wallet, any BIP-322 signer) and paste back.

import { createInterface } from 'node:readline/promises';

const CLOSED = Symbol('closed');
const INTERRUPTED = Symbol('interrupted');

export async function promptForSignature(
    address: string,
    id: string,
    preset?: string
): Promise<string> {
    if (preset && preset.trim()) return preset.trim();

    process.stderr.write(
        `\n  sign with BIP-322, address ${address}\n` +
            `  message: ${id}\n\n` +
            `  paste the base64 signature and press enter:\n`
    );
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    // The first line, or why there is none: a pending question never settles once input closes.
    const line = await new Promise<string | typeof CLOSED | typeof INTERRUPTED>((resolve) => {
        rl.once('line', resolve);
        rl.once('close', () => resolve(CLOSED));
        // Ctrl-C on a terminal; without a listener readline closes and it reads as closed input.
        rl.once('SIGINT', () => resolve(INTERRUPTED));
        // readline draws this prompt again on every redraw of the line.
        rl.setPrompt('  > ');
        rl.prompt();
    });
    rl.close();
    // End the prompt's line, so the error starts on its own.
    if (typeof line !== 'string') process.stderr.write('\n');
    if (line === INTERRUPTED) throw new Error('no signature: interrupted');
    if (line === CLOSED) throw new Error('no signature: input closed before a line');
    const sig = line.trim();
    if (!sig) throw new Error('empty signature');
    return sig;
}
