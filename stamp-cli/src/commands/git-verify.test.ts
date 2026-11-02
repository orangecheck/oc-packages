import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { stamp } from '@orangecheck/stamp-core';
import { createHash } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { gitTagContent, runGitVerify } from './git-tag';

/**
 * `git-stamp verify <tag>` checks the stamp against the tag as it is now, not
 * only the stamp's own signature: a tag moved after it was stamped, or a
 * .stamp copied from another tag, does not verify. A real repository, a real
 * BIP-322 signature, no network (the stamps carry no anchor).
 */

const KEY = '11'.repeat(32);
const ADDRESS = addressFromPrivateKey(KEY, 'p2wpkh');
const home = process.cwd();

class Exit extends Error {
    constructor(readonly code: number) {
        super(`exit ${code}`);
    }
}

afterEach(() => {
    process.chdir(home);
    vi.restoreAllMocks();
});

const git = (...args: string[]) => execFileSync('git', args, { stdio: 'pipe' }).toString().trim();

/** A repository with one commit and the annotated tag v1, as the cwd. */
function repo(): void {
    const dir = mkdtempSync(join(tmpdir(), 'git-stamp-verify-'));
    process.chdir(dir);
    git('init', '-q');
    git('config', 'user.email', 'test@example.invalid');
    git('config', 'user.name', 'Test');
    writeFileSync('a.txt', 'one\n');
    git('add', 'a.txt');
    git('commit', '-q', '-m', 'one');
    git('tag', '-a', 'v1', '-m', 'release one');
}

/** Stamps `tag` as `git-stamp tag` would, into .git/stamps/<tag>.stamp. */
async function stampTag(tag: string): Promise<void> {
    const { contentBytes } = await gitTagContent(tag);
    const env = await stamp({
        content: {
            hash: 'sha256:' + createHash('sha256').update(contentBytes).digest('hex'),
            length: contentBytes.byteLength,
        },
        mime: 'application/x-git-tag',
        signer: {
            address: ADDRESS,
            signMessage: async (m: string) => signMessage(ADDRESS, m, KEY),
        },
    });
    mkdirSync('.git/stamps', { recursive: true });
    writeFileSync(`.git/stamps/${tag}.stamp`, JSON.stringify(env, null, 2) + '\n');
}

async function verify(tag: string): Promise<{ code: number; out: Record<string, unknown> }> {
    const lines: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((s: string) => void lines.push(s));
    vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
        throw new Exit(c ?? 0);
    }) as never);
    let code = 0;
    try {
        await runGitVerify({ tag, requireAnchor: false, json: true });
    } catch (e) {
        if (!(e instanceof Exit)) throw e;
        code = e.code;
    }
    return { code, out: JSON.parse(lines.join('\n')) as Record<string, unknown> };
}

describe('git-stamp verify', () => {
    it('a stamp of the tag as it is verifies, with its content checked', async () => {
        repo();
        await stampTag('v1');
        const r = await verify('v1');
        expect(r.code).toBe(0);
        expect(r.out).toMatchObject({ ok: true, content_checked: true, signature_checked: true });
    });

    it('a tag moved to another commit after stamping does not verify', async () => {
        repo();
        await stampTag('v1');
        writeFileSync('a.txt', 'two\n');
        git('commit', '-q', '-am', 'two');
        git('tag', '-f', '-a', 'v1', '-m', 'release one, moved');
        const r = await verify('v1');
        expect(r.code).toBe(2);
        expect(r.out.ok).toBe(false);
    });

    it('a stamp copied from another tag does not verify', async () => {
        repo();
        await stampTag('v1');
        git('tag', '-a', 'v2', '-m', 'release two');
        copyFileSync('.git/stamps/v1.stamp', '.git/stamps/v2.stamp');
        const r = await verify('v2');
        expect(r.code).toBe(2);
        expect(r.out.ok).toBe(false);
    });
});
