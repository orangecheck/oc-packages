import { addressFromPrivateKey } from '@orangecheck/bip322';
import { describe, expect, it } from 'vitest';

import { deriveWallet, identityKeys, walletKey } from '../src/derive';
import {
    bindingRecord,
    CUSTODIAL_TRUST,
    identitySign,
    issuerRecord,
    issuerSign,
    judgeSignature,
    judgeWalletLink,
    namedIssuer,
    parseRecord,
    possessionSign,
    publicationTags,
    recordId,
    resolveIssuers,
    resolveKeyHolder,
    resolveWalletLink,
    retireRecord,
    rotationSign,
    takeoverRecord,
    verifyRecord,
    verifyWalletRecord,
    WALLET_LINK_ACK,
    walletLinkRecord,
    walletLinkSign,
    walletUnlinkRecord,
    walletUnlinkSign,
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
const envB = { record: binding, issuer_sig: issuerSign(binding, ISSUER_KEY), ...possessionSign(binding, KEYS) };
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
    it('lets the issuer sign any address record, the custodial key only its binding, and the browser a user binding or a takeover', () => {
        expect(typeof issuerSign(binding, ISSUER_KEY)).toBe('string');
        expect(() => identitySign(binding, KEYS)).toThrow(/possessionSign/);
        expect(() => identitySign(retire, KEYS)).toThrow(/issuer signature only/);
        expect(() => identitySign(takeover, identityKeys(new Uint8Array(32).fill(2)))).toThrow(/not the record address/);
        const user = binding.replace('key_holder: orangecheck', 'key_holder: user').replace(/trust: .*\n/, '');
        expect(parseRecord(user)).toMatchObject({ keyHolder: 'user' });
        expect(Object.keys(identitySign(user, KEYS))).toEqual(['address_sig', 'nostr_sig']);
        for (const other of [takeover, retire, user, 'nope\n']) {
            expect(() => possessionSign(other, KEYS)).toThrow(/only a canonical custodial binding/);
        }
        expect(() => possessionSign(binding, identityKeys(new Uint8Array(32).fill(2)))).toThrow(/not the record address/);
        // The right address key beside another Nostr key: no Nostr signature the binding does not name.
        const wrongNostr = { ...KEYS, nostrKey: identityKeys(new Uint8Array(32).fill(2)).nostrKey };
        expect(() => possessionSign(binding, wrongNostr)).toThrow(/Nostr key/);
        expect(() => identitySign(takeover, wrongNostr)).toThrow(/Nostr key/);
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
            expect(verifyRecord(bad, ctx)).toEqual({ ok: false, reason: 'malformed', signed: { issuer: false, address: false } });
        }
    });

    it('refuses a retire carrying an identity signature', () => {
        expect(verifyRecord({ ...envR, nostr_sig: envT.nostr_sig }, ctx)).toEqual({
            ok: false,
            reason: 'custodial_key_signed',
            signed: { issuer: true, address: false },
        });
    });

    it('refuses a binding without its proof of possession, and says which key signed', () => {
        const { address_sig: _a, ...noAddress } = envB;
        const { nostr_sig: _n, ...noNostr } = envB;
        expect(verifyRecord(noAddress, ctx)).toEqual({ ok: false, reason: 'address_sig_missing', signed: { issuer: true, address: false } });
        expect(verifyRecord(noNostr, ctx)).toEqual({ ok: false, reason: 'nostr_sig_missing', signed: { issuer: true, address: true } });
        expect(verifyRecord({ ...envB, address_sig: envT.address_sig }, ctx)).toEqual({
            ok: false,
            reason: 'address_sig_invalid',
            signed: { issuer: true, address: false },
        });
        expect(verifyRecord(envB, ctx)).toMatchObject({ ok: true, signed: { issuer: true, address: true } });
        expect(verifyRecord(envR, ctx)).toMatchObject({ ok: true, signed: { issuer: true, address: false } });
    });

    it('refuses a takeover with no Nostr signature, and a chain lookup that throws', () => {
        const { nostr_sig: _drop, ...noNostr } = envT;
        expect(verifyRecord(noNostr, ctx)).toEqual({ ok: false, reason: 'nostr_sig_missing', signed: { issuer: true, address: true } });
        const throwing: VerifyContext = {
            ...ctx,
            blockHash: () => {
                throw new Error('offline');
            },
        };
        expect(verifyRecord(envB, throwing)).toEqual({ ok: false, reason: 'since_unverified', signed: { issuer: true, address: true } });
    });

    it('trusts only the issuers it is given', () => {
        expect(verifyRecord(envB, { ...ctx, issuers: [] })).toEqual({
            ok: false,
            reason: 'issuer_unknown',
            signed: { issuer: false, address: true },
        });
    });

    it('refuses an anchor that is not a height above the since block', () => {
        for (const a of [100, 99, -1, 150.5, Number.NaN]) {
            expect(verifyRecord(envB, ctx, a)).toEqual({ ok: false, reason: 'bad_anchor', signed: { issuer: true, address: true } });
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
        expect(verifyRecord(envB, v, 306)).toEqual({ ok: false, reason: 'issuer_retired', signed: { issuer: false, address: true } });
        expect(verifyRecord(envB, v)).toEqual({ ok: false, reason: 'issuer_retired', signed: { issuer: false, address: true } });
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

    it("ignores what the issuer alone signs about an address it does not hold", () => {
        const { address_sig: _a, nostr_sig: _n, ...issuerOnly } = envB;
        expect(resolveKeyHolder(KEYS.address, all(issuerOnly), ctx)).toEqual({ status: 'unbound' });
        // A broken copy without the address's signature refuses nothing: anyone with the issuer key could make one.
        expect(resolveKeyHolder(KEYS.address, all({ ...issuerOnly, address_sig: envT.address_sig }), ctx)).toEqual({ status: 'unbound' });
        const { address_sig: _ta, nostr_sig: _tn, ...takeoverIssuerOnly } = envT;
        expect(resolveKeyHolder(KEYS.address, all(envB, takeoverIssuerOnly), ctx)).toMatchObject({ holder: 'orangecheck' });
        expect(resolveKeyHolder(KEYS.address, all(envR), ctx)).toEqual({ status: 'unbound' });
        expect(resolveKeyHolder(KEYS.address, all(envT), ctx)).toEqual({ status: 'refused', reason: 'takeover_without_binding' });
    });

    it('lets a retire count only against the custodial binding it names, before any takeover', () => {
        const user = binding.replace('key_holder: orangecheck', 'key_holder: user').replace(/trust: .*\n/, '');
        const envU = { record: user, issuer_sig: issuerSign(user, ISSUER_KEY), ...identitySign(user, KEYS) };
        const retireU = retire.replace(recordId(binding), recordId(user));
        const envRU = { record: retireU, issuer_sig: issuerSign(retireU, ISSUER_KEY) };
        expect(resolveKeyHolder(KEYS.address, all(envU, envRU), ctx)).toMatchObject({ born: 'user', holder: 'user' });
        // A retire whose since block this chain lacks is not checked against a user binding.
        const lateU = retireU.replace('since_height: 200', 'since_height: 250');
        expect(resolveKeyHolder(KEYS.address, all(envU, { record: lateU, issuer_sig: issuerSign(lateU, ISSUER_KEY) }), ctx)).toMatchObject({
            holder: 'user',
        });
        const late = retire.replace('since_height: 200', 'since_height: 250');
        const envLate = { record: late, issuer_sig: issuerSign(late, ISSUER_KEY) };
        expect(resolveKeyHolder(KEYS.address, all(envB, envLate), ctx)).toEqual({ status: 'refused', reason: 'record_unverified' });
        const at = (envelope: unknown, anchoredAt?: number) => ({ envelope, ...(anchoredAt === undefined ? {} : { anchoredAt }) });
        const read = (...records: { envelope: unknown; anchoredAt?: number }[]) => ({ complete: true, records });
        // After the takeover: a broken retire anchored before it could be made refuses; one anchored later is no record.
        expect(resolveKeyHolder(KEYS.address, read(at(envB, 110), at(envT, 210), at(envLate, 205)), ctx)).toMatchObject({ holder: 'user' });
        expect(resolveKeyHolder(KEYS.address, read(at(envB, 110), at(envT, 210), at(envLate, 150)), ctx)).toEqual({
            status: 'refused',
            reason: 'bad_anchor',
        });
        const other = retire.replace(`did_oc: ${DID}`, 'did_oc: did:oc:fedcba9876543210fedcba9876543210');
        const envOther = { record: other, issuer_sig: issuerSign(other, ISSUER_KEY) };
        expect(resolveKeyHolder(KEYS.address, read(at(envB, 110), at(envT, 210), at(envR, 220), at(envOther, 221)), ctx)).toMatchObject({
            holder: 'user',
        });
        expect(resolveKeyHolder(KEYS.address, all(envB, envOther), ctx)).toEqual({ status: 'refused', reason: 'retire_mismatch' });
    });

    it("gives broken copies of one record the same verdict in any order", () => {
        const { nostr_sig: _n, ...noNostr } = envT;
        for (const records of [
            [{ envelope: envB }, { envelope: noNostr }, { envelope: envT, anchoredAt: 150 }],
            [{ envelope: envB }, { envelope: envT, anchoredAt: 150 }, { envelope: noNostr }],
        ]) {
            expect(resolveKeyHolder(KEYS.address, { complete: true, records }, ctx)).toEqual({ status: 'refused', reason: 'bad_anchor' });
        }
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
        expect(b).toContainEqual(['t', `oc-attest-key:${KEYS.address}`]);
        expect(r).toContainEqual(['t', `oc-attest-key:${KEYS.address}`]);
        expect(b[0]![1]).toBe(`oc-attest-key:${KEYS.address}:${recordId(binding)}`);
    });

    it('never tags a record with a bare address, which attest reads as an attestation query', () => {
        for (const t of [publicationTags(binding), publicationTags(retire)]) {
            expect(t.filter(([k]) => k === 't').map(([, v]) => v)).not.toContain(KEYS.address);
        }
    });
});

describe('wallet links', () => {
    const W = new Uint8Array(32).fill(3);
    const WALLET = walletKey(W);
    const OTHER = identityKeys(new Uint8Array(32).fill(5));
    const link = walletLinkRecord({
        didOc: DID,
        address: KEYS.address,
        wallet: WALLET.address,
        binding: recordId(binding),
        since: { height: 200, block: H },
    });
    const unlink = walletUnlinkRecord({
        didOc: DID,
        address: KEYS.address,
        wallet: WALLET.address,
        link: recordId(link),
        since: { height: 200, block: H },
    });
    const envL = { record: link, ...walletLinkSign(link, KEYS, WALLET) };
    const at = (envelope: unknown, anchoredAt?: number) => (anchoredAt === undefined ? { envelope } : { envelope, anchoredAt });
    const read = (...records: { envelope: unknown; anchoredAt?: number }[]) => ({ complete: true, records });
    const taken = resolveKeyHolder(KEYS.address, { complete: true, records: [at(envB, 110), at(envT, 210)] }, ctx);

    it("signs with W's first receive address", () => {
        expect(WALLET.address).toBe(deriveWallet(W).address(0, 0));
        expect(walletKey(W, 1).address).toBe(deriveWallet(W).address(0, 1));
        expect(() => walletKey(W, 2 ** 31)).toThrow(RangeError);
        expect(link.endsWith(`ack: ${WALLET_LINK_ACK}\n`)).toBe(true);
    });

    it('is signed only by its own two keys, and an unlink by either', () => {
        expect(() => walletLinkSign(link, OTHER, WALLET)).toThrow('not the link addresses');
        expect(() => walletLinkSign(binding, KEYS, WALLET)).toThrow('not a canonical wallet link');
        expect(() => walletUnlinkSign(unlink, OTHER)).toThrow('neither');
        expect(Object.keys(walletUnlinkSign(unlink, KEYS))).toEqual(['address_sig']);
        expect(Object.keys(walletUnlinkSign(unlink, WALLET))).toEqual(['wallet_sig']);
        // Neither the issuer nor the identity's record signer takes one.
        expect(() => issuerSign(link, ISSUER_KEY)).toThrow('not a canonical address record');
        expect(() => identitySign(link, KEYS)).toThrow('not a canonical address record');
    });

    it('is no address record, and an address record is no wallet record', () => {
        expect(verifyRecord({ record: link, issuer_sig: issuerSign(binding, ISSUER_KEY) }, ctx)).toMatchObject({
            ok: false,
            reason: 'not_canonical',
        });
        expect(verifyWalletRecord(envB, blockHash)).toMatchObject({ ok: false, reason: 'malformed' });
        expect(resolveKeyHolder(KEYS.address, all(envB, envL), ctx)).toMatchObject({ status: 'bound', holder: 'orangecheck' });
    });

    it('never throws on junk', () => {
        for (const junk of [null, 1, [], 'x', { record: 1 }, { record: link, address_sig: 1 }, { record: link, extra: '' }]) {
            expect(verifyWalletRecord(junk, blockHash)).toMatchObject({ ok: false, reason: 'malformed' });
        }
        const throwing = () => {
            throw new Error('down');
        };
        expect(verifyWalletRecord(envL, throwing, 210)).toMatchObject({ ok: false, reason: 'since_unverified' });
        expect(resolveWalletLink(WALLET.address, read(at(null), at('x'), at(envL, 210)), { blockHash })).toMatchObject({
            status: 'linked',
        });
    });

    it('refuses a height that is not one', () => {
        expect(resolveWalletLink(WALLET.address, read(at(envL, 210)), { blockHash }, -1)).toEqual({
            status: 'refused',
            reason: 'bad_height',
        });
    });

    it("refuses a broken copy of an unlink by the link's own identity, and ignores another identity's", () => {
        const byIdentity = { record: unlink, ...walletUnlinkSign(unlink, KEYS) };
        // Its since block is unknown to this chain: a real unlink this verifier cannot check.
        const late = walletUnlinkRecord({
            didOc: DID,
            address: KEYS.address,
            wallet: WALLET.address,
            link: recordId(link),
            since: { height: 250, block: H },
        });
        expect(resolveWalletLink(WALLET.address, read(at(envL, 210), at(byIdentity, 220)), { blockHash })).toEqual({
            status: 'none',
        });
        expect(
            resolveWalletLink(WALLET.address, read(at(envL, 210), at({ record: late, ...walletUnlinkSign(late, KEYS) })), {
                blockHash,
            })
        ).toEqual({ status: 'refused', reason: 'record_unverified' });
        const stranger = walletUnlinkRecord({
            didOc: DID,
            address: OTHER.address,
            wallet: WALLET.address,
            link: recordId(link),
            since: { height: 250, block: H },
        });
        expect(
            resolveWalletLink(
                WALLET.address,
                read(at(envL, 210), at({ record: stranger, ...walletUnlinkSign(stranger, OTHER) })),
                { blockHash }
            )
        ).toMatchObject({ status: 'linked' });
    });

    it('keeps the earlier of two anchors for one link', () => {
        expect(resolveWalletLink(WALLET.address, read(at(envL, 230), at(envL, 210)), { blockHash })).toMatchObject({
            link: { anchoredAt: 210 },
        });
    });

    it('counts for the identity only after the takeover, and refuses a wallet orangecheck holds', () => {
        const state = resolveWalletLink(WALLET.address, read(at(envL, 210)), { blockHash });
        const unbound = { status: 'unbound' } as const;
        expect(judgeWalletLink({ address: KEYS.address, identity: taken, link: state, wallet: unbound })).toEqual({
            accept: true,
            reason: 'linked',
        });
        const held = resolveKeyHolder(KEYS.address, { complete: true, records: [at(envB, 110)] }, ctx);
        expect(judgeWalletLink({ address: KEYS.address, identity: held, link: state, wallet: unbound })).toEqual({
            accept: false,
            reason: 'orangecheck_held',
        });
        expect(judgeWalletLink({ address: KEYS.address, identity: taken, link: state, wallet: held })).toEqual({
            accept: false,
            reason: 'wallet_key_refused',
        });
        expect(judgeWalletLink({ address: OTHER.address, identity: taken, link: state, wallet: unbound })).toEqual({
            accept: false,
            reason: 'linked_elsewhere',
        });
    });
});
