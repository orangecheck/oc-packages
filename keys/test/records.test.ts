import { addressFromPrivateKey } from '@orangecheck/bip322';
import { describe, expect, it } from 'vitest';

import { identityKeys } from '../src/derive';
import {
    bindingRecord,
    identitySign,
    issuerSign,
    judgeSignature,
    parseRecord,
    recordId,
    resolveCustody,
    takeoverRecord,
    verifyRecord,
    type CustodyState,
    type VerifyContext,
} from '../src/records';

const ISSUER_KEY = new Uint8Array(32).fill(7);
const ISSUER = addressFromPrivateKey(ISSUER_KEY, 'p2wpkh');
const KEYS = identityKeys(new Uint8Array(32).fill(1));
const DID = 'did:oc:0123456789abcdef0123456789abcdef';
const H = 'ab'.repeat(32);
const ctx: VerifyContext = { issuers: [ISSUER], blockHash: (h) => (h === 100 || h === 200 ? H : undefined) };

const binding = bindingRecord({
    didOc: DID,
    address: KEYS.address,
    nostr: KEYS.nostr,
    custody: 'orangecheck',
    issuer: ISSUER,
    since: { height: 100, block: H },
});
const takeover = takeoverRecord({
    didOc: DID,
    address: KEYS.address,
    nostr: KEYS.nostr,
    binding: recordId(binding),
    issuer: ISSUER,
    since: { height: 200, block: H },
});

describe('record text', () => {
    it('is fixed lines with one final LF, and its id is the SHA-256 of that text', () => {
        expect(binding.split('\n')).toEqual([
            'oc-keys:binding:v1',
            `did_oc: ${DID}`,
            `address: ${KEYS.address}`,
            `nostr: ${KEYS.nostr}`,
            'custody: orangecheck',
            `issuer: ${ISSUER}`,
            'since_height: 100',
            `since_block: ${H}`,
            '',
        ]);
        expect(recordId(binding)).toMatch(/^[0-9a-f]{64}$/);
        expect(recordId(binding)).not.toBe(recordId(binding.replace('100', '101')));
    });

    it('parses back to its fields and refuses any change of form', () => {
        expect(parseRecord(binding)).toMatchObject({ type: 'binding', custody: 'orangecheck', since: { height: 100 } });
        expect(parseRecord(takeover)).toMatchObject({ type: 'takeover', binding: recordId(binding) });
        expect(parseRecord(binding.replace('oc-keys:binding:v1', 'oc-keys:binding:v2'))).toBeNull();
        expect(parseRecord(binding.replace(`did_oc: ${DID}`, `did_oc: ${DID}\ndid_oc: ${DID}`))).toBeNull();
        expect(parseRecord(binding.replace(KEYS.nostr, KEYS.nostr.toUpperCase()))).toBeNull();
        expect(parseRecord(takeover.replace('custody: self', 'custody: orangecheck'))).toBeNull();
        expect(parseRecord(`${binding}x`)).toBeNull();
        expect(parseRecord(42)).toBeNull();
    });
});

describe('signing', () => {
    it('lets the issuer sign any record, and the identity only a self binding or a takeover', () => {
        expect(typeof issuerSign(binding, ISSUER_KEY)).toBe('string');
        expect(() => identitySign(binding, KEYS)).toThrow(/signs nothing/);
        expect(() => identitySign(takeover, identityKeys(new Uint8Array(32).fill(2)))).toThrow(/not the record address/);
        expect(() => issuerSign('nope\n', ISSUER_KEY)).toThrow();
        expect(() => issuerSign(binding, new Uint8Array(32).fill(8))).toThrow();
    });
});

describe('verifyRecord', () => {
    const envB = { record: binding, issuer_sig: issuerSign(binding, ISSUER_KEY) };
    const envT = { record: takeover, issuer_sig: issuerSign(takeover, ISSUER_KEY), ...identitySign(takeover, KEYS) };

    it('accepts both, with their ids', () => {
        expect(verifyRecord(envB, ctx)).toMatchObject({ ok: true, id: recordId(binding) });
        expect(verifyRecord(envT, ctx)).toMatchObject({ ok: true, id: recordId(takeover) });
    });

    it('refuses an envelope of the wrong shape', () => {
        for (const bad of [null, [], 'x', { record: binding }, { ...envB, extra: '' }, { ...envB, address_sig: 1 }]) {
            expect(verifyRecord(bad, ctx)).toEqual({ ok: false, reason: 'malformed' });
        }
    });

    it('refuses a takeover with no Nostr signature, and a chain lookup that throws', () => {
        const { nostr_sig: _drop, ...noNostr } = envT;
        expect(verifyRecord(noNostr, ctx)).toEqual({ ok: false, reason: 'nostr_sig_invalid' });
        const throwing: VerifyContext = { ...ctx, blockHash: () => { throw new Error('offline'); } };
        expect(verifyRecord(envB, throwing)).toEqual({ ok: false, reason: 'since_unverified' });
    });

    it('trusts only the issuers it is given', () => {
        expect(verifyRecord(envB, { ...ctx, issuers: [] })).toEqual({ ok: false, reason: 'issuer_unknown' });
    });
});

describe('resolveCustody and judgeSignature', () => {
    const envB = { record: binding, issuer_sig: issuerSign(binding, ISSUER_KEY) };
    const envT = { record: takeover, issuer_sig: issuerSign(takeover, ISSUER_KEY), ...identitySign(takeover, KEYS) };

    it('needs a binding, and counts a repeated record once', () => {
        expect(resolveCustody(KEYS.address, [], ctx)).toEqual({ ok: false, reason: 'no_binding' });
        expect(resolveCustody(KEYS.address, [envT], ctx)).toEqual({ ok: false, reason: 'no_binding' });
        const r = resolveCustody(KEYS.address, [envB, envB, envT, envT], ctx);
        expect(r.ok && r.custody).toBe('self');
    });

    it('refuses the whole set for one bad record', () => {
        expect(resolveCustody(KEYS.address, [envB, { ...envT, nostr_sig: '00'.repeat(64) }], ctx)).toEqual({
            ok: false,
            reason: 'nostr_sig_invalid',
        });
    });

    it('refuses bad evidence instead of ignoring it', () => {
        const r = resolveCustody(KEYS.address, [envB, envT], ctx) as CustodyState;
        expect(judgeSignature(r, { anchoredAt: Number.NaN })).toEqual({ accept: false, reason: 'bad_evidence' });
        expect(judgeSignature(r, { anchoredAt: -1 })).toEqual({ accept: false, reason: 'bad_evidence' });
        expect(judgeSignature(r, { anchoredAt: 200.5 })).toEqual({ accept: false, reason: 'bad_evidence' });
        expect(judgeSignature(r, { madeAfter: 1.5 })).toEqual({ accept: false, reason: 'bad_evidence' });
        expect(judgeSignature(r, { takeoverAnchoredAt: -3 })).toEqual({ accept: false, reason: 'bad_evidence' });
        expect(judgeSignature(r, { anchoredAt: 200 })).toEqual({ accept: false, reason: 'before_takeover' });
        expect(judgeSignature(r, { anchoredAt: 201 })).toEqual({ accept: true, reason: 'on_trust' });
        expect(judgeSignature(r, { madeAfter: 205, takeoverAnchoredAt: 205 })).toEqual({
            accept: true,
            reason: 'after_takeover',
        });
    });
});
