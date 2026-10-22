// `stamp verify <stamp-path> [content-path]` — run the full SPEC §8
// verification algorithm locally. Structured JSON output with `--json`.

import { verifySignature } from '@orangecheck/bip322';
import { verify } from '@orangecheck/stamp-core';
import { makeAnchorVerifier, mempoolHeaderSource } from '@orangecheck/stamp-ots';

import { die, emit, hashFile, pathExists, readBytes, readStamp } from '../util.js';

export interface VerifyOptions {
    stampPath: string;
    contentPath?: string;
    requireAnchor: boolean;
    /**
     * If set, skip the BIP-322 signature verification. Mostly useful for CI
     * smoke tests with placeholder signatures; production verification should
     * never pass this.
     */
    skipSignature: boolean;
    /** Esplora-compatible API for block headers. Default mempool.space. */
    headersUrl?: string;
    json: boolean;
}

export async function runVerify(opts: VerifyOptions): Promise<void> {
    if (!(await pathExists(opts.stampPath))) die(`no such file: ${opts.stampPath}`);

    const envelope = await readStamp(opts.stampPath);

    let contentBytes: Uint8Array | undefined;
    if (opts.contentPath) {
        if (!(await pathExists(opts.contentPath))) die(`no such file: ${opts.contentPath}`);
        contentBytes = await readBytes(opts.contentPath);
    }

    const verifyBip322 = opts.skipSignature
        ? undefined
        : async (m: string, s: string, a: string) => verifySignature(a, m, s);

    // SPEC §8.1 step 5: the proof must chain to the header at the claimed height.
    // A header that could not be read leaves the anchor unchecked (step 5d).
    const verifyOtsAnchor = makeAnchorVerifier({
        headerSource: mempoolHeaderSource({ baseUrl: opts.headersUrl }),
    });

    const r = await verify({
        envelope,
        content: contentBytes,
        verifyBip322,
        skipSignatureVerification: opts.skipSignature,
        verifyOtsAnchor,
    });

    if (!r.ok) {
        emit(opts.json, {
            ok: false,
            code: r.code,
            message: r.message,
        });
        process.exit(2);
    }

    const anchor = r.anchor;
    const anchorState = anchor.status === 'confirmed' ? 'anchored' : anchor.status;
    const anchorLabel =
        anchor.status === 'confirmed'
            ? `confirmed at block ${anchor.blockHeight} (checked against the block header)`
            : anchor.status === 'unchecked'
              ? `claims block ${anchor.blockHeight}, couldn't check: ${anchor.reason}`
              : anchor.status;

    if (opts.requireAnchor && anchor.status === 'unchecked') {
        emit(opts.json, {
            ok: false,
            code: 'ANCHOR_UNCHECKED',
            id: r.id,
            block_height: anchor.blockHeight,
            message: `couldn't check the anchor at block ${anchor.blockHeight}: ${anchor.reason}. Nothing failed; try again later.`,
        });
        process.exit(3);
    }

    if (opts.requireAnchor && anchor.status !== 'confirmed') {
        emit(opts.json, {
            ok: false,
            code: 'E_NO_ANCHOR',
            message: `required a verified OTS anchor, got ${anchorState}`,
        });
        process.exit(2);
    }

    emit(opts.json, {
        ok: true,
        id: r.id,
        signer: envelope.signer.address,
        signed_at: envelope.signed_at,
        content_hash: envelope.content.hash,
        content_mime: envelope.content.mime,
        content_length: envelope.content.length,
        content_checked: Boolean(contentBytes),
        anchor: anchorLabel,
        anchor_state: anchorState,
        signature_checked: !opts.skipSignature,
        // Outside the id and the signature (SPEC §8.1 step 7): what the
        // envelope says, which anyone relaying it can strip, add or swap.
        stake_declared: envelope.stake,
        stake_checked: false,
    });
    void hashFile;
}
