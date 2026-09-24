// `stamp verify <stamp-path> [content-path]` — run the full SPEC §8
// verification algorithm locally. Structured JSON output with `--json`.

import { verify, type StampEnvelope } from '@orangecheck/stamp-core';
import { mempoolHeaderSource } from '@orangecheck/stamp-ots';

import { checkAnchorClaim } from '../anchor-check.js';

import { die, emit, hashFile, pathExists, readBytes, readJson } from '../util.js';

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

    const envelope = await readJson<StampEnvelope>(opts.stampPath);

    let contentBytes: Uint8Array | undefined;
    if (opts.contentPath) {
        if (!(await pathExists(opts.contentPath))) die(`no such file: ${opts.contentPath}`);
        contentBytes = await readBytes(opts.contentPath);
    }

    // Lazy-load bip322-js so it's only pulled in when needed (heavy dep).
    let verifyBip322: ((msg: string, sig: string, addr: string) => Promise<boolean>) | undefined;
    if (!opts.skipSignature) {
        const mod = (await import('bip322-js')) as unknown as {
            Verifier?: { verifySignature(a: string, m: string, s: string): boolean };
            default?: { Verifier?: { verifySignature(a: string, m: string, s: string): boolean } };
        };
        const Verifier = mod.Verifier ?? mod.default?.Verifier;
        if (!Verifier) die('bip322-js Verifier export not found');
        verifyBip322 = async (m, s, a) => {
            try {
                return Verifier.verifySignature(a, m, s);
            } catch {
                return false;
            }
        };
    }

    const r = await verify({
        envelope,
        content: contentBytes,
        verifyBip322,
        skipSignatureVerification: opts.skipSignature,
    });

    if (!r.ok) {
        emit(opts.json, {
            ok: false,
            code: r.code,
            message: r.message,
        });
        process.exit(2);
    }

    const anchor = await checkAnchorClaim(
        envelope,
        mempoolHeaderSource({ baseUrl: opts.headersUrl })
    );
    if (anchor.state === 'fail') {
        emit(opts.json, { ok: false, code: 'E_BAD_ANCHOR', message: anchor.message });
        process.exit(2);
    }

    const anchorLabel =
        anchor.state === 'anchored'
            ? `confirmed at block ${anchor.blockHeight} (checked against the block header)`
            : anchor.state === 'unverified'
              ? `claims block ${anchor.blockHeight}, unverified: ${anchor.message}`
              : anchor.state;

    if (opts.requireAnchor && anchor.state !== 'anchored') {
        emit(opts.json, {
            ok: false,
            code: 'E_NO_ANCHOR',
            message: `required a verified OTS anchor, got ${anchor.state}`,
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
        anchor_state: anchor.state,
        signature_checked: !opts.skipSignature,
        stake: envelope.stake,
    });
    void hashFile;
}
