/**
 * `oc verify` on the real sdk: a wallet that trims the text before it signs
 * drops the attestation's final LF, and OC Attest 2.2.0 SPEC §4.1 has a
 * reader take that signature. The chain is not reached here, so a signature
 * that verifies exits 3 (coins unread) and one that does not exits 2.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { buildCanonicalMessage } from '@orangecheck/sdk';

import { runVerify } from '../commands/verify';

class ExitCalled extends Error {
    constructor(public code: number) {
        super(`process.exit(${code})`);
    }
}

const key = new Uint8Array(32).fill(7);
const addr = addressFromPrivateKey(key, 'p2wpkh');
const msg = buildCanonicalMessage({ address: addr }, {}, { nonce: 'a'.repeat(32), issuedAt: '2026-11-24T00:00:00Z' });
const signed = (text: string) => signMessage(addr, text, key);

let stdout: string;

beforeEach(() => {
    stdout = '';
    Object.defineProperty(process.stdin, 'isTTY', { value: true, configurable: true });
    vi.spyOn(process, 'exit').mockImplementation((code?: string | number | null) => {
        throw new ExitCalled(Number(code ?? 0));
    });
    vi.spyOn(process.stdout, 'write').mockImplementation((chunk: unknown) => {
        stdout += String(chunk);
        return true;
    });
    vi.stubGlobal('fetch', async () => {
        throw new Error('offline');
    });
});

afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
});

async function verifyJson(sig: string): Promise<{ code: number; codes: string[] }> {
    stdout = '';
    try {
        await runVerify({ addr, msg, sig, json: true });
    } catch (e) {
        if (e instanceof ExitCalled) return { code: e.code, codes: JSON.parse(stdout).codes };
        throw e;
    }
    throw new Error('expected process.exit');
}

describe('oc verify, a signature over the attestation without its final LF (OC Attest 2.2.0 SPEC §4.1)', () => {
    it('is a valid signature, as one over the attestation is', async () => {
        expect(msg.endsWith('\n') && !msg.endsWith('\n\n')).toBe(true);
        for (const text of [msg, msg.slice(0, -1)]) {
            const out = await verifyJson(signed(text));
            expect(out.codes).toContain('sig_ok_bip322');
            expect(out.code).toBe(3);
        }
    });

    it('is still invalid over any other text', async () => {
        for (const text of [`${msg}\n`, msg.slice(0, -2), ` ${msg}`]) {
            const out = await verifyJson(signed(text));
            expect(out.codes).toContain('sig_invalid');
            expect(out.code).toBe(2);
        }
    });
});
