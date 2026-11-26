// The public key-holder records (README §4) and the rule every verifier applies
// to a signature by an address they bind (README §5).
//
// A record is LF-separated text with one trailing LF, fields in a fixed order.
// Its id is the SHA-256 of that text; the signatures travel beside the text,
// so the id is the same one the envelope gets with its signatures emptied.
//
// - binding, of either key holder: the issuer, the identity address
//   (BIP-322) and the Nostr key (BIP-340 over the id), so an issuer binds only
//   a key it holds. A custodial key signs its own binding, once, at mint, and
//   nothing else before a takeover.
// - takeover: the same three. The user holds the key from then on, and the
//   record keeps that orangecheck held it until the takeover was anchored.
// - retire: the issuer alone, for a custodial binding never taken over.
// - issuer: a new issuer address, signed by the old one and the new one.
// - wallet-link: a wallet address whose coins count for the identity, signed
//   by both addresses (BIP-322) and no issuer. wallet-unlink ends it, signed
//   by either.
import { isDidOc } from '@orangecheck/auth-core/identifiers';
import { decodeAddress, signMessage, verifySignature } from '@orangecheck/bip322';
import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha2';

import { fromHex, toHex, utf8 } from './bytes';
import type { IdentityKeys } from './derive';

export { isDidOc };

/** Who holds an address's identity key. Not the funds' custody (FEDERATION-CUSTODY.md's `custody`). */
export type KeyHolder = 'orangecheck' | 'user';
export type RecordType = 'binding' | 'takeover' | 'retire' | 'issuer' | 'wallet-link' | 'wallet-unlink';

/** own_wallet: the account's own wallet address became its identity, so the key orangecheck made is shredded. */
export const RETIRE_REASONS = ['own_wallet', 'merged', 'deleted', 'withdrawn'] as const;
export type RetireReason = (typeof RETIRE_REASONS)[number];

/** A custodial binding's fixed trust line (family rule 8). */
export const CUSTODIAL_TRUST =
    "orangecheck made this key and holds it. The key signed this binding and signs nothing else, so no signature by it before a takeover is the user's.";

/** The takeover's fixed trust line: orangecheck's time as key holder stays on the record. */
export const TAKEOVER_TRUST =
    'orangecheck held this key until this record was anchored and says it deleted its copy. That cannot be proven.';

/** A wallet link's fixed line, which a wallet shows its holder before signing. */
export const WALLET_LINK_ACK = "The coins at this wallet count for this identity until either key ends the link.";

/** The Nostr d-tag prefix every record is published under (kind 30078). */
export const D_TAG_PREFIX = 'oc-attest-key:';

/** How many blocks below the tip a record's since block should be when it is made, so a reorg cannot strand it (README §4). */
export const SINCE_DEPTH = 6;

/** A block the record was made after: its height and its hash in the usual (RPC) byte order. */
export interface Since {
    height: number;
    block: string;
}

export interface BindingFields {
    didOc: string;
    address: string;
    nostr: string;
    keyHolder: KeyHolder;
    issuer: string;
    since: Since;
}

export interface TakeoverFields {
    didOc: string;
    address: string;
    nostr: string;
    /** The id of the custodial binding it takes over. */
    binding: string;
    issuer: string;
    since: Since;
}

export interface RetireFields {
    didOc: string;
    address: string;
    binding: string;
    issuer: string;
    since: Since;
    reason: RetireReason;
}

export interface IssuerFields {
    /** The issuer address that stops issuing. */
    old: string;
    /** The issuer address that issues from this record on. */
    new: string;
    since: Since;
}

export interface WalletLinkFields {
    didOc: string;
    /** The identity address. */
    address: string;
    /** The wallet address whose coins count for it. */
    wallet: string;
    /** The id of the identity address's binding. */
    binding: string;
    since: Since;
}

export interface WalletUnlinkFields {
    didOc: string;
    address: string;
    wallet: string;
    /** The id of the wallet link it ends. */
    link: string;
    since: Since;
}

export type ParsedRecord =
    | ({ type: 'binding' } & BindingFields)
    | ({ type: 'takeover' } & TakeoverFields)
    | ({ type: 'retire' } & RetireFields)
    | ({ type: 'issuer' } & IssuerFields)
    | ({ type: 'wallet-link' } & WalletLinkFields)
    | ({ type: 'wallet-unlink' } & WalletUnlinkFields);

/** The records an issuer signs about one identity address. */
export type AddressRecord = Extract<ParsedRecord, { type: 'binding' | 'takeover' | 'retire' }>;
/** The records the identity and a wallet sign between them. */
export type WalletRecord = Extract<ParsedRecord, { type: 'wallet-link' | 'wallet-unlink' }>;

const isAddressRecord = (r: ParsedRecord): r is AddressRecord =>
    r.type === 'binding' || r.type === 'takeover' || r.type === 'retire';

const HEADER: Record<RecordType, string> = {
    binding: 'oc-attest-key:binding:v1',
    takeover: 'oc-attest-key:takeover:v1',
    retire: 'oc-attest-key:retire:v1',
    issuer: 'oc-attest-key:issuer:v1',
    'wallet-link': 'oc-attest-key:wallet-link:v1',
    'wallet-unlink': 'oc-attest-key:wallet-unlink:v1',
};

function text(lines: string[]): string {
    return lines.join('\n') + '\n';
}

function sinceLines(s: Since): string[] {
    return [`since_height: ${s.height}`, `since_block: ${s.block}`];
}

export function bindingRecord(f: BindingFields): string {
    return text([
        HEADER.binding,
        `did_oc: ${f.didOc}`,
        `address: ${f.address}`,
        `nostr: ${f.nostr}`,
        `key_holder: ${f.keyHolder}`,
        `issuer: ${f.issuer}`,
        ...sinceLines(f.since),
        ...(f.keyHolder === 'orangecheck' ? [`trust: ${CUSTODIAL_TRUST}`] : []),
    ]);
}

export function takeoverRecord(f: TakeoverFields): string {
    return text([
        HEADER.takeover,
        `did_oc: ${f.didOc}`,
        `address: ${f.address}`,
        `nostr: ${f.nostr}`,
        `binding: ${f.binding}`,
        'key_holder: user',
        `issuer: ${f.issuer}`,
        ...sinceLines(f.since),
        `trust: ${TAKEOVER_TRUST}`,
    ]);
}

export function retireRecord(f: RetireFields): string {
    return text([
        HEADER.retire,
        `did_oc: ${f.didOc}`,
        `address: ${f.address}`,
        `binding: ${f.binding}`,
        `issuer: ${f.issuer}`,
        ...sinceLines(f.since),
        `reason: ${f.reason}`,
    ]);
}

export function issuerRecord(f: IssuerFields): string {
    return text([HEADER.issuer, `old: ${f.old}`, `new: ${f.new}`, ...sinceLines(f.since)]);
}

export function walletLinkRecord(f: WalletLinkFields): string {
    return text([
        HEADER['wallet-link'],
        `did_oc: ${f.didOc}`,
        `address: ${f.address}`,
        `wallet: ${f.wallet}`,
        `binding: ${f.binding}`,
        ...sinceLines(f.since),
        `ack: ${WALLET_LINK_ACK}`,
    ]);
}

export function walletUnlinkRecord(f: WalletUnlinkFields): string {
    return text([
        HEADER['wallet-unlink'],
        `did_oc: ${f.didOc}`,
        `address: ${f.address}`,
        `wallet: ${f.wallet}`,
        `link: ${f.link}`,
        ...sinceLines(f.since),
    ]);
}

export function recordText(r: ParsedRecord): string {
    if (r.type === 'binding') return bindingRecord(r);
    if (r.type === 'takeover') return takeoverRecord(r);
    if (r.type === 'retire') return retireRecord(r);
    if (r.type === 'wallet-link') return walletLinkRecord(r);
    if (r.type === 'wallet-unlink') return walletUnlinkRecord(r);
    return issuerRecord(r);
}

/** The record's id: lowercase hex SHA-256 of its UTF-8 text. */
export function recordId(record: string): string {
    return toHex(sha256(utf8(record)));
}

const HEX64 = /^[0-9a-f]{64}$/;
const HEIGHT = /^(?:0|[1-9][0-9]{0,8})$/;

/** A mainnet P2WPKH address in its one canonical (lowercase) spelling. */
export function isMainnetP2wpkh(a: unknown): a is string {
    if (typeof a !== 'string') return false;
    const d = decodeAddress(a);
    return d !== null && d.type === 'p2wpkh' && d.network === 'mainnet';
}

/**
 * Read a record's text strictly: the header names its type, every field is
 * present once in its place and well formed, and the text is exactly what the
 * builder writes for those fields (one trailing LF, no CR, nothing padded).
 */
export function parseRecord(record: unknown): ParsedRecord | null {
    if (typeof record !== 'string' || record.length > 4096 || !record.endsWith('\n')) return null;
    const lines = record.slice(0, -1).split('\n');
    const type = (Object.keys(HEADER) as RecordType[]).find((t) => HEADER[t] === lines[0]);
    if (!type) return null;
    const fields = new Map<string, string>();
    for (const line of lines.slice(1)) {
        const at = line.indexOf(': ');
        if (at < 1) return null;
        const key = line.slice(0, at);
        if (fields.has(key)) return null;
        fields.set(key, line.slice(at + 2));
    }
    const get = (k: string) => fields.get(k) ?? '';
    const height = get('since_height');
    const since = { height: Number(height), block: get('since_block') };
    if (!HEIGHT.test(height) || !HEX64.test(since.block)) return null;

    let parsed: ParsedRecord;
    if (type === 'issuer') {
        const old = get('old');
        const next = get('new');
        if (!isMainnetP2wpkh(old) || !isMainnetP2wpkh(next) || old === next) return null;
        parsed = { type, old, new: next, since };
    } else if (type === 'wallet-link' || type === 'wallet-unlink') {
        const didOc = get('did_oc');
        const address = get('address');
        const wallet = get('wallet');
        if (!isDidOc(didOc) || !isMainnetP2wpkh(address) || !isMainnetP2wpkh(wallet) || wallet === address) return null;
        parsed =
            type === 'wallet-link'
                ? { type, didOc, address, wallet, binding: get('binding'), since }
                : { type, didOc, address, wallet, link: get('link'), since };
        if (!HEX64.test(type === 'wallet-link' ? get('binding') : get('link'))) return null;
    } else {
        const didOc = get('did_oc');
        const address = get('address');
        const issuer = get('issuer');
        if (!isDidOc(didOc) || !isMainnetP2wpkh(address) || !isMainnetP2wpkh(issuer)) return null;
        if (type === 'binding') {
            const keyHolder = get('key_holder');
            if (keyHolder !== 'orangecheck' && keyHolder !== 'user') return null;
            parsed = { type, didOc, address, nostr: get('nostr'), keyHolder, issuer, since };
        } else if (type === 'takeover') {
            parsed = { type, didOc, address, nostr: get('nostr'), binding: get('binding'), issuer, since };
        } else {
            const reason = get('reason') as RetireReason;
            if (!RETIRE_REASONS.includes(reason)) return null;
            parsed = { type, didOc, address, binding: get('binding'), issuer, since, reason };
        }
        if ('nostr' in parsed && !HEX64.test(parsed.nostr)) return null;
        if ('binding' in parsed && !HEX64.test(parsed.binding)) return null;
    }
    // The fixed literals (key_holder: user, each trust line, the ack) and the field order are checked here.
    return recordText(parsed) === record ? parsed : null;
}

/** An address record as it travels: its text and the signatures beside it. */
export interface SignedRecord {
    record: string;
    /** BIP-322 simple, base64, by the record's issuer address. */
    issuer_sig: string;
    /** BIP-322 simple, base64, by the record's identity address. Every binding and takeover; never a retire. */
    address_sig?: string;
    /** BIP-340, 128 hex, by the record's Nostr key over the 32-byte id. Every binding and takeover; never a retire. */
    nostr_sig?: string;
    /** An OpenTimestamps proof of the id, base64. The verifier checks it and passes the height it attests. */
    ots?: string;
}

/** An issuer record as it travels. */
export interface SignedIssuerRecord {
    record: string;
    /** BIP-322 simple, base64, by the old issuer address. */
    old_sig: string;
    /** BIP-322 simple, base64, by the new issuer address. */
    new_sig: string;
    ots?: string;
}

/** Whether the identity key signs this record: every binding (a custodial key once, at mint) and a takeover. */
export function identitySigns(r: ParsedRecord): boolean {
    return r.type === 'binding' || r.type === 'takeover';
}

/** The issuer's signature over an address record (BIP-322 simple by its P2WPKH address). */
export function issuerSign(record: string, issuerKey: Uint8Array): string {
    const r = parseRecord(record);
    if (!r || !isAddressRecord(r)) throw new Error('not a canonical address record');
    return signMessage(r.issuer, record, issuerKey);
}

/** Both signatures over an issuer record: the old issuer's and the new one's. */
export function rotationSign(
    record: string,
    oldKey: Uint8Array,
    newKey: Uint8Array
): { old_sig: string; new_sig: string } {
    const r = parseRecord(record);
    if (!r || r.type !== 'issuer') throw new Error('not a canonical issuer record');
    return { old_sig: signMessage(r.old, record, oldKey), new_sig: signMessage(r.new, record, newKey) };
}

type SigningKeys = Pick<IdentityKeys, 'address' | 'addressKey' | 'nostrKey'>;

function bothSigs(r: AddressRecord, record: string, keys: SigningKeys, auxRand?: Uint8Array) {
    if (r.address !== keys.address) throw new Error('these keys are not the record address');
    if (!('nostr' in r) || toHex(schnorr.getPublicKey(keys.nostrKey)) !== r.nostr) {
        throw new Error('this Nostr key is not the record nostr');
    }
    return {
        address_sig: signMessage(r.address, record, keys.addressKey),
        nostr_sig: toHex(schnorr.sign(sha256(utf8(record)), keys.nostrKey, auxRand)),
    };
}

/** In the browser: the identity's two signatures over a user binding or a takeover. `auxRand` only for vectors. */
export function identitySign(
    record: string,
    keys: SigningKeys,
    auxRand?: Uint8Array
): { address_sig: string; nostr_sig: string } {
    const r = parseRecord(record);
    if (!r || !isAddressRecord(r)) throw new Error('not a canonical address record');
    if (r.type === 'retire') throw new Error('a retire carries the issuer signature only');
    if (r.type === 'binding' && r.keyHolder === 'orangecheck') {
        throw new Error('a custodial binding is signed at mint, by possessionSign');
    }
    return bothSigs(r, record, keys, auxRand);
}

/**
 * On the server, at mint: the one thing a custodial key ever signs, its own
 * binding, before the key is sealed. The proof of possession: without it, no
 * verifier counts the binding, so an issuer binds only a key it holds.
 */
export function possessionSign(
    bindingText: string,
    keys: SigningKeys,
    auxRand?: Uint8Array
): { address_sig: string; nostr_sig: string } {
    const r = parseRecord(bindingText);
    if (!r || r.type !== 'binding' || r.keyHolder !== 'orangecheck') {
        throw new Error('possessionSign signs only a canonical custodial binding');
    }
    return bothSigs(r, bindingText, keys, auxRand);
}

/** The Nostr tags a record is published with (kind 30078). No t tag is a bare address, so attest's address query (SPEC §6.2) never returns one. */
export function publicationTags(record: string): string[][] {
    const r = parseRecord(record);
    if (!r) throw new Error('not a canonical record');
    const id = recordId(record);
    if (r.type === 'issuer') {
        return [['d', `${D_TAG_PREFIX}issuer:${id}`], ['t', 'oc-attest-key-issuer']];
    }
    if (r.type === 'wallet-link' || r.type === 'wallet-unlink') {
        // Under the wallet, which a reader must read in full (README §6), and the identity.
        return [
            ['d', `${D_TAG_PREFIX}${r.wallet}:${id}`],
            ['t', `${D_TAG_PREFIX}${r.wallet}`],
            ['t', `${D_TAG_PREFIX}${r.address}`],
            ['t', 'oc-attest-key'],
        ];
    }
    return [['d', `${D_TAG_PREFIX}${r.address}:${id}`], ['t', `${D_TAG_PREFIX}${r.address}`], ['t', 'oc-attest-key']];
}

const isHeight = (h: unknown): h is number => typeof h === 'number' && Number.isInteger(h) && h >= 0;

/** Two copies of one record may carry different proofs: the earlier anchor bounds it best. */
const earliest = (a: number | undefined, b: number | undefined) =>
    a === undefined ? b : b === undefined ? a : Math.min(a, b);

function chainHas(blockHash: (height: number) => string | undefined, since: Since): 'yes' | 'no' | 'unknown' {
    let onChain: string | undefined;
    try {
        onChain = blockHash(since.height);
    } catch {
        onChain = undefined;
    }
    if (typeof onChain !== 'string') return 'unknown';
    return onChain === since.block ? 'yes' : 'no';
}

/** One issuer address and the blocks it issues for. */
export interface IssuerTerm {
    address: string;
    /** Its records name a since block at or above this height. */
    from: number;
    /** The issuer record that ended its term, when one did. */
    until?: { since: number; anchoredAt?: number };
}

/** A record with the height its OpenTimestamps proof attests, which the caller checked against its own header chain. */
export interface Anchored<T = unknown> {
    envelope: T;
    anchoredAt?: number;
}

export type IssuerFailure =
    | 'issuer_record_unverified' // signed by both, but the chain lacks its since block or names another
    | 'conflicting_issuer_records' // two records move one issuer to two, or two to one
    | 'issuer_loop'
    | 'bad_anchor'
    | 'unavailable'; // the read under the issuer tag was not complete

const ROTATION_KEYS = new Set(['record', 'old_sig', 'new_sig', 'ots']);

/**
 * The issuer terms, from the address the spec names and every issuer record
 * the verifier read under the issuer tag, which must reach the read floor.
 * Records signed by both sides are followed back to the issuers before it and
 * on to any after it; any other record is ignored, since anyone can publish
 * one. A record's since block off the chain, or an anchor at or below it,
 * refuses the set only when the walk reaches that record.
 */
export function resolveIssuers(
    named: string,
    lookup: RecordLookup,
    blockHash: (height: number) => string | undefined
): { ok: true; terms: IssuerTerm[] } | { ok: false; reason: IssuerFailure } {
    // A hand-over the read missed would leave a term's bindings unknown, so short of the floor nothing resolves.
    if (!lookup.complete) return { ok: false, reason: 'unavailable' };
    const valid = new Map<string, { r: ParsedRecord & { type: 'issuer' }; anchoredAt?: number; bad?: IssuerFailure }>();
    for (const { envelope, anchoredAt } of lookup.records) {
        if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) continue;
        const e = envelope as Record<string, unknown>;
        if (Object.keys(e).some((k) => !ROTATION_KEYS.has(k))) continue;
        if (typeof e.record !== 'string' || typeof e.old_sig !== 'string' || typeof e.new_sig !== 'string') continue;
        const r = parseRecord(e.record);
        if (!r || r.type !== 'issuer') continue;
        if (!verifySignature(r.old, e.record, e.old_sig) || !verifySignature(r.new, e.record, e.new_sig)) continue;
        const badAnchor = anchoredAt !== undefined && (!isHeight(anchoredAt) || anchoredAt <= r.since.height);
        const id = recordId(e.record);
        const seen = valid.get(id);
        const bad: IssuerFailure | undefined =
            chainHas(blockHash, r.since) !== 'yes'
                ? 'issuer_record_unverified'
                : badAnchor || seen?.bad
                  ? 'bad_anchor'
                  : undefined;
        valid.set(id, { r, anchoredAt: earliest(seen?.anchoredAt, anchoredAt), bad });
    }
    const all = [...valid.values()];
    const terms: IssuerTerm[] = [{ address: named, from: 0 }];
    const seen = new Set([named]);
    // Back to the issuers before the named one.
    for (let first = terms[0]!; ; first = terms[0]!) {
        const into = all.filter((x) => x.r.new === first.address);
        if (into.length === 0) break;
        if (into.length > 1) return { ok: false, reason: 'conflicting_issuer_records' };
        const { r, anchoredAt, bad } = into[0]!;
        if (bad) return { ok: false, reason: bad };
        if (seen.has(r.old)) return { ok: false, reason: 'issuer_loop' };
        seen.add(r.old);
        first.from = r.since.height;
        terms.unshift({ address: r.old, from: 0, until: { since: r.since.height, anchoredAt } });
    }
    // On to any issuer after it.
    for (let last = terms[terms.length - 1]!; ; last = terms[terms.length - 1]!) {
        const out = all.filter((x) => x.r.old === last.address);
        if (out.length === 0) break;
        if (out.length > 1) return { ok: false, reason: 'conflicting_issuer_records' };
        const { r, anchoredAt, bad } = out[0]!;
        if (bad) return { ok: false, reason: bad };
        if (seen.has(r.new)) return { ok: false, reason: 'issuer_loop' };
        seen.add(r.new);
        last.until = { since: r.since.height, anchoredAt };
        terms.push({ address: r.new, from: r.since.height });
    }
    // An issuer starts at or after the issuer before it.
    for (let i = 1; i < terms.length; i++) {
        if (terms[i]!.from < terms[i - 1]!.from) return { ok: false, reason: 'conflicting_issuer_records' };
    }
    return { ok: true, terms };
}

/**
 * The terms of the named issuer when a complete read holds no issuer record.
 * Only that read can show the issuer was never rotated, so this is for tests.
 */
export function namedIssuer(address: string): IssuerTerm[] {
    return [{ address, from: 0 }];
}

export interface VerifyContext {
    /** The issuer terms, from resolveIssuers over a complete read of the issuer tag. */
    issuers: readonly IssuerTerm[];
    /** The hash of the block at `height` on the verifier's own header chain, or undefined. */
    blockHash: (height: number) => string | undefined;
}

export type RecordFailure =
    // Not a record by an issuer the verifier trusts; a reader ignores it.
    | 'malformed' // not an object with a record and string signatures, or an unknown key
    | 'not_canonical' // the text is not an address record in canonical form
    | 'issuer_unknown' // the issuer is in no term the verifier holds
    | 'issuer_sig_invalid'
    | 'issuer_not_yet' // its since block is below the start of the issuer's term
    | 'issuer_retired' // the issuer's term ended, and no anchor shows the record was there before the end
    // Signed by the issuer, but this copy does not verify.
    | 'custodial_key_signed' // a retire carries an identity or Nostr signature
    | 'address_sig_missing' // a binding or takeover without its proof of possession
    | 'address_sig_invalid' // not a signature by the record's identity address
    | 'nostr_sig_missing'
    | 'nostr_sig_invalid'
    | 'since_unverified' // the verifier's chain has no block at that height
    | 'since_not_on_chain' // the block named is not the chain's block at that height
    | 'bad_anchor'; // an anchor that is not a height above the since block

/** Whose signatures on the copy verify, whatever else is wrong with it: a trusted issuer's, the address's own. */
export type AddressSigners = { issuer: boolean; address: boolean };

export type VerifiedRecord =
    | { ok: true; id: string; record: AddressRecord; signed: AddressSigners }
    | { ok: false; reason: RecordFailure; signed: AddressSigners };

const ENVELOPE_KEYS = new Set(['record', 'issuer_sig', 'address_sig', 'nostr_sig', 'ots']);

/**
 * Check one copy of an address record. Pure, offline and never throws; the
 * caller supplies the chain, the issuer terms and the anchor it verified.
 * `signed` says whether a trusted issuer and the address's own key signed
 * this text, so a reader can tell a broken copy of a real record from noise.
 */
export function verifyRecord(env: unknown, ctx: VerifyContext, anchoredAt?: number): VerifiedRecord {
    const none: AddressSigners = { issuer: false, address: false };
    if (!env || typeof env !== 'object' || Array.isArray(env)) return { ok: false, reason: 'malformed', signed: none };
    const e = env as Record<string, unknown>;
    for (const k of Object.keys(e)) if (!ENVELOPE_KEYS.has(k)) return { ok: false, reason: 'malformed', signed: none };
    if (typeof e.record !== 'string' || typeof e.issuer_sig !== 'string') return { ok: false, reason: 'malformed', signed: none };
    for (const k of ['address_sig', 'nostr_sig', 'ots']) {
        if (k in e && typeof e[k] !== 'string') return { ok: false, reason: 'malformed', signed: none };
    }
    const record = parseRecord(e.record);
    if (!record || !isAddressRecord(record)) return { ok: false, reason: 'not_canonical', signed: none };
    const text = e.record;
    const id = recordId(text);
    const address = typeof e.address_sig === 'string' && verifySignature(record.address, text, e.address_sig);
    const fail = (reason: RecordFailure, issuer = false): VerifiedRecord => ({
        ok: false,
        reason,
        signed: { issuer, address },
    });
    const term = ctx.issuers.find((t) => t.address === record.issuer);
    if (!term) return fail('issuer_unknown');
    if (!verifySignature(record.issuer, text, e.issuer_sig)) return fail('issuer_sig_invalid');
    if (anchoredAt !== undefined && (!isHeight(anchoredAt) || anchoredAt <= record.since.height)) {
        return fail('bad_anchor', true);
    }
    if (record.since.height < term.from) return fail('issuer_not_yet');
    if (term.until) {
        // Accepted only where an anchor puts it no later than the issuer record that ended the term.
        const end = term.until.anchoredAt ?? term.until.since;
        if (anchoredAt === undefined || anchoredAt > end) return fail('issuer_retired');
    }
    if (identitySigns(record)) {
        if (typeof e.address_sig !== 'string') return fail('address_sig_missing', true);
        if (!address) return fail('address_sig_invalid', true);
        if (typeof e.nostr_sig !== 'string') return fail('nostr_sig_missing', true);
        const sig = /^[0-9a-f]{128}$/.test(e.nostr_sig) ? fromHex(e.nostr_sig) : null;
        const nostr = 'nostr' in record ? fromHex(record.nostr) : null;
        let good = false;
        try {
            good = !!sig && !!nostr && schnorr.verify(sig, fromHex(id)!, nostr);
        } catch {
            good = false;
        }
        if (!good) return fail('nostr_sig_invalid', true);
    } else if ('address_sig' in e || 'nostr_sig' in e) {
        return fail('custodial_key_signed', true);
    }
    const chain = chainHas(ctx.blockHash, record.since);
    if (chain === 'unknown') return fail('since_unverified', true);
    if (chain === 'no') return fail('since_not_on_chain', true);
    return { ok: true, id, record, signed: { issuer: true, address } };
}

/**
 * What a verifier read under one tag (`oc-attest-key:<address>`, or the issuer
 * tag): every record copy relays served, and whether the read was complete,
 * which a verifier may say only at the read floor (README §4).
 */
export interface RecordLookup {
    complete: boolean;
    records: readonly Anchored[];
}

export interface ResolveContext extends VerifyContext {
    /** A binding id the account itself names (its did:oc's record or session): it exists, found or not. */
    namedBinding?: string;
}

export type ResolveFailure =
    | 'unavailable' // the read was not complete, or it holds records and there are no issuer terms to read them under
    | 'record_unverified' // a record the issuer signed, of which no copy verifies here
    | 'named_binding_missing'
    | 'conflicting_bindings'
    | 'takeover_without_binding'
    | 'conflicting_takeovers'
    | 'takeover_of_user_binding' // the binding never had orangecheck as key holder
    | 'takeover_mismatch' // its did:oc or Nostr key differ from the binding's
    | 'takeover_before_binding'
    | 'takeover_after_retire' // the retire is anchored before the takeover was made
    | 'conflicting_retires'
    | 'retire_mismatch'
    | 'retire_before_binding';

/** One record in an address's history. */
export interface Step {
    id: string;
    since: Since;
    anchoredAt?: number;
}

export interface BoundState {
    status: 'bound';
    didOc: string;
    address: string;
    nostr: string;
    /** Who made the key and held it first. It never changes. */
    born: KeyHolder;
    /** Who holds it now, as far as these records show. */
    holder: KeyHolder | 'retired';
    binding: Step;
    /** When it was taken over: orangecheck held the key until this record's anchor. */
    takeover?: Step;
    retire?: Step & { reason: RetireReason };
}

export type KeyHolderState =
    | { status: 'unbound' } // ochk.io has no record for the address: plain Bitcoin
    | BoundState
    | { status: 'refused'; reason: ResolveFailure | RecordFailure };

/**
 * Who holds an address's identity key, from every record copy the verifier
 * read for it. A binding or takeover counts only where the issuer and the
 * address's own key both signed it, so an issuer alone can neither bind an
 * address nor refuse one; a custodial binding its own key and a term's issuer
 * signed counts even outside that issuer's term, since only those two make
 * one. Short of the read floor nothing resolves, nor with no issuer terms
 * where the read holds any record. A retire, which only the issuer signs, counts only
 * against the custodial binding it names, before any takeover. A record that
 * counts is held once any copy of it verifies; if none does, the address is
 * refused, not read as unbound. Holding no takeover is not proof there is
 * none, so `holder: 'orangecheck'` means "as far as these records show",
 * which only ever refuses more.
 */
export function resolveKeyHolder(address: string, lookup: RecordLookup, ctx: ResolveContext): KeyHolderState {
    const refuse = (reason: ResolveFailure | RecordFailure): KeyHolderState => ({ status: 'refused', reason });
    // A record the read missed could refuse what the rest allow, so short of the floor nothing resolves.
    if (!lookup.complete) return refuse('unavailable');
    // With no issuer terms (README §4) any record could be a binding by an issuer the read missed.
    // A complete read holding none shows no issuer bound the address: plain Bitcoin, terms or not.
    if (!ctx.issuers.length && lookup.records.length) return refuse('unavailable');
    type Held = { record: AddressRecord; anchoredAt?: number; reason?: RecordFailure };
    const valid = new Map<string, Held>();
    const broken = new Map<string, Held>();
    for (const { envelope, anchoredAt } of lookup.records) {
        const v = verifyRecord(envelope, ctx, anchoredAt);
        const signer = v.signed.issuer || v.signed.address;
        const r = v.ok ? v.record : signer ? (parseRecord((envelope as SignedRecord).record) as AddressRecord) : null;
        if (!r || r.address !== address) continue;
        // Only the key's holder and a term's issuer sign a custodial binding: held where only the term check fails.
        const outOfTerm = !v.ok && (v.reason === 'issuer_not_yet' || v.reason === 'issuer_retired');
        const custodial = r.type === 'binding' && r.keyHolder === 'orangecheck' && outOfTerm;
        if (!v.ok && !v.signed.issuer && !custodial) continue;
        // Noise unless its own signers signed it: the issuer, and for a binding or takeover the address's key.
        if (r.type !== 'retire' && !v.signed.address) continue;
        const id = recordId((envelope as SignedRecord).record);
        const into = v.ok ? valid : broken;
        const seen = into.get(id);
        const reason = v.ok ? undefined : seen?.reason === 'bad_anchor' ? 'bad_anchor' : v.reason;
        into.set(id, { record: r, anchoredAt: earliest(seen?.anchoredAt, anchoredAt), reason });
    }
    for (const id of valid.keys()) broken.delete(id);
    const unverified = (held: Held[]) =>
        held.length ? refuse(held.some((h) => h.reason === 'bad_anchor') ? 'bad_anchor' : 'record_unverified') : null;
    const holding = unverified([...broken.values()].filter((h) => h.record.type !== 'retire'));
    if (holding) return holding;

    type Of<T extends AddressRecord['type']> = [string, Extract<AddressRecord, { type: T }>, number | undefined];
    const all = [...valid.entries()].map(([id, v]) => [id, v.record, v.anchoredAt] as const);
    const bindings = all.filter(([, r]) => r.type === 'binding') as Of<'binding'>[];
    const takeovers = all.filter(([, r]) => r.type === 'takeover') as Of<'takeover'>[];

    if (bindings.length > 1) return refuse('conflicting_bindings');
    if (bindings.length === 0) {
        if (takeovers.length) return refuse('takeover_without_binding');
        if (ctx.namedBinding !== undefined) return refuse('named_binding_missing');
        return { status: 'unbound' };
    }
    const [bindingId, binding, bindingAnchor] = bindings[0]!;
    if (ctx.namedBinding !== undefined && ctx.namedBinding !== bindingId) return refuse('named_binding_missing');
    const state: BoundState = {
        status: 'bound',
        didOc: binding.didOc,
        address: binding.address,
        nostr: binding.nostr,
        born: binding.keyHolder,
        holder: binding.keyHolder,
        binding: { id: bindingId, since: binding.since, anchoredAt: bindingAnchor },
    };

    if (takeovers.some(([, t]) => t.binding !== bindingId)) return refuse('takeover_without_binding');
    if (takeovers.length > 1) return refuse('conflicting_takeovers');
    const takeover = takeovers[0];
    if (takeover) {
        const [id, t, anchoredAt] = takeover;
        if (binding.keyHolder !== 'orangecheck') return refuse('takeover_of_user_binding');
        if (t.didOc !== binding.didOc || t.nostr !== binding.nostr) return refuse('takeover_mismatch');
        if (t.since.height < binding.since.height) return refuse('takeover_before_binding');
        state.holder = 'user';
        state.takeover = { id, since: t.since, anchoredAt };
    }

    // A retire names a custodial binding; one naming another binding, or a user's, is no record of this key.
    const retiring = (m: Map<string, Held>) =>
        [...m.entries()].filter(
            ([, h]) => h.record.type === 'retire' && h.record.binding === bindingId && binding.keyHolder === 'orangecheck'
        ) as [string, Held & { record: Extract<AddressRecord, { type: 'retire' }> }][];
    let retires = retiring(valid);
    let brokenRetires = retiring(broken);
    if (takeover) {
        // After the takeover only a retire anchored before it could be made counts; that one refuses the address.
        const before = ([, h]: [string, Held]) => h.anchoredAt !== undefined && h.anchoredAt <= takeover[1].since.height;
        if (retires.some(before)) return refuse('takeover_after_retire');
        brokenRetires = brokenRetires.filter(before);
        retires = [];
    }
    const retireHeld = unverified(brokenRetires.map(([, h]) => h));
    if (retireHeld) return retireHeld;
    if (retires.length > 1) return refuse('conflicting_retires');
    const retire = retires[0];
    if (retire) {
        const [id, { record: r, anchoredAt }] = retire;
        if (r.didOc !== binding.didOc) return refuse('retire_mismatch');
        if (r.since.height < binding.since.height) return refuse('retire_before_binding');
        state.holder = 'retired';
        state.retire = { id, since: r.since, anchoredAt, reason: r.reason };
    }
    return state;
}

/**
 * What a verifier knows about when a signed artifact was made, each height
 * already checked by the caller against its own header chain.
 */
export interface SignatureEvidence {
    /** The block that anchors the artifact (an OpenTimestamps proof or a transaction): it existed by this block. */
    anchoredAt?: number;
    /** A block whose hash the artifact commits to: it was made after this block. */
    madeAfter?: number;
    /** The verifier issued what was signed (a sign-in challenge) after it resolved these records. */
    live?: boolean;
}

export type SignatureVerdict =
    | { accept: true; reason: 'unbound' | 'user_born' | 'after_takeover' | 'ambiguous_window' }
    | {
          accept: false;
          reason: 'unresolved' | 'orangecheck_held' | 'retired' | 'before_takeover' | 'bad_evidence';
      };

/**
 * The key-holder rule (README §5), for a signature that already verifies for
 * the address. No ochk.io record: plain Bitcoin. A record that could not be
 * read or checked: refused. While orangecheck holds the key every signature
 * is refused, since that key signs nothing. After a takeover, one anchored at
 * or below the takeover's since block existed before the takeover could be
 * made: refused. One made after the takeover was anchored, or a live answer
 * to the verifier's own challenge, is the user's. Anything between is the
 * ambiguous window and is accepted: a leaked custodial key could sign anew
 * after the takeover anyway, so refusing it would add nothing.
 */
export function judgeSignature(state: KeyHolderState, evidence: SignatureEvidence = {}): SignatureVerdict {
    if (state.status === 'refused') return { accept: false, reason: 'unresolved' };
    if (state.status === 'unbound') return { accept: true, reason: 'unbound' };
    const { anchoredAt, madeAfter, live } = evidence;
    for (const h of [anchoredAt, madeAfter]) {
        if (h !== undefined && !isHeight(h)) return { accept: false, reason: 'bad_evidence' };
    }
    if (live !== undefined && typeof live !== 'boolean') return { accept: false, reason: 'bad_evidence' };
    // An artifact made after the block it was anchored in cannot be.
    if (anchoredAt !== undefined && madeAfter !== undefined && madeAfter >= anchoredAt) {
        return { accept: false, reason: 'bad_evidence' };
    }
    if (state.holder === 'retired') return { accept: false, reason: 'retired' };
    if (state.holder === 'orangecheck') return { accept: false, reason: 'orangecheck_held' };
    if (state.born === 'user') return { accept: true, reason: 'user_born' };
    const takeover = state.takeover!;
    if (anchoredAt !== undefined && anchoredAt <= takeover.since.height) return { accept: false, reason: 'before_takeover' };
    if (live === true) return { accept: true, reason: 'after_takeover' };
    if (madeAfter !== undefined && takeover.anchoredAt !== undefined && madeAfter >= takeover.anchoredAt) {
        return { accept: true, reason: 'after_takeover' };
    }
    return { accept: true, reason: 'ambiguous_window' };
}

// ── wallet links (README §6) ──

/** An address and its private key: the identity's (IdentityKeys) or a wallet's (walletKey). */
export interface AddressKey {
    address: string;
    addressKey: Uint8Array;
}

/** A wallet record as it travels: its text and the signatures beside it, no issuer's. */
export interface SignedWalletRecord {
    record: string;
    /** BIP-322 simple, base64, by the identity address. A link needs it; an unlink needs it or wallet_sig. */
    address_sig?: string;
    /** BIP-322 simple, base64, by the wallet address. */
    wallet_sig?: string;
    ots?: string;
}

const isWalletRecord = (r: ParsedRecord | null): r is WalletRecord =>
    r !== null && (r.type === 'wallet-link' || r.type === 'wallet-unlink');

/** Both signatures over a wallet link, made where both keys are: the browser, at takeover or later. */
export function walletLinkSign(
    record: string,
    identity: AddressKey,
    wallet: AddressKey
): { address_sig: string; wallet_sig: string } {
    const r = parseRecord(record);
    if (!r || r.type !== 'wallet-link') throw new Error('not a canonical wallet link');
    if (identity.address !== r.address || wallet.address !== r.wallet) throw new Error('these keys are not the link addresses');
    return { address_sig: signMessage(r.address, record, identity.addressKey), wallet_sig: signMessage(r.wallet, record, wallet.addressKey) };
}

/** One signature over a wallet unlink, by either of the link's two addresses. */
export function walletUnlinkSign(record: string, key: AddressKey): { address_sig: string } | { wallet_sig: string } {
    const r = parseRecord(record);
    if (!r || r.type !== 'wallet-unlink') throw new Error('not a canonical wallet unlink');
    const sig = signMessage(key.address, record, key.addressKey);
    if (key.address === r.address) return { address_sig: sig };
    if (key.address === r.wallet) return { wallet_sig: sig };
    throw new Error('this key is neither of the link addresses');
}

export type WalletRecordFailure =
    | 'malformed'
    | 'not_canonical' // not a wallet link or unlink in canonical form
    | 'address_sig_missing'
    | 'address_sig_invalid'
    | 'wallet_sig_missing'
    | 'wallet_sig_invalid'
    | 'unsigned' // an unlink with neither signature
    | 'since_unverified'
    | 'since_not_on_chain'
    | 'bad_anchor';

/** Whose signatures on the copy verify, whatever else is wrong with it. */
export type WalletSigners = { address: boolean; wallet: boolean };

export type VerifiedWalletRecord =
    | { ok: true; id: string; record: WalletRecord; signed: WalletSigners }
    | { ok: false; reason: WalletRecordFailure; signed: WalletSigners };

const WALLET_KEYS = new Set(['record', 'address_sig', 'wallet_sig', 'ots']);

/**
 * Check one copy of a wallet link or unlink. Pure, offline and never throws.
 * `signed` says which of its addresses' signatures verify, so a reader can
 * tell a broken copy of a real record from anyone's noise.
 */
export function verifyWalletRecord(
    env: unknown,
    blockHash: VerifyContext['blockHash'],
    anchoredAt?: number
): VerifiedWalletRecord {
    const none: WalletSigners = { address: false, wallet: false };
    if (!env || typeof env !== 'object' || Array.isArray(env)) return { ok: false, reason: 'malformed', signed: none };
    const e = env as Record<string, unknown>;
    for (const k of Object.keys(e)) if (!WALLET_KEYS.has(k)) return { ok: false, reason: 'malformed', signed: none };
    if (typeof e.record !== 'string') return { ok: false, reason: 'malformed', signed: none };
    for (const k of ['address_sig', 'wallet_sig', 'ots']) {
        if (k in e && typeof e[k] !== 'string') return { ok: false, reason: 'malformed', signed: none };
    }
    const record = parseRecord(e.record);
    if (!isWalletRecord(record)) return { ok: false, reason: 'not_canonical', signed: none };
    const text = e.record;
    const signed: WalletSigners = {
        address: typeof e.address_sig === 'string' && verifySignature(record.address, text, e.address_sig),
        wallet: typeof e.wallet_sig === 'string' && verifySignature(record.wallet, text, e.wallet_sig),
    };
    const fail = (reason: WalletRecordFailure): VerifiedWalletRecord => ({ ok: false, reason, signed });
    if (record.type === 'wallet-link') {
        if (!('address_sig' in e)) return fail('address_sig_missing');
        if (!signed.address) return fail('address_sig_invalid');
        if (!('wallet_sig' in e)) return fail('wallet_sig_missing');
        if (!signed.wallet) return fail('wallet_sig_invalid');
    } else {
        if (!('address_sig' in e) && !('wallet_sig' in e)) return fail('unsigned');
        if ('address_sig' in e && !signed.address) return fail('address_sig_invalid');
        if ('wallet_sig' in e && !signed.wallet) return fail('wallet_sig_invalid');
    }
    if (anchoredAt !== undefined && (!isHeight(anchoredAt) || anchoredAt <= record.since.height)) return fail('bad_anchor');
    const chain = chainHas(blockHash, record.since);
    if (chain === 'unknown') return fail('since_unverified');
    if (chain === 'no') return fail('since_not_on_chain');
    return { ok: true, id: recordId(text), record, signed };
}

export type WalletLinkFailure =
    | 'unavailable' // the read under the wallet was not complete
    | 'record_unverified' // a link or unlink its own keys signed, of which no copy verifies here
    | 'bad_anchor'
    | 'unlink_without_link' // the wallet ended a link the read does not hold
    | 'bad_height'; // `at` is not a block height

export type WalletLinkState =
    | { status: 'none' } // the wallet backs no identity
    | {
          status: 'linked';
          didOc: string;
          address: string;
          wallet: string;
          binding: string;
          /** The link in force: its anchor is when it began to count. */
          link: Step & { anchoredAt: number };
      }
    | { status: 'refused'; reason: WalletLinkFailure };

type Link = { id: string; r: Extract<WalletRecord, { type: 'wallet-link' }>; anchoredAt?: number };
type Unlink = { r: Extract<WalletRecord, { type: 'wallet-unlink' }>; anchoredAt?: number; signed: WalletSigners };

/**
 * Which identity a wallet's coins count for, from every record copy the
 * verifier read under the wallet's `t` tag. Links count from their anchors,
 * in anchor order, one identity at a time: a link anchored while another is
 * in force never counts, nor do two anchored in one block. An unlink ends its
 * link at the unlink's anchor; now, any unlink ends it. `at` asks about the
 * block at that height instead of now. The read must be complete, since a
 * missed link or unlink could only make a later link count wrongly.
 */
export function resolveWalletLink(
    wallet: string,
    lookup: RecordLookup,
    ctx: Pick<VerifyContext, 'blockHash'>,
    at?: number
): WalletLinkState {
    const refuse = (reason: WalletLinkFailure): WalletLinkState => ({ status: 'refused', reason });
    if (at !== undefined && !isHeight(at)) return refuse('bad_height');
    if (!lookup.complete) return refuse('unavailable');
    const links = new Map<string, Link>();
    const unlinks = new Map<string, Unlink>();
    const broken: { id: string; r: WalletRecord; signed: WalletSigners; reason: WalletRecordFailure }[] = [];
    for (const { envelope, anchoredAt } of lookup.records) {
        const v = verifyWalletRecord(envelope, ctx.blockHash, anchoredAt);
        if (!v.ok) {
            if (!v.signed.address && !v.signed.wallet) continue;
            const text = (envelope as SignedWalletRecord).record;
            const r = parseRecord(text) as WalletRecord;
            if (r.wallet === wallet) broken.push({ id: recordId(text), r, signed: v.signed, reason: v.reason });
            continue;
        }
        if (v.record.wallet !== wallet) continue;
        if (v.record.type === 'wallet-link') {
            links.set(v.id, { id: v.id, r: v.record, anchoredAt: earliest(links.get(v.id)?.anchoredAt, anchoredAt) });
        } else {
            // Copies of one unlink may be signed by different keys: it is signed by every key that signed one.
            const seen = unlinks.get(v.id);
            const signed = { address: !!seen?.signed.address || v.signed.address, wallet: !!seen?.signed.wallet || v.signed.wallet };
            unlinks.set(v.id, { r: v.record, anchoredAt: earliest(seen?.anchoredAt, anchoredAt), signed });
        }
    }
    // An unlink speaks for a link only when it is the wallet's own or by that link's identity, with the link's fields.
    const ends = (u: Unlink) => {
        const l = links.get(u.r.link);
        return l && l.r.didOc === u.r.didOc && l.r.address === u.r.address ? l : undefined;
    };
    const real = (r: WalletRecord, signed: WalletSigners) =>
        r.type === 'wallet-link'
            ? signed.address && signed.wallet
            : signed.wallet || (signed.address && ends({ r, signed, anchoredAt: undefined }) !== undefined);
    for (const b of broken) {
        if (links.has(b.id) || unlinks.has(b.id) || !real(b.r, b.signed)) continue;
        return refuse(b.reason === 'bad_anchor' ? 'bad_anchor' : 'record_unverified');
    }
    const endsOf = new Map<string, Unlink[]>();
    for (const u of unlinks.values()) {
        const l = ends(u);
        if (!l) {
            if (u.signed.wallet) return refuse('unlink_without_link');
            continue;
        }
        endsOf.set(l.id, [...(endsOf.get(l.id) ?? []), u]);
    }
    const endedBy = (l: Link, h: number) => (endsOf.get(l.id) ?? []).some((u) => u.anchoredAt !== undefined && u.anchoredAt <= h);

    const counted = [...links.values()]
        .filter((l): l is Link & { anchoredAt: number } => l.anchoredAt !== undefined && (at === undefined || l.anchoredAt <= at))
        .sort((x, y) => x.anchoredAt - y.anchoredAt);
    let current: (Link & { anchoredAt: number }) | undefined;
    for (let i = 0; i < counted.length; ) {
        const h = counted[i]!.anchoredAt;
        const block = counted.filter((l) => l.anchoredAt === h);
        i += block.length;
        if (current && endedBy(current, h)) current = undefined;
        if (current) continue;
        const starting = block.filter((l) => !endedBy(l, h));
        if (starting.length === 1) current = starting[0];
    }
    if (!current) return { status: 'none' };
    const over = at === undefined ? (endsOf.get(current.id) ?? []).length > 0 : endedBy(current, at);
    if (over) return { status: 'none' };
    const { r } = current;
    return {
        status: 'linked',
        didOc: r.didOc,
        address: r.address,
        wallet: r.wallet,
        binding: r.binding,
        link: { id: current.id, since: r.since, anchoredAt: current.anchoredAt },
    };
}

export type WalletLinkVerdict =
    | { accept: true; reason: 'linked' }
    | {
          accept: false;
          reason:
              | 'unresolved' // a lookup that could not be read or checked
              | 'not_linked'
              | 'linked_elsewhere' // the wallet's coins count for another identity
              | 'link_mismatch' // the link names another did:oc or binding than the identity's records
              | 'before_takeover'
              | 'orangecheck_held'
              | 'retired'
              | 'bad_evidence'
              | 'wallet_key_refused'; // the wallet is an address whose key-holder records refuse its signature
      };

/**
 * Whether a wallet's coins count for an identity address: the wallet's link
 * is to that address, and both of the link's signatures pass the key-holder
 * rule at the link's own anchor. A custodial identity never links, since the
 * key orangecheck holds signs nothing; nor does a did:oc alone.
 */
export function judgeWalletLink(args: {
    address: string;
    identity: KeyHolderState;
    link: WalletLinkState;
    wallet: KeyHolderState;
}): WalletLinkVerdict {
    const { address, identity, link, wallet } = args;
    const no = (reason: Exclude<WalletLinkVerdict['reason'], 'linked'>): WalletLinkVerdict => ({ accept: false, reason });
    if (link.status === 'refused' || identity.status === 'refused' || wallet.status === 'refused') return no('unresolved');
    if (link.status === 'none') return no('not_linked');
    if (link.address !== address) return no('linked_elsewhere');
    // The link names a binding for this address: a complete read that holds none is not plain Bitcoin.
    if (identity.status === 'unbound') return no('unresolved');
    if (identity.address !== address || identity.didOc !== link.didOc || identity.binding.id !== link.binding) {
        return no('link_mismatch');
    }
    if (identity.takeover && link.link.since.height < identity.takeover.since.height) return no('before_takeover');
    const evidence = { anchoredAt: link.link.anchoredAt, madeAfter: link.link.since.height };
    const byIdentity = judgeSignature(identity, evidence);
    if (!byIdentity.accept) return no(byIdentity.reason === 'unresolved' ? 'unresolved' : byIdentity.reason);
    if (!judgeSignature(wallet, evidence).accept) return no('wallet_key_refused');
    return { accept: true, reason: 'linked' };
}
