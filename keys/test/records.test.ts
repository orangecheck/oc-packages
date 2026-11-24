import { addressFromPrivateKey } from '@orangecheck/bip322';
import { describe, expect, it } from 'vitest';

import { identityKeys } from '../src/derive';
import {
    bindingRecord,
    CUSTODIAL_TRUST,
    identitySign,
    issuerRecord,
    issuerSign,
    judgeSignature,
    namedIssuer,
    parseRecord,
    publicationTags,
    recordId,
    resolveIssuers,
    resolveKeyHolder,
    retireRecord,
    rotationSign,
    takeoverRecord,
    verifyRecord,
    type BoundState,
    type VerifyContext,
} from '../src/records';

const ISSUER_KEY = new Uint8Array(32).fill(7);
const ISSUER = addressFromPrivateKey(ISSUER_KEY, 'p2wpkh');
const NEXT_KEY = new Uint8Array(32).fill(9);
const NEXT = addressFromPrivateKey(NEXT_KEY, 'p2wpkh');
const KEYS = identityKeys(new Uint8Array(32).fill(1));
const DID = 'did:oc:0123456789abcdef0123456789abcdef';
const H = 'ab'.repeat(32);
const blockHash = (h: number) => (h === 100 || h === 200 || h === 300 ? H : undefined);
const ctx: VerifyContext = { issuers: namedIssuer(ISSUER), blockHash };

const binding = bindingRecord({
    didOc: DID,
    address: KEYS.address,
    nostr: KEYS.nostr,
    keyHolder: 'orangecheck',
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
const retire = retireRecord({
    didOc: DID,
    address: KEYS.address,
    binding: recordId(binding),
    issuer: ISSUER,
    since: { height: 200, block: H },
    reason: 'deleted',
});
const envB = { record: binding, issuer_sig: issuerSign(binding, ISSUER_KEY) };
const envT = { record: takeover, issuer_sig: issuerSign(takeover, ISSUER_KEY), ...identitySign(takeover, KEYS) };
const envR = { record: retire, issuer_sig: issuerSign(retire, ISSUER_KEY) };
const all = (...envelopes: unknown[]) => ({ complete: true, records: envelopes.map((envelope) => ({ envelope })) });

describe('record text', () => {
    it('is fixed lines with one final LF, and its id is the SHA-256 of that text', () => {
        expect(binding.split('\n')).toEqual([
            'oc-attest-key:binding:v1',
            `did_oc: ${DID}`,
            `address: ${KEYS.address}`,
            `nostr: ${KEYS.nostr}`,
            'key_holder: orangecheck',
            `issuer: ${ISSUER}`,
            'since_height: 100',
            `since_block: ${H}`,
            `trust: ${CUSTODIAL_TRUST}`,
            '',
        ]);
        expect(recordId(binding)).toMatch(/^[0-9a-f]{64}$/);
        expect(recordId(binding)).not.toBe(recordId(binding.replace('100', '101')));
        // Every line is ASCII, so no implementation can disagree on its bytes.
        for (const r of [binding, takeover, retire]) expect(/^[\x20-\x7e\n]*$/.test(r)).toBe(true);
    });

    it('never says custody, the word FEDERATION-CUSTODY uses for funds', () => {
        for (const r of [binding, takeover, retire]) expect(r).not.toMatch(/custody/);
    });

    it('parses back to its fields and refuses any change of form', () => {
        expect(parseRecord(binding)).toMatchObject({ type: 'binding', keyHolder: 'orangecheck', since: { height: 100 } });
        expect(parseRecord(takeover)).toMatchObject({ type: 'takeover', binding: recordId(binding) });
        expect(parseRecord(binding.replace('oc-attest-key:binding:v1', 'oc-attest-key:binding:v2'))).toBeNull();
        expect(parseRecord(binding.replace(`did_oc: ${DID}`, `did_oc: ${DID}\ndid_oc: ${DID}`))).toBeNull();
        expect(parseRecord(binding.replace(KEYS.nostr, KEYS.nostr.toUpperCase()))).toBeNull();
        expect(parseRecord(takeover.replace('key_holder: user', 'key_holder: orangecheck'))).toBeNull();
        expect(parseRecord(`${binding}x`)).toBeNull();
        expect(parseRecord(42)).toBeNull();
    });

    it('builds an issuer record only between two different addresses', () => {
        const r = issuerRecord({ old: ISSUER, new: NEXT, since: { height: 300, block: H } });
        expect(parseRecord(r)).toEqual({ type: 'issuer', old: ISSUER, new: NEXT, since: { height: 300, block: H } });
        expect(parseRecord(issuerRecord({ old: ISSUER, new: ISSUER, since: { height: 300, block: H } }))).toBeNull();
    });
});

describe('signing', () => {
    it('lets the issuer sign any address record, and the identity only a user binding or a takeover', () => {
        expect(typeof issuerSign(binding, ISSUER_KEY)).toBe('string');
        expect(() => identitySign(binding, KEYS)).toThrow(/signs nothing/);
        expect(() => identitySign(retire, KEYS)).toThrow(/signs nothing/);
        expect(() => identitySign(takeover, identityKeys(new Uint8Array(32).fill(2)))).toThrow(/not the record address/);
        expect(() => issuerSign('nope\n', ISSUER_KEY)).toThrow();
        expect(() => issuerSign(binding, new Uint8Array(32).fill(8))).toThrow();
        const r = issuerRecord({ old: ISSUER, new: NEXT, since: { height: 300, block: H } });
        expect(() => issuerSign(r, ISSUER_KEY)).toThrow(/address record/);
        expect(() => rotationSign(binding, ISSUER_KEY, NEXT_KEY)).toThrow(/issuer record/);
        expect(() => rotationSign(r, NEXT_KEY, ISSUER_KEY)).toThrow();
    });
});

describe('verifyRecord', () => {
    it('accepts each, with its id', () => {
        expect(verifyRecord(envB, ctx)).toMatchObject({ ok: true, id: recordId(binding) });
        expect(verifyRecord(envT, ctx)).toMatchObject({ ok: true, id: recordId(takeover) });
        expect(verifyRecord(envR, ctx)).toMatchObject({ ok: true, id: recordId(retire) });
    });

    it('refuses an envelope of the wrong shape', () => {
        for (const bad of [null, [], 'x', { record: binding }, { ...envB, extra: '' }, { ...envB, address_sig: 1 }]) {
            expect(verifyRecord(bad, ctx)).toEqual({ ok: false, reason: 'malformed', issuerSigned: false });
        }
    });

    it('refuses a retire carrying an identity signature', () => {
        expect(verifyRecord({ ...envR, nostr_sig: envT.nostr_sig }, ctx)).toEqual({
            ok: false,
            reason: 'custodial_key_signed',
            issuerSigned: true,
        });
    });

    it('refuses a takeover with no Nostr signature, and a chain lookup that throws', () => {
        const { nostr_sig: _drop, ...noNostr } = envT;
        expect(verifyRecord(noNostr, ctx)).toEqual({ ok: false, reason: 'nostr_sig_invalid', issuerSigned: true });
        const throwing: VerifyContext = {
            ...ctx,
            blockHash: () => {
                throw new Error('offline');
            },
        };
        expect(verifyRecord(envB, throwing)).toEqual({ ok: false, reason: 'since_unverified', issuerSigned: true });
    });

    it('trusts only the issuers it is given', () => {
        expect(verifyRecord(envB, { ...ctx, issuers: [] })).toEqual({
            ok: false,
            reason: 'issuer_unknown',
            issuerSigned: false,
        });
    });

    it('refuses an anchor that is not a height above the since block', () => {
        for (const a of [100, 99, -1, 150.5, Number.NaN]) {
            expect(verifyRecord(envB, ctx, a)).toEqual({ ok: false, reason: 'bad_anchor', issuerSigned: true });
        }
        expect(verifyRecord(envB, ctx, 101)).toMatchObject({ ok: true });
    });
});

describe('resolveIssuers', () => {
    const r = issuerRecord({ old: ISSUER, new: NEXT, since: { height: 300, block: H } });
    const env = { record: r, ...rotationSign(r, ISSUER_KEY, NEXT_KEY) };

    it('follows a hand-over and ends the old term at its since block', () => {
        expect(resolveIssuers(ISSUER, [{ envelope: env, anchoredAt: 305 }], blockHash)).toEqual({
            ok: true,
            terms: [
                { address: ISSUER, from: 0, until: { since: 300, anchoredAt: 305 } },
                { address: NEXT, from: 300 },
            ],
        });
    });

    it('ignores anything that is not an issuer record signed by both', () => {
        for (const noise of [null, 'x', envB, { ...env, extra: 1 }, { ...env, old_sig: env.new_sig }]) {
            expect(resolveIssuers(ISSUER, [{ envelope: noise }], blockHash)).toEqual({ ok: true, terms: namedIssuer(ISSUER) });
        }
    });

    it('refuses an anchor at or below the hand-over since block', () => {
        expect(resolveIssuers(ISSUER, [{ envelope: env, anchoredAt: 300 }], blockHash)).toEqual({
            ok: false,
            reason: 'bad_anchor',
        });
    });

    it('takes the old issuer only until the hand-over is anchored', () => {
        const terms = resolveIssuers(ISSUER, [{ envelope: env, anchoredAt: 305 }], blockHash);
        if (!terms.ok) throw new Error(terms.reason);
        const v = { ...ctx, issuers: terms.terms };
        expect(verifyRecord(envB, v, 305)).toMatchObject({ ok: true });
        expect(verifyRecord(envB, v, 306)).toEqual({ ok: false, reason: 'issuer_retired', issuerSigned: false });
        expect(verifyRecord(envB, v)).toEqual({ ok: false, reason: 'issuer_retired', issuerSigned: false });
    });
});

describe('resolveKeyHolder', () => {
    it('reads no record as plain Bitcoin only when the read was complete', () => {
        expect(resolveKeyHolder(KEYS.address, all(), ctx)).toEqual({ status: 'unbound' });
        expect(resolveKeyHolder(KEYS.address, { complete: false, records: [] }, ctx)).toEqual({
            status: 'refused',
            reason: 'unavailable',
        });
    });

    it('counts a repeated record once, and keeps the anchor a copy proves', () => {
        const records = [{ envelope: envB }, { envelope: envB }, { envelope: envT }, { envelope: envT, anchoredAt: 210 }];
        const r = resolveKeyHolder(KEYS.address, { complete: true, records }, ctx) as BoundState;
        expect(r).toMatchObject({ status: 'bound', born: 'orangecheck', holder: 'user', takeover: { anchoredAt: 210 } });
    });

    it('is not moved by noise anyone can publish under the address', () => {
        const noise = [null, 'x', { record: 'nope\n', issuer_sig: '' }, { ...envB, issuer_sig: envT.address_sig }];
        expect(resolveKeyHolder(KEYS.address, all(...noise, envB), ctx)).toMatchObject({
            status: 'bound',
            holder: 'orangecheck',
        });
        expect(resolveKeyHolder(KEYS.address, all(...noise), ctx)).toEqual({ status: 'unbound' });
    });

    it('refuses where an issuer-signed copy is broken and none other verifies', () => {
        expect(resolveKeyHolder(KEYS.address, all(envB, { ...envT, nostr_sig: '00'.repeat(64) }), ctx)).toEqual({
            status: 'refused',
            reason: 'record_unverified',
        });
    });

    it('retires a custodial binding', () => {
        expect(resolveKeyHolder(KEYS.address, all(envB, envR), ctx)).toMatchObject({
            status: 'bound',
            holder: 'retired',
            retire: { reason: 'deleted' },
        });
    });
});

describe('judgeSignature', () => {
    const state = resolveKeyHolder(
        KEYS.address,
        { complete: true, records: [{ envelope: envB }, { envelope: envT, anchoredAt: 205 }] },
        ctx
    );

    it('refuses bad evidence instead of ignoring it', () => {
        for (const evidence of [
            { anchoredAt: Number.NaN },
            { anchoredAt: -1 },
            { anchoredAt: 200.5 },
            { madeAfter: 1.5 },
            { madeAfter: 210, anchoredAt: 209 },
            { live: 'yes' as unknown as boolean },
        ]) {
            expect(judgeSignature(state, evidence)).toEqual({ accept: false, reason: 'bad_evidence' });
        }
    });

    it('orders a signature against the takeover by anchors', () => {
        expect(judgeSignature(state, { anchoredAt: 200 })).toEqual({ accept: false, reason: 'before_takeover' });
        expect(judgeSignature(state, { anchoredAt: 201 })).toEqual({ accept: true, reason: 'ambiguous_window' });
        expect(judgeSignature(state, { anchoredAt: 205 })).toEqual({ accept: true, reason: 'ambiguous_window' });
        expect(judgeSignature(state, { madeAfter: 204 })).toEqual({ accept: true, reason: 'ambiguous_window' });
        expect(judgeSignature(state, { madeAfter: 205 })).toEqual({ accept: true, reason: 'after_takeover' });
        expect(judgeSignature(state, { live: true, anchoredAt: 150 })).toEqual({ accept: false, reason: 'before_takeover' });
    });

    it('never accepts a takeover with no anchor as proof a signature came after', () => {
        const unanchored = resolveKeyHolder(KEYS.address, all(envB, envT), ctx);
        expect(judgeSignature(unanchored, { madeAfter: 999 })).toEqual({ accept: true, reason: 'ambiguous_window' });
    });
});

describe('publicationTags', () => {
    it('gives each record its own d tag, so a retire published under the issuer key replaces no binding', () => {
        const [b, r] = [publicationTags(binding), publicationTags(retire)];
        expect(b[0]![1]).not.toBe(r[0]![1]);
        expect(b).toContainEqual(['t', KEYS.address]);
        expect(r).toContainEqual(['t', KEYS.address]);
        expect(b[0]![1]).toBe(`oc-attest-key:${KEYS.address}:${recordId(binding)}`);
    });
});
