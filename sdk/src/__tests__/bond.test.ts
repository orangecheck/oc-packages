import { describe, expect, it } from 'vitest';

import {
    bondFloors,
    bondId,
    bondNullifier,
    buildBondMessage,
    checkBondCoin,
    esploraSource,
    issueBondMessage,
    parseBondMessage,
    verifyBond,
    verifyBondSignature,
    type BondChainSource,
    type BondCoin,
} from '../index';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, hexToBytes, utf8ToBytes } from '@noble/hashes/utils.js';

import fixtures from './fixtures/bond.json';

// Signed by private key 1 (public, holds nothing) with bip322-js 3.0.0 on
// bitcoinjs-lib 6.1.8, an independent signer, over messages this module built.
const { p2wpkh, p2tr } = fixtures;
const INSIDE_WINDOW = new Date('2026-10-16T12:05:00Z');
const OUTPOINT = '1bd631f9d28188be398bae26c018e93ec4d276d25d8f969b6cbc28eab13686c9:0';
const SUBJECT = 'did:oc:0123456789abcdef0123456789abcdef';
// P2WPKH scriptPubKey of bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4.
const SPK = '0014751e76e8199196d454941c45d1b3a323f1433bd6';

function chain(coin: BondCoin | null, height = 971_800): BondChainSource {
    return {
        tip: async () => ({ height, hash: '00'.repeat(32) }),
        coin: async (outpoint) => (outpoint === OUTPOINT ? coin : null),
    };
}
const aged = (confirmedHeight: number, sats = 150_000): BondCoin => ({
    sats,
    scriptPubKey: SPK,
    confirmedHeight,
    spent: false,
});

describe('the bond message', () => {
    it('round-trips and is content-addressed', () => {
        const fields = parseBondMessage(p2wpkh.message)!;
        expect(fields).toMatchObject({ outpoint: OUTPOINT, subject: SUBJECT });
        expect(buildBondMessage(fields)).toBe(p2wpkh.message);
        expect(bondId(p2wpkh.message)).toBe(p2wpkh.bond_id);
    });

    it('refuses anything but the exact eight lines', () => {
        const m = p2wpkh.message;
        for (const bad of [
            m.slice(0, -1),
            m.replace(/\n/g, '\r\n'),
            m.replace('orangecheck-bond', 'orangecheck-auth'),
            m.replace('subject: ', 'subject:  '),
            m.replace(':0\n', ':00\n'),
            m.replace('ack: I back', 'ack: i back'),
            m.replace(
                'I back this subject with this coin.',
                'I pledge this coin to back this subject.'
            ),
            m.replace('expires_at: 2026-10-16T12:10:00Z', 'expires_at: 2026-10-16T24:00:00Z'),
            m.replace('issued_at: 2026-10-16T12:00:00Z', 'issued_at: 2026-02-30T12:00:00Z'),
            m + 'extra: line\n',
        ]) {
            expect(parseBondMessage(bad)).toBeNull();
        }
    });

    it('issues a fresh nonce and a ten-minute window by default', () => {
        const now = new Date('2026-10-16T12:00:00Z');
        const a = issueBondMessage({ address: p2wpkh.address, outpoint: OUTPOINT, subject: SUBJECT, now });
        const b = issueBondMessage({ address: p2wpkh.address, outpoint: OUTPOINT, subject: SUBJECT, now });
        expect(a.nonce).not.toBe(b.nonce);
        expect(parseBondMessage(a.message)?.expires_at).toBe('2026-10-16T12:10:00Z');
    });
});

describe('the signature', () => {
    it('verifies for P2WPKH and P2TR inside the signing window', () => {
        for (const f of [p2wpkh, p2tr]) {
            const r = verifyBondSignature({ message: f.message, signature: f.signature, now: INSIDE_WINDOW });
            expect(r).toMatchObject({ ok: true, bond_id: f.bond_id });
        }
    });

    it('binds the subject, the window and the signer', () => {
        const base = { message: p2wpkh.message, signature: p2wpkh.signature };
        expect(verifyBondSignature({ ...base, now: INSIDE_WINDOW, subject: 'did:oc:other' })).toEqual({
            ok: false,
            reason: 'bond_subject_mismatch',
        });
        expect(verifyBondSignature({ ...base, now: new Date('2026-10-16T12:20:00Z') })).toEqual({
            ok: false,
            reason: 'bond_expired',
        });
        expect(verifyBondSignature({ ...base, now: new Date('2026-10-16T11:50:00Z') })).toEqual({
            ok: false,
            reason: 'bond_not_yet_valid',
        });
        expect(
            verifyBondSignature({ message: p2wpkh.message, signature: p2tr.signature, now: INSIDE_WINDOW })
        ).toEqual({ ok: false, reason: 'sig_invalid' });
    });
});

describe('the coin', () => {
    const verify = (coin: BondCoin | null, height?: number) =>
        verifyBond({
            message: p2wpkh.message,
            signature: p2wpkh.signature,
            source: chain(coin, height),
            now: INSIDE_WINDOW,
        });

    it('reports the coin a valid bond rests on', async () => {
        const r = await verify(aged(920_000));
        expect(r).toEqual({
            ok: true,
            bond: {
                bond_id: p2wpkh.bond_id,
                subject: SUBJECT,
                address: p2wpkh.address,
                outpoint: OUTPOINT,
                sats: 150_000,
                confirmed_height: 920_000,
                tip: { height: 971_800, hash: '00'.repeat(32) },
            },
        });
    });

    it('ends with the coin: missing, elsewhere, unconfirmed, too recent or spent', async () => {
        expect(await verify(null)).toEqual({ ok: false, reason: 'coin_not_found' });
        expect(await verify({ ...aged(920_000), scriptPubKey: '0014' + '11'.repeat(20) })).toEqual({
            ok: false,
            reason: 'coin_address_mismatch',
        });
        expect(await verify({ ...aged(920_000), confirmedHeight: null })).toEqual({
            ok: false,
            reason: 'coin_unconfirmed',
        });
        expect(await verify(aged(971_796))).toEqual({ ok: false, reason: 'coin_too_recent' });
        expect(await verify(aged(971_795))).toMatchObject({ ok: true });
        expect(await verify({ ...aged(920_000), spent: true })).toEqual({ ok: false, reason: 'coin_spent' });
    });

    it('says the chain was unreachable rather than calling the bond invalid', async () => {
        const down: BondChainSource = {
            tip: async () => {
                throw new Error('timeout');
            },
            coin: async () => aged(920_000),
        };
        expect(await checkBondCoin({ address: p2wpkh.address, outpoint: OUTPOINT, source: down })).toEqual({
            ok: false,
            reason: 'chain_unavailable',
        });
    });
});

describe('esploraSource', () => {
    const TXID = OUTPOINT.split(':')[0];
    const TIP_HASH = '00000000000000000001'.padEnd(64, 'a');
    function api(routes: Record<string, [number, string]>): typeof fetch {
        return (async (url: string) => {
            const path = String(url).replace('https://esplora.test', '');
            const [status, body] = routes[path] ?? [404, 'Not Found'];
            return new Response(body, { status });
        }) as typeof fetch;
    }
    const healthy = {
        '/blocks/tip/height': [200, '971800'],
        '/blocks/tip/hash': [200, TIP_HASH],
        [`/tx/${TXID}`]: [
            200,
            JSON.stringify({
                vout: [{ value: 150_000, scriptpubkey: SPK }],
                status: { confirmed: true, block_height: 920_000 },
            }),
        ],
        [`/tx/${TXID}/outspend/0`]: [200, JSON.stringify({ spent: false })],
    } satisfies Record<string, [number, string]>;
    const check = (routes: Record<string, [number, string]>) =>
        checkBondCoin({
            address: p2wpkh.address,
            outpoint: OUTPOINT,
            source: esploraSource('https://esplora.test', { fetch: api(routes) }),
        });

    it('reads an unspent, confirmed coin', async () => {
        expect(await check(healthy)).toMatchObject({ ok: true, sats: 150_000, confirmed_height: 920_000 });
    });

    it('calls an unknown transaction not found', async () => {
        const { [`/tx/${TXID}`]: _gone, ...rest } = healthy;
        expect(await check(rest)).toEqual({ ok: false, reason: 'coin_not_found' });
    });

    it('calls a missing or garbled tip an outage, never a coin verdict', async () => {
        const { '/blocks/tip/height': _gone, ...noTip } = healthy;
        expect(await check(noTip)).toEqual({ ok: false, reason: 'chain_unavailable' });
        expect(await check({ ...healthy, '/blocks/tip/height': [200, '<html>'] })).toEqual({
            ok: false,
            reason: 'chain_unavailable',
        });
        expect(await check({ ...healthy, '/blocks/tip/hash': [503, 'busy'] })).toEqual({
            ok: false,
            reason: 'chain_unavailable',
        });
    });
});

describe('what an audience sees', () => {
    const KEY = hexToBytes(fixtures.nullifier_key);

    it('is the same nullifier for the same coin at the same audience, and unrelated elsewhere', () => {
        expect(bondNullifier(KEY, 'https://example.com', OUTPOINT)).toBe(fixtures.nullifiers.a);
        expect(bondNullifier(KEY, 'https://ochk.app', OUTPOINT)).toBe(fixtures.nullifiers.b);
        expect(fixtures.nullifiers.a).not.toBe(fixtures.nullifiers.b);
    });

    it("can't be found by hashing outpoints without the registry's key", () => {
        const unkeyed = bytesToHex(
            sha256(utf8ToBytes(`orangecheck-bond-nullifier\nhttps://example.com\n${OUTPOINT}`))
        );
        expect(unkeyed).not.toBe(fixtures.nullifiers.a);
        const otherRegistry = new Uint8Array(32).fill(7);
        expect(bondNullifier(otherRegistry, 'https://example.com', OUTPOINT)).not.toBe(
            fixtures.nullifiers.a
        );
        expect(() => bondNullifier(new Uint8Array(16), 'https://example.com', OUTPOINT)).toThrow();
    });

    it('carries floors, never amounts', () => {
        expect(bondFloors(999, 144 * 400)).toEqual({ sats_floor: 0, days_floor: 365 });
        expect(bondFloors(7_397, 144 * 349)).toEqual({ sats_floor: 1_000, days_floor: 90 });
        expect(bondFloors(150_000, 144 * 30)).toEqual({ sats_floor: 100_000, days_floor: 30 });
        expect(bondFloors(150_000, 144 * 30 - 1)).toEqual({ sats_floor: 100_000, days_floor: 7 });
        expect(bondFloors(25_000_000, 6)).toEqual({ sats_floor: 10_000_000, days_floor: 0 });
    });
});
