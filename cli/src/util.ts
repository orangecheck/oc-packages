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
