// Shared helpers for stamp-cli commands.

import { createHash } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import { basename } from 'node:path';

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
 * Read JSON from a path or `-` for stdin.
 */
export async function readJson<T = unknown>(pathOrDash: string): Promise<T> {
    let text: string;
    if (pathOrDash === '-' || pathOrDash === '/dev/stdin') {
        text = await readStdin();
    } else {
        text = (await readFile(pathOrDash, 'utf8')) as string;
    }
    return JSON.parse(text) as T;
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
