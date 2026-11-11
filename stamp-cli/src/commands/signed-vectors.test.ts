import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { StampEnvelope } from '@orangecheck/stamp-core';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';

import { signatureForId } from '../util';
import { runVerify } from './verify';

/**
 * oc-stamp-protocol's signed vectors (v10-v14: one real signature per address
 * type, and one with a flipped byte) through the CLI's own paths: `stamp verify`
 * on a .stamp file, and the check a pasted signature gets before a stamp is
 * written. A BIP-322 simple signature is tried again with the finalized BIP's
 * `smp` prefix, which every verify path accepts.
 */

const __dirname = dirname(fileURLToPath(import.meta.url));

/** OC_STAMP_VECTORS_DIR (CI checks the spec out), else a sibling clone of oc-stamp-protocol. */
function vectorsDir(): string | null {
    const env = process.env.OC_STAMP_VECTORS_DIR;
    if (env && existsSync(env)) return env;
    const sibling = resolve(__dirname, '..', '..', '..', '..', 'oc-stamp-protocol', 'test-vectors');
    return existsSync(sibling) ? sibling : null;
}

interface SignedVector {
    name: string;
    message: string;
    envelope: StampEnvelope;
    check: {
        address_type: string;
        format: 'bip137' | 'bip322-simple';
        expected: { outcome: 'ACCEPT' } | { outcome: 'REJECT'; error_code: string };
    };
}

const DIR = vectorsDir();
const VECTORS: SignedVector[] = DIR
    ? readdirSync(DIR)
          .filter((f) => f.endsWith('.json'))
          .sort()
          .flatMap((name) => {
              const d = JSON.parse(readFileSync(join(DIR, name), 'utf8'));
              if (!d.signature_check) return [];
              const { canonical_message: message, envelope } = d.expected;
              return [{ name, message, envelope, check: d.signature_check }];
          })
    : [];

/** The signature as the vector holds it and, for the simple form, `smp`-prefixed. */
function forms(v: SignedVector): Array<[string, string]> {
    const sig = v.envelope.sig.value;
    return v.check.format === 'bip322-simple'
        ? [
              ['as signed', sig],
              ['smp-prefixed', `smp${sig}`],
          ]
        : [['as signed', sig]];
}

class Exit extends Error {
    constructor(readonly code: number) {
        super(`exit ${code}`);
    }
}

const work = mkdtempSync(join(tmpdir(), 'stamp-cli-signed-'));
afterAll(() => rmSync(work, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());

/** Runs `fn` with process.exit and the console captured; the exit code is 0 when it returns. */
async function capture(
    fn: () => Promise<unknown>
): Promise<{ code: number; value: unknown; out: string; err: string }> {
    const out: string[] = [];
    const err: string[] = [];
    vi.spyOn(console, 'log').mockImplementation((s: string) => void out.push(s));
    vi.spyOn(console, 'error').mockImplementation((s: string) => void err.push(s));
    vi.spyOn(process, 'exit').mockImplementation(((c?: number) => {
        throw new Exit(c ?? 0);
    }) as never);
    let code = 0;
    let value: unknown;
    try {
        value = await fn();
    } catch (e) {
        if (!(e instanceof Exit)) throw e;
        code = e.code;
    }
    return { code, value, out: out.join('\n'), err: err.join('\n') };
}

describe('signed vectors through the CLI', () => {
    it('finds the signed vectors, which CI checks out', () => {
        if (!DIR && !process.env.CI) return;
        const accepted = VECTORS.filter((v) => v.check.expected.outcome === 'ACCEPT');
        expect(new Set(accepted.map((v) => v.check.address_type))).toEqual(
            new Set(['p2pkh', 'p2sh_p2wpkh', 'p2wpkh', 'p2tr'])
        );
        expect(VECTORS.some((v) => v.check.expected.outcome === 'REJECT')).toBe(true);
    });

    for (const v of VECTORS) {
        const accept = v.check.expected.outcome === 'ACCEPT';
        for (const [form, sig] of forms(v)) {
            const label = `${v.name} (${v.check.address_type}, ${form})`;
            it(`stamp verify ${accept ? 'accepts' : 'refuses'} ${label}`, async () => {
                const path = join(work, `${v.name}.${form}.stamp`);
                const envelope = { ...v.envelope, sig: { ...v.envelope.sig, value: sig } };
                writeFileSync(path, JSON.stringify(envelope) + '\n');
                const r = await capture(() =>
                    runVerify({ stampPath: path, requireAnchor: false, skipSignature: false, json: true })
                );
                const report = JSON.parse(r.out);
                if (accept) {
                    expect(r.code).toBe(0);
                    expect(report).toMatchObject({ ok: true, id: v.envelope.id, signature_checked: true });
                } else {
                    expect(r.code).toBe(2);
                    expect(report).toMatchObject({ ok: false, code: v.check.expected.error_code });
                }
            });

            it(`a pasted signature is ${accept ? 'taken' : 'refused'} for ${label}`, async () => {
                const input = { msg: v.message, id: v.envelope.id, address: v.envelope.signer.address, sig };
                const r = await capture(() => signatureForId(input));
                if (accept) {
                    expect(r.code).toBe(0);
                    expect(r.value).toBe(sig);
                } else {
                    expect(r.code).toBe(1);
                    expect(r.err).toMatch(/does not verify/);
                }
            });
        }
    }
});
