// The pasted signature is the first line of stdin. Each case settles: a prompt
// left waiting once stdin ends would exit 0 with nothing published.

import { Readable } from 'node:stream';

import { describe, expect, it, vi } from 'vitest';

import { promptForSignature } from './sig';

const ADDRESS = 'bc1q0xcqpzrky6eff2g52qdye53xkk9jxkvrh6yhyw';
const ID = 'a'.repeat(64);
const SIG = 'AkgwRQIhAMSbe2WgHm/1lckPnH8N5zUk24iEqrRap/uFNAZbdasqAiB2GZD/KUdtxj88uapzC5xn5lgNj5t0tccCCoWGpWs67wEh';

async function fromStdin(chunks: string[], preset?: string): Promise<{ sig?: string; thrown?: string; read: boolean }> {
    let read = false;
    const stream = Readable.from(chunks);
    stream.on('data', () => (read = true));
    const stdin = vi.spyOn(process, 'stdin', 'get').mockReturnValue(stream as never);
    const write = vi.spyOn(process.stderr, 'write').mockImplementation(() => true);
    try {
        return { sig: await promptForSignature(ADDRESS, ID, preset), read };
    } catch (e) {
        return { thrown: (e as Error).message, read };
    } finally {
        stdin.mockRestore();
        write.mockRestore();
    }
}

describe('promptForSignature', () => {
    it('throws when stdin closes before a line', { timeout: 3000 }, async () => {
        expect(await fromStdin([])).toMatchObject({ thrown: 'no signature: input closed before a line' });
    });

    it('takes a last line that has no newline', { timeout: 3000 }, async () => {
        expect(await fromStdin([SIG])).toMatchObject({ sig: SIG });
    });

    it('takes only the first line', { timeout: 3000 }, async () => {
        expect(await fromStdin([`${SIG}\nsomething else\n`])).toMatchObject({ sig: SIG });
    });

    it('throws on an empty line', { timeout: 3000 }, async () => {
        expect(await fromStdin(['  \n'])).toMatchObject({ thrown: 'empty signature' });
    });

    it('returns a --sig value without reading stdin', { timeout: 3000 }, async () => {
        expect(await fromStdin([], ` ${SIG} `)).toEqual({ sig: SIG, read: false });
    });
});
