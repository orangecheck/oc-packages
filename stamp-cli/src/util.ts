// Shared helpers for stamp-cli commands.

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';
import { createInterface } from 'node:readline/promises';

import { verifySignature } from '@orangecheck/bip322';
import { parseStamp, StampError, type StampEnvelope } from '@orangecheck/stamp-core';

/** Read a path into bytes. */
export async function readBytes(path: string): Promise<Uint8Array> {
    const buf = await readFile(path);
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength);
}

/**
 * Stream-hash a path with SHA-256. For very large content we want to avoid
 * loading the whole file into memory; for small files the cost is negligible.
 */
export async function hashFile(path: string): Promise<{ hash: string; length: number }> {
    const bytes = await readBytes(path);
    const h = createHash('sha256').update(bytes).digest('hex');
    return { hash: 'sha256:' + h, length: bytes.byteLength };
}

/** Infer a conservative MIME from a filename. Falls back to application/octet-stream. */
export function mimeFromPath(path: string): string {
    const name = basename(path).toLowerCase();
    const ext = name.split('.').pop();
    switch (ext) {
        case 'md':
        case 'markdown':
            return 'text/markdown';
        case 'txt':
            return 'text/plain';
        case 'html':
        case 'htm':
            return 'text/html';
        case 'json':
            return 'application/json';
        case 'pdf':
            return 'application/pdf';
        case 'png':
            return 'image/png';
        case 'jpg':
        case 'jpeg':
            return 'image/jpeg';
        case 'gif':
            return 'image/gif';
        case 'webp':
            return 'image/webp';
        case 'mp3':
            return 'audio/mpeg';
        case 'mp4':
            return 'video/mp4';
        case 'wav':
            return 'audio/wav';
        case 'zip':
            return 'application/zip';
        case 'tar':
            return 'application/x-tar';
        case 'gz':
            return 'application/gzip';
        default:
            return 'application/octet-stream';
    }
}

export async function pathExists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

/**
 * Read a .stamp file (or `-` for stdin) and check every field's form with
 * parseStamp before anything reads it. A file that is not an envelope exits
 * with the field it failed on.
 */
export async function readStamp(pathOrDash: string): Promise<StampEnvelope> {
    const text =
        pathOrDash === '-' || pathOrDash === '/dev/stdin'
            ? await readStdin()
            : ((await readFile(pathOrDash, 'utf8')) as string);
    try {
        return parseStamp(text);
    } catch (e) {
        if (e instanceof StampError) die(`${pathOrDash} is not a stamp envelope (${e.code}): ${e.message}`);
        throw e;
    }
}

function readStdin(): Promise<string> {
    return new Promise((resolve, reject) => {
        let data = '';
        process.stdin.setEncoding('utf8');
        process.stdin.on('data', (chunk) => {
            data += chunk;
        });
        process.stdin.on('end', () => resolve(data));
        process.stdin.on('error', reject);
    });
}

/** Emit structured output. */
export function emit(json: boolean, result: Record<string, unknown>): void {
    if (json) {
        console.log(JSON.stringify(result, null, 2));
    } else {
        for (const [k, v] of Object.entries(result)) {
            console.log(`${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`);
        }
    }
}

export function die(msg: string, code = 1): never {
    console.error(`error: ${msg}`);
    process.exit(code);
}

/**
 * The wallet signs the 64-hex envelope id (SPEC §4.5), not the canonical message.
 * Show both, take the signature, and refuse one that does not verify over the id.
 */
export async function signatureForId(input: {
    msg: string;
    id: string;
    address: string;
    sig?: string;
}): Promise<string> {
    let signature = input.sig?.trim() ?? '';
    if (!signature) {
        console.error('\nThis stamp commits to:\n');
        console.error('─'.repeat(60));
        console.error(input.msg);
        console.error('─'.repeat(60));
        console.error(`\nSign this id with ${input.address} (BIP-322):\n\n${input.id}\n`);
        const rl = createInterface({ input: process.stdin, output: process.stderr });
        try {
            signature = (await rl.question('paste signature (base64): ')).trim();
        } finally {
            rl.close();
        }
        if (!signature) die('no signature provided');
    }
    let ok = false;
    try {
        ok = verifySignature(input.address, input.id, signature);
    } catch {
        ok = false;
    }
    if (!ok) {
        die(
            `the signature does not verify for ${input.address} over the id ${input.id}. ` +
                'Sign the 64-character id, not the message above.'
        );
    }
    return signature;
}
