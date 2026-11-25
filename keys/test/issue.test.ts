import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { describe, expect, it } from 'vitest';

import { identityKeys } from '../src/derive';
import { countersignTakeover, issueCustodialBinding, issueRetire, readBack, signTakeover } from '../src/issue';
import {
    bindingRecord,
    identitySign,
    issuerSign,
    namedIssuer,
    parseRecord,
    publicationTags,
    recordId,
    resolveKeyHolder,
    takeoverRecord,
    verifyRecord,
    type VerifyContext,
    type SignedRecord,
} from '../src/records';

const ISSUER_KEY = new Uint8Array(32).fill(7);
const ISSUER = { address: addressFromPrivateKey(ISSUER_KEY, 'p2wpkh'), addressKey: ISSUER_KEY };
const OTHER_KEY = new Uint8Array(32).fill(9);
const OTHER = { address: addressFromPrivateKey(OTHER_KEY, 'p2wpkh'), addressKey: OTHER_KEY };
const KEYS = identityKeys(new Uint8Array(32).fill(1));
const STRANGER = identityKeys(new Uint8Array(32).fill(2));
const DID = 'did:oc:0123456789abcdef0123456789abcdef';
const H = 'ab'.repeat(32);
const blockHash = (h: number) => (h === 100 || h === 200 || h === 300 ? H : undefined);
const ctx: VerifyContext = { issuers: namedIssuer(ISSUER.address), blockHash };
const at = (height: number) => ({ height, block: H });

const bound = issueCustodialBinding({ didOc: DID, address: KEYS.address, nostr: KEYS.nostr, issuer: ISSUER, since: at(100) });
const request = () => signTakeover({ binding: bound.envelope, keys: KEYS, issuer: ISSUER.address, since: at(200) });
const countersign = (req: unknown, over: Partial<Parameters<typeof countersignTakeover>[1]> = {}) =>
    countersignTakeover(req, { binding: bound.envelope, issuer: ISSUER, ctx, ...over });
// Each copy anchored in the block after its since block.
const complete = (...envelopes: SignedRecord[]) => ({
    complete: true,
    records: envelopes.map((e) => ({ envelope: e, anchoredAt: parseRecord(e.record)!.since.height + 1 })),
});

describe('issueCustodialBinding', () => {
    it('is a custodial binding only the issuer signed, and it verifies', () => {
        const r = parseRecord(bound.envelope.record);
        expect(r).toMatchObject({ type: 'binding', keyHolder: 'orangecheck', address: KEYS.address, issuer: ISSUER.address });
        expect(Object.keys(bound.envelope).sort()).toEqual(['issuer_sig', 'record']);
        expect(verifyRecord(bound.envelope, ctx)).toMatchObject({ ok: true, id: bound.id });
    });
    it('carries its id and a kind-30078 event with the publication tags and the envelope', () => {
        expect(bound.id).toBe(recordId(bound.envelope.record));
        expect(bound.event.kind).toBe(30078);
        expect(bound.event.tags).toEqual(publicationTags(bound.envelope.record));
        expect(JSON.parse(bound.event.content)).toEqual(bound.envelope);
    });
    it('refuses fields that do not make a canonical record', () => {
        const f = { didOc: DID, address: KEYS.address, nostr: KEYS.nostr, issuer: ISSUER, since: at(100) };
        expect(() => issueCustodialBinding({ ...f, didOc: 'did:oc:nothex' })).toThrow(RangeError);
        expect(() => issueCustodialBinding({ ...f, didOc: `${DID}\nkey_holder: user` })).toThrow(RangeError);
        expect(() => issueCustodialBinding({ ...f, nostr: 'AB'.repeat(32) })).toThrow(RangeError);
    });
    it('refuses a key that is not the issuer address', () => {
        expect(() =>
            issueCustodialBinding({
                didOc: DID,
                address: KEYS.address,
                nostr: KEYS.nostr,
                issuer: { address: ISSUER.address, addressKey: OTHER_KEY },
                since: at(100),
            })
        ).toThrow('not the key of this address');
    });
});

describe('issueRetire', () => {
    const retired = issueRetire({
        didOc: DID,
        address: KEYS.address,
        binding: bound.id,
        reason: 'withdrawn',
        issuer: ISSUER,
        since: at(200),
    });
    it('names the binding and the reason, and verifies', () => {
        expect(parseRecord(retired.envelope.record)).toMatchObject({ type: 'retire', binding: bound.id, reason: 'withdrawn' });
        expect(verifyRecord(retired.envelope, ctx)).toMatchObject({ ok: true, id: retired.id });
    });
    it('retires the address once published', () => {
        expect(resolveKeyHolder(KEYS.address, complete(bound.envelope, retired.envelope), ctx)).toMatchObject({
            status: 'bound',
            born: 'orangecheck',
            holder: 'retired',
            retire: { id: retired.id, reason: 'withdrawn' },
        });
    });
    it('refuses a reason the spec does not list', () => {
        expect(() =>
            issueRetire({
                didOc: DID,
                address: KEYS.address,
                binding: bound.id,
                reason: 'wallet_linked' as never,
                issuer: ISSUER,
                since: at(200),
            })
        ).toThrow(RangeError);
    });
});

describe('signTakeover and countersignTakeover', () => {
    it('makes a takeover that verifies and moves the key to the user', () => {
        const done = countersign(request());
        if (!done.ok) throw new Error(done.reason);
        expect(parseRecord(done.issued.envelope.record)).toMatchObject({ type: 'takeover', binding: bound.id });
        expect(verifyRecord(done.issued.envelope, ctx)).toMatchObject({ ok: true, id: done.issued.id });
        expect(resolveKeyHolder(KEYS.address, complete(bound.envelope, done.issued.envelope), ctx)).toMatchObject({
            status: 'bound',
            born: 'orangecheck',
            holder: 'user',
            takeover: { id: done.issued.id },
        });
    });
    it('signTakeover refuses keys that are not the binding address', () => {
        expect(() => signTakeover({ binding: bound.envelope, keys: STRANGER, issuer: ISSUER.address, since: at(200) })).toThrow(
            "not the binding's"
        );
    });
    it('signTakeover refuses a user binding and a since block below the binding', () => {
        const user = bindingRecord({ didOc: DID, address: KEYS.address, nostr: KEYS.nostr, keyHolder: 'user', issuer: ISSUER.address, since: at(100) });
        const userEnv = { record: user, issuer_sig: issuerSign(user, ISSUER_KEY), ...identitySign(user, KEYS) };
        expect(() => signTakeover({ binding: userEnv, keys: KEYS, issuer: ISSUER.address, since: at(200) })).toThrow('custodial');
        expect(() => signTakeover({ binding: bound.envelope, keys: KEYS, issuer: ISSUER.address, since: at(99) })).toThrow(RangeError);
    });

    const forged = (over: Partial<Parameters<typeof takeoverRecord>[0]>, keys = KEYS) => {
        const record = takeoverRecord({
            didOc: DID,
            address: KEYS.address,
            nostr: KEYS.nostr,
            binding: bound.id,
            issuer: ISSUER.address,
            since: at(200),
            ...over,
        });
        return { record, ...identitySign(record, keys) };
    };
    const refusals: [string, () => unknown, string][] = [
        ['not an object', () => 'takeover', 'malformed'],
        ['an extra key', () => ({ ...request(), issuer_sig: 'x' }), 'malformed'],
        ['a missing signature', () => ({ record: request().record, address_sig: request().address_sig }), 'malformed'],
        ['a signature that is not text', () => ({ ...request(), nostr_sig: 7 }), 'malformed'],
        ['a record that is not text', () => ({ ...request(), record: 7 }), 'malformed'],
        ['the binding itself', () => ({ ...request(), record: bound.envelope.record }), 'not_a_takeover'],
        ['text off by one character', () => ({ ...request(), record: request().record.replace('trust:', 'trust: ') }), 'not_a_takeover'],
        ['another binding id', () => forged({ binding: 'cd'.repeat(32) }), 'binding_mismatch'],
        ['another did:oc', () => forged({ didOc: 'did:oc:ffffffffffffffffffffffffffffffff' }), 'binding_mismatch'],
        ['another address', () => forged({ address: STRANGER.address }, STRANGER), 'binding_mismatch'],
        ['another Nostr key', () => forged({ nostr: STRANGER.nostr }), 'binding_mismatch'],
        ['another issuer', () => forged({ issuer: OTHER.address }), 'issuer_mismatch'],
        ['a since block below the binding', () => forged({ since: at(99) }), 'since_before_binding'],
        ['an address signature by another key', () => ({ ...request(), address_sig: signMessage(STRANGER.address, request().record, STRANGER.addressKey) }), 'address_sig_invalid'],
        ['an address signature over another record', () => ({ ...request(), address_sig: forged({ since: at(300) }).address_sig }), 'address_sig_invalid'],
        ['a Nostr signature over another record', () => ({ ...request(), nostr_sig: forged({ since: at(300) }).nostr_sig }), 'nostr_sig_invalid'],
        ['a Nostr signature that is not hex', () => ({ ...request(), nostr_sig: 'zz'.repeat(64) }), 'nostr_sig_invalid'],
        ['a since block not on the chain', () => forged({ since: { height: 200, block: 'cd'.repeat(32) } }), 'since_not_on_chain'],
        ['a since block the chain lacks', () => forged({ since: at(250) }), 'since_unverified'],
    ];
    for (const [name, make, reason] of refusals) {
        it(`refuses ${name}: ${reason}`, () => {
            expect(countersign(make())).toEqual({ ok: false, reason });
        });
    }
    it('refuses to take over a user binding', () => {
        const user = bindingRecord({ didOc: DID, address: KEYS.address, nostr: KEYS.nostr, keyHolder: 'user', issuer: ISSUER.address, since: at(100) });
        const userEnv = { record: user, issuer_sig: issuerSign(user, ISSUER_KEY), ...identitySign(user, KEYS) };
        expect(countersign(request(), { binding: userEnv })).toEqual({ ok: false, reason: 'not_custodial' });
    });
    it('refuses an issuer whose term the verifier does not hold', () => {
        const req = forged({ issuer: OTHER.address });
        expect(countersign(req, { issuer: OTHER })).toEqual({ ok: false, reason: 'issuer_unknown' });
    });
});

describe('readBack', () => {
    const done = countersign(request());
    if (!done.ok) throw new Error(done.reason);
    const taken = done.issued.envelope;
    it('confirms what was issued', () => {
        const r = readBack({ address: KEYS.address, expect: { binding: bound.id, holder: 'orangecheck' }, lookup: complete(bound.envelope), ctx });
        expect(r).toMatchObject({ ok: true, state: { binding: { id: bound.id }, holder: 'orangecheck' } });
    });
    it('says the binding is not seen when the relays do not carry it', () => {
        const r = readBack({ address: KEYS.address, expect: { binding: bound.id, holder: 'orangecheck' }, lookup: complete(), ctx });
        expect(r).toMatchObject({ ok: false, reason: 'not_seen' });
    });
    it('says the holder differs after a takeover', () => {
        const r = readBack({
            address: KEYS.address,
            expect: { binding: bound.id, holder: 'orangecheck' },
            lookup: complete(bound.envelope, taken),
            ctx,
        });
        expect(r).toMatchObject({ ok: false, reason: 'holder_differs', state: { holder: 'user' } });
    });
    it('says a read that was not complete decides nothing', () => {
        const r = readBack({
            address: KEYS.address,
            expect: { binding: bound.id, holder: 'orangecheck' },
            lookup: { complete: false, records: [] },
            ctx,
        });
        expect(r).toMatchObject({ ok: false, reason: 'unavailable' });
    });
    it('says another binding holds the address', () => {
        const second = issueCustodialBinding({ didOc: DID, address: KEYS.address, nostr: KEYS.nostr, issuer: ISSUER, since: at(300) });
        const r = readBack({ address: KEYS.address, expect: { binding: second.id, holder: 'orangecheck' }, lookup: complete(bound.envelope), ctx });
        expect(r).toMatchObject({ ok: false, reason: 'other_binding', state: { binding: { id: bound.id } } });
    });
    it('passes on the reason the records refuse the address', () => {
        const second = issueCustodialBinding({ didOc: DID, address: KEYS.address, nostr: KEYS.nostr, issuer: ISSUER, since: at(300) });
        const r = readBack({
            address: KEYS.address,
            expect: { binding: bound.id, holder: 'orangecheck' },
            lookup: complete(bound.envelope, second.envelope),
            ctx,
        });
        expect(r).toMatchObject({ ok: false, reason: 'refused', state: { status: 'refused', reason: 'conflicting_bindings' } });
    });
});
