// Interactive signature prompt.
// The CLI never holds a Bitcoin private key. To sign a poll / ballot / reveal,
// the caller either passes --sig <base64> on the command line, or we compute
// the canonical id, print it, and ask the user to sign elsewhere (UniSat,
// Xverse, Leather, sparrow-wallet, any BIP-322 signer) and paste back.

import { createInterface } from 'node:readline/promises';

export async function promptForSignature(
    address: string,
    id: string,
    preset?: string
): Promise<string> {
    if (preset && preset.trim()) return preset.trim();

    process.stderr.write(
        `\n  sign with BIP-322, address ${address}\n` +
            `  message: ${id}\n\n` +
            `  paste the base64 signature and press enter:\n  > `
    );
    const rl = createInterface({ input: process.stdin, output: process.stderr });
    const sig = (await rl.question('')).trim();
    rl.close();
    if (!sig) throw new Error('empty signature');
    return sig;
}
