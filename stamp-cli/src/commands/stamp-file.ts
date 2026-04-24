// `stamp file <path>` — sign a file with a BIP-322 signature from the user's
// wallet, submit to OTS calendars, write <path>.stamp alongside.
//
// The signing step is done out-of-band: we print the canonical message and
// wait for the user to paste the signature. Wallet CLIs vary too much to
// automate reliably, so we keep the coupling loose and well-explained.

import { appendFile, writeFile } from 'node:fs/promises';
import { createInterface } from 'node:readline/promises';

import { canonicalMessage, stamp, type StampEnvelope, type StampStake } from '@orangecheck/stamp-core';
import { submitToCalendars, toStampOts } from '@orangecheck/stamp-ots';

import { die, emit, hashFile, mimeFromPath, pathExists } from '../util.js';

export interface StampFileOptions {
    path: string;
    address: string;
    mime?: string;
    signedAt?: string;
    stake?: StampStake;
    anchor: boolean;
    out?: string;
    /** If set, pass-through signature (no interactive prompt). */
    sig?: string;
    json: boolean;
}

export async function runStampFile(opts: StampFileOptions): Promise<void> {
    if (!(await pathExists(opts.path))) die(`no such file: ${opts.path}`);

    const { hash, length } = await hashFile(opts.path);
    const mime = opts.mime ?? mimeFromPath(opts.path);
    const signedAt = opts.signedAt ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z');

    const msg = canonicalMessage({
        address: opts.address,
        content_hash: hash,
        content_length: length,
        content_mime: mime,
        signed_at: signedAt,
    });

    let signature: string;
    if (opts.sig) {
        signature = opts.sig;
    } else {
        // Interactive: print the message, ask for the BIP-322 signature.
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
        content: { hash, length },
        mime,
        signer: {
            address: opts.address,
            signMessage: async () => signature,
        },
        signedAt: new Date(signedAt),
        stake: opts.stake,
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

    const outPath = opts.out ?? `${opts.path}.stamp`;
    await writeFile(outPath, JSON.stringify(final, null, 2) + '\n', 'utf8');

    emit(opts.json, {
        ok: true,
        id: final.id,
        signer: final.signer.address,
        signed_at: final.signed_at,
        content_hash: final.content.hash,
        content_length: final.content.length,
        content_mime: final.content.mime,
        ots: final.ots
            ? `${final.ots.status} (${final.ots.calendars.length} calendar${final.ots.calendars.length === 1 ? '' : 's'})`
            : 'not anchored',
        written: outPath,
    });
    void appendFile;
}
