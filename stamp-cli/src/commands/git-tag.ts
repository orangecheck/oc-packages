// `git-stamp tag <tagname>` — stamp a git tag's tree. Meant to be invoked as
// `git-stamp tag v1.2.3` (the same binary as `stamp`; we detect the alias
// from argv[1] basename and also accept explicit `git tag` subcommand).
//
// The stamp covers the `git rev-parse <tag>^{tree}` output concatenated with
// the tag name and object id, so changing any of (tree contents, tag object,
// or tag name) invalidates the envelope.

import { execFile } from 'node:child_process';
import { writeFile, mkdir } from 'node:fs/promises';
import { promisify } from 'node:util';

import { createHash } from 'node:crypto';
import { canonicalMessage, stamp, type StampEnvelope } from '@orangecheck/stamp-core';
import { submitToCalendars, toStampOts } from '@orangecheck/stamp-ots';

import { die, emit } from '../util.js';
import { createInterface } from 'node:readline/promises';

const exec = promisify(execFile);

export interface GitTagOptions {
    tag: string;
    address: string;
    sig?: string;
    anchor: boolean;
    json: boolean;
}

async function gitCapture(args: string[]): Promise<string> {
    const { stdout } = await exec('git', args);
    return stdout.trim();
}

export async function runGitTag(opts: GitTagOptions): Promise<void> {
    // Validate that we're inside a git repo.
    try {
        await gitCapture(['rev-parse', '--is-inside-work-tree']);
    } catch {
        die('not inside a git work tree');
    }

    // Resolve the tag to its commit + tree, and the tag object itself.
    let treeId: string;
    let tagObjectId: string;
    try {
        treeId = await gitCapture(['rev-parse', `${opts.tag}^{tree}`]);
        tagObjectId = await gitCapture(['rev-parse', opts.tag]);
    } catch (e) {
        die(`cannot resolve git tag ${opts.tag}: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Canonical content = "oc-stamp/git-tag:v1\n" + tag + "\n" + object_id + "\n" + tree_id.
    // Hashed into content.hash; the whole thing is what the stamp commits to.
    const contentBytes = new TextEncoder().encode(
        `oc-stamp/git-tag:v1\ntag: ${opts.tag}\nobject: ${tagObjectId}\ntree: ${treeId}\n`
    );
    const contentHash = 'sha256:' + createHash('sha256').update(contentBytes).digest('hex');
    const contentLength = contentBytes.byteLength;
    const mime = 'application/x-git-tag';
    const signedAt = new Date().toISOString().replace(/\.\d+Z$/, 'Z');

    const msg = canonicalMessage({
        address: opts.address,
        content_hash: contentHash,
        content_length: contentLength,
        content_mime: mime,
        signed_at: signedAt,
    });

    let signature: string;
    if (opts.sig) {
        signature = opts.sig;
    } else {
        console.error('\nSign this message with your Bitcoin wallet (BIP-322):\n');
        console.error('─'.repeat(60));
        console.error(msg);
        console.error('─'.repeat(60));
        console.error();
        const rl = createInterface({ input: process.stdin, output: process.stderr });
        try {
            signature = (await rl.question('paste signature (base64): ')).trim();
        } finally {
            rl.close();
        }
        if (!signature) die('no signature provided');
    }

    const envelope: StampEnvelope = await stamp({
        content: { hash: contentHash, length: contentLength },
        mime,
        signer: {
            address: opts.address,
            signMessage: async () => signature,
        },
        signedAt: new Date(signedAt),
    });

    let final = envelope;
    if (opts.anchor) {
        try {
            const proof = await submitToCalendars(envelope.id);
            final = { ...envelope, ots: toStampOts(proof) };
        } catch (e) {
            console.error(
                `warning: OTS submission failed (${e instanceof Error ? e.message : String(e)}). ` +
                    `The stamp is still valid; you can retry anchoring later with \`stamp anchor\`.`
            );
        }
    }

    // Store under .git/stamps/<tag>.stamp — keeps stamps co-located with the
    // repo history and discoverable by `git-stamp verify <tag>` without a
    // separate config.
    const gitDir = await gitCapture(['rev-parse', '--git-dir']);
    const stampsDir = `${gitDir}/stamps`;
    await mkdir(stampsDir, { recursive: true });
    const outPath = `${stampsDir}/${opts.tag}.stamp`;
    await writeFile(outPath, JSON.stringify(final, null, 2) + '\n', 'utf8');

    emit(opts.json, {
        ok: true,
        tag: opts.tag,
        tree: treeId,
        object: tagObjectId,
        id: final.id,
        signer: final.signer.address,
        ots: final.ots?.status ?? 'not anchored',
        written: outPath,
    });
}

export interface GitVerifyOptions {
    tag: string;
    requireAnchor: boolean;
    json: boolean;
}

export async function runGitVerify(opts: GitVerifyOptions): Promise<void> {
    const gitDir = await gitCapture(['rev-parse', '--git-dir']);
    const stampPath = `${gitDir}/stamps/${opts.tag}.stamp`;
    const { runVerify } = await import('./verify.js');
    await runVerify({
        stampPath,
        requireAnchor: opts.requireAnchor,
        skipSignature: false,
        json: opts.json,
    });
}
