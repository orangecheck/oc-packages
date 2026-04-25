import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { hashFile, mimeFromPath, pathExists, readBytes, readJson } from './util';

function tmpFile(name: string, contents: string | Uint8Array): string {
    const dir = mkdtempSync(join(tmpdir(), 'stamp-cli-test-'));
    const path = join(dir, name);
    writeFileSync(path, contents);
    return path;
}

describe('mimeFromPath', () => {
    it('maps known extensions to canonical MIME types', () => {
        expect(mimeFromPath('release-notes.md')).toBe('text/markdown');
        expect(mimeFromPath('post.markdown')).toBe('text/markdown');
        expect(mimeFromPath('NOTE.txt')).toBe('text/plain');
        expect(mimeFromPath('index.html')).toBe('text/html');
        expect(mimeFromPath('page.HTM')).toBe('text/html');
        expect(mimeFromPath('payload.json')).toBe('application/json');
        expect(mimeFromPath('paper.pdf')).toBe('application/pdf');
        expect(mimeFromPath('logo.PNG')).toBe('image/png');
        expect(mimeFromPath('photo.jpeg')).toBe('image/jpeg');
        expect(mimeFromPath('clip.jpg')).toBe('image/jpeg');
        expect(mimeFromPath('icon.gif')).toBe('image/gif');
        expect(mimeFromPath('hero.webp')).toBe('image/webp');
        expect(mimeFromPath('song.mp3')).toBe('audio/mpeg');
        expect(mimeFromPath('clip.mp4')).toBe('video/mp4');
        expect(mimeFromPath('voice.wav')).toBe('audio/wav');
        expect(mimeFromPath('archive.zip')).toBe('application/zip');
        expect(mimeFromPath('source.tar')).toBe('application/x-tar');
        expect(mimeFromPath('snapshot.gz')).toBe('application/gzip');
    });

    it('falls back to application/octet-stream for unknown extensions', () => {
        expect(mimeFromPath('mystery.qzx')).toBe('application/octet-stream');
        expect(mimeFromPath('Makefile')).toBe('application/octet-stream');
    });

    it('handles uppercase + nested paths uniformly', () => {
        expect(mimeFromPath('/absolute/path/to/Notes.MD')).toBe('text/markdown');
        expect(mimeFromPath('rel/path/IMG.JPG')).toBe('image/jpeg');
    });
});

describe('hashFile', () => {
    it('produces SHA-256 hex matching openssl on the same bytes', async () => {
        // SHA-256("hello world") =
        // b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9
        const path = tmpFile('hello.txt', 'hello world');
        const { hash, length } = await hashFile(path);
        expect(hash).toBe('sha256:b94d27b9934d3e08a52e52d7da7dabfac484efe37a5380ee9088f7ace2efcde9');
        expect(length).toBe(11);
    });

    it('hashes binary content correctly', async () => {
        const bytes = new Uint8Array([0xff, 0x00, 0xab, 0xcd]);
        const path = tmpFile('bin.dat', bytes);
        const { hash, length } = await hashFile(path);
        // Ground-truth SHA-256(0xFF 0x00 0xAB 0xCD).
        expect(hash).toBe('sha256:064145b73178d7c9fee36e70bb497d618fadb0e8a7f30b8fe7d9761ef1be635c');
        expect(length).toBe(4);
    });

    it('hashes the empty file deterministically', async () => {
        const path = tmpFile('empty.bin', '');
        const { hash, length } = await hashFile(path);
        // SHA-256 of zero-length input is well-known.
        expect(hash).toBe('sha256:e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
        expect(length).toBe(0);
    });
});

describe('readBytes', () => {
    it('returns a Uint8Array with the file contents', async () => {
        const path = tmpFile('msg.bin', 'abc');
        const bytes = await readBytes(path);
        expect(bytes).toBeInstanceOf(Uint8Array);
        expect(Array.from(bytes)).toEqual([0x61, 0x62, 0x63]);
    });
});

describe('pathExists', () => {
    it('returns true for a real path', async () => {
        const path = tmpFile('a.txt', 'x');
        expect(await pathExists(path)).toBe(true);
    });

    it('returns false for a path that does not exist', async () => {
        expect(await pathExists('/nope/this/does/not/exist-' + Date.now())).toBe(false);
    });
});

describe('readJson', () => {
    it('parses JSON from a file path', async () => {
        const path = tmpFile('payload.json', JSON.stringify({ ok: true, n: 42 }));
        const out = await readJson<{ ok: boolean; n: number }>(path);
        expect(out).toEqual({ ok: true, n: 42 });
    });

    it('throws on malformed JSON', async () => {
        const path = tmpFile('bad.json', '{ not valid json');
        await expect(readJson(path)).rejects.toThrow();
    });
});
