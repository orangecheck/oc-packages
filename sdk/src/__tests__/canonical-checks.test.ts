/**
 * verify() refuses, as decode_error, a signed message that is not an
 * OrangeCheck attestation in canonical form (SPEC §7.1 step 1): one trailing
 * LF, the core lines present, in order and with their exact literals, sorted
 * lowercase extension keys, a 32-hex nonce and an identities line that parses.
 * Each message here is really signed, so only the canonical checks stand
 * between it and a pass.
 */

import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Sdk = typeof import('../index');
const sdk: Sdk = process.env.SDK_UNDER_TEST
    ? await import(process.env.SDK_UNDER_TEST)
    : await import('../index');

const KEY = '11'.repeat(32);
const ADDR = addressFromPrivateKey(KEY, 'p2wpkh');

const base = sdk.buildCanonicalMessage(
    { address: ADDR, identities: [{ protocol: 'github', identifier: 'owner' }] },
    { aud: 'https://a.example', expires: '2030-01-01T00:00:00Z' },
    { nonce: '0123456789abcdef0123456789abcdef', issuedAt: '2026-01-01T00:00:00Z' }
);
const lines = base.slice(0, -1).split('\n');
const join = (ls: string[]) => ls.join('\n') + '\n';
const at = (key: string) => lines.findIndex((l) => l.startsWith(`${key}:`) || l === key);
const replace = (key: string, line: string) => join(lines.map((l, i) => (i === at(key) ? line : l)));
const without = (key: string) => join(lines.filter((_, i) => i !== at(key)));
const swap = (a: string, b: string) => {
    const ls = [...lines];
    [ls[at(a)], ls[at(b)]] = [ls[at(b)]!, ls[at(a)]!];
    return join(ls);
};

async function verifySigned(msg: string) {
    return sdk.verify({ addr: ADDR, msg, sig: signMessage(ADDR, msg, KEY), scheme: 'bip322' });
}

beforeEach(() => {
    const utxos = [
        { txid: 'aa'.repeat(32), vout: 0, value: 100_000, status: { confirmed: true, block_height: 800_000, block_time: 1_700_000_000 } },
    ];
    vi.stubGlobal(
        'fetch',
        vi.fn(async () => new Response(JSON.stringify(utxos), { status: 200, headers: { 'content-type': 'application/json' } }))
    );
});
afterEach(() => vi.unstubAllGlobals());

describe('verify() and the canonical form (SPEC §7.1 step 1)', () => {
    it('passes the canonical message these cases start from', async () => {
        expect(lines[0]).toBe('orangecheck');
        expect(at('aud')).toBeLessThan(at('expires'));
        const r = await verifySigned(base);
        expect(r.codes).not.toContain('decode_error');
        expect(r.ok).toBe(true);
    });

    it.each([
        ['no trailing LF (1.b)', () => base.slice(0, -1)],
        ['two trailing LFs (1.b)', () => base + '\n'],
        ['CRLF line ends (1.b)', () => base.replace(/\n/g, '\r\n')],
        ['a CR inside a value, which some readers end a line at (1.b)', () => replace('aud', 'aud: https://a.example\rnetwork: testnet')],
        ['another header line (1.c)', () => replace('orangecheck', 'OrangeCheck')],
        ['another purpose (1.c)', () => replace('purpose', 'purpose: sign in to example.com')],
        ['another ack (1.c)', () => replace('ack', 'ack: I agree.')],
        ['a core line missing (1.c)', () => without('nonce')],
        ['core lines out of order (1.c)', () => swap('address', 'identities')],
        ['an extension among the core lines (1.c)', () => {
            const ls = [...lines];
            const [aud] = ls.splice(at('aud'), 1);
            ls.splice(at('nonce'), 0, aud!);
            return join(ls);
        }],
        ['a blank line (1.c)', () => join([...lines.slice(0, at('ack') + 1), '', ...lines.slice(at('ack') + 1)])],
        ['extension keys out of order (1.d)', () => swap('aud', 'expires')],
        ['an extension key in capitals (1.d, §2.2)', () => replace('aud', 'AUD: https://a.example')],
        ['a nonce in capitals (1.f)', () => replace('nonce', 'nonce: 0123456789ABCDEF0123456789ABCDEF')],
        ['a short nonce (1.f)', () => replace('nonce', 'nonce: 0123456789abcdef')],
        ['an identities line that does not parse (1.h)', () => replace('identities', 'identities: GitHub:owner')],
        ['identities out of order (§2.1)', () => replace('identities', 'identities: github:owner,dns:example.com')],
    ])('refuses a signed message with %s as decode_error', async (_, make) => {
        const msg = make();
        expect(msg).not.toBe(base);
        const r = await verifySigned(msg);
        expect(r.ok).toBe(false);
        expect(r.codes).toContain('decode_error');
    });

    it('refuses a signed sign-in challenge: it is not an attestation', async () => {
        const { message } = sdk.issueChallenge({ address: ADDR, audience: 'https://a.example' });
        const r = await verifySigned(message);
        expect(r.ok).toBe(false);
        expect(r.codes).toContain('decode_error');
    });
});
