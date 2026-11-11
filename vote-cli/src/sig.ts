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
    // The first line, or undefined once input closes: a pending question never settles then.
    const line = await new Promise<string | undefined>((resolve) => {
        rl.once('line', resolve);
        rl.once('close', () => resolve(undefined));
    });
    rl.close();
    if (line === undefined) throw new Error('no signature: input closed before a line');
    const sig = line.trim();
    if (!sig) throw new Error('empty signature');
    return sig;
}
