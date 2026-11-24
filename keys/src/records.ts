// The public key-holder records (README §4) and the rule every verifier applies
// to a signature by an address they bind (README §5).
//
// A record is LF-separated text with one trailing LF, fields in a fixed order.
// Its id is the SHA-256 of that text; the signatures travel beside the text,
// so the id is the same one the envelope gets with its signatures emptied.
//
// - binding, key_holder orangecheck: signed by the issuer alone. The key
//   orangecheck holds signs nothing, so an identity or Nostr signature on it is refused.
// - binding, key_holder user (a passkey-first account): the issuer, the
//   identity address (BIP-322) and the Nostr key (BIP-340 over the id).
// - takeover: the same three. The user holds the key from then on, and the
//   record keeps that orangecheck held it until the takeover was anchored.
// - retire: the issuer alone, for a binding never taken over.
// - issuer: a new issuer address, signed by the old one and the new one.
import { isDidOc } from '@orangecheck/auth-core/identifiers';
import { decodeAddress, signMessage, verifySignature } from '@orangecheck/bip322';
import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha2';

import { fromHex, toHex, utf8 } from './bytes';
import type { IdentityKeys } from './derive';

export { isDidOc };

/** Who holds an address's identity key. Not the funds' custody (FEDERATION-CUSTODY.md's `custody`). */
export type KeyHolder = 'orangecheck' | 'user';
export type RecordType = 'binding' | 'takeover' | 'retire' | 'issuer';

export const RETIRE_REASONS = ['wallet_linked', 'merged', 'deleted', 'withdrawn'] as const;
export type RetireReason = (typeof RETIRE_REASONS)[number];

/** A custodial binding's fixed trust line (family rule 8). */
export const CUSTODIAL_TRUST =
    "orangecheck made this key and holds it. It signs nothing with it, so no signature by it before a takeover is the user's.";

/** The takeover's fixed trust line: orangecheck's time as key holder stays on the record. */
export const TAKEOVER_TRUST =
    'orangecheck held this key until this record was anchored and says it deleted its copy. That cannot be proven.';

/** The Nostr d-tag prefix every record is published under (kind 30078). */
export const D_TAG_PREFIX = 'oc-attest-key:';

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

export type ParsedRecord =
    | ({ type: 'binding' } & BindingFields)
    | ({ type: 'takeover' } & TakeoverFields)
    | ({ type: 'retire' } & RetireFields)
    | ({ type: 'issuer' } & IssuerFields);

export type AddressRecord = Exclude<ParsedRecord, { type: 'issuer' }>;

const HEADER: Record<RecordType, string> = {
    binding: 'oc-attest-key:binding:v1',
    takeover: 'oc-attest-key:takeover:v1',
    retire: 'oc-attest-key:retire:v1',
    issuer: 'oc-attest-key:issuer:v1',
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

export function recordText(r: ParsedRecord): string {
    if (r.type === 'binding') return bindingRecord(r);
    if (r.type === 'takeover') return takeoverRecord(r);
    if (r.type === 'retire') return retireRecord(r);
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
    // The fixed literals (key_holder: user, each trust line) and the field order are checked here.
    return recordText(parsed) === record ? parsed : null;
}

/** An address record as it travels: its text and the signatures beside it. */
export interface SignedRecord {
    record: string;
    /** BIP-322 simple, base64, by the record's issuer address. */
    issuer_sig: string;
    /** BIP-322 simple, base64, by the record's identity address. User bindings and takeovers only. */
    address_sig?: string;
    /** BIP-340, 128 hex, by the record's Nostr key over the 32-byte id. User bindings and takeovers only. */
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

/** Whether the identity key signs this record. The key orangecheck holds signs nothing. */
export function identitySigns(r: ParsedRecord): boolean {
    return r.type === 'takeover' || (r.type === 'binding' && r.keyHolder === 'user');
}

/** The issuer's signature over an address record (BIP-322 simple by its P2WPKH address). */
export function issuerSign(record: string, issuerKey: Uint8Array): string {
    const r = parseRecord(record);
    if (!r || r.type === 'issuer') throw new Error('not a canonical address record');
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

/** The identity's two signatures over a user binding or a takeover. `auxRand` only for vectors. */
export function identitySign(
    record: string,
    keys: Pick<IdentityKeys, 'address' | 'addressKey' | 'nostrKey'>,
    auxRand?: Uint8Array
): { address_sig: string; nostr_sig: string } {
    const r = parseRecord(record);
    if (!r) throw new Error('not a canonical record');
    if (!identitySigns(r)) throw new Error('the key orangecheck holds signs nothing');
    if (r.type === 'issuer' || r.address !== keys.address) throw new Error('these keys are not the record address');
    return {
        address_sig: signMessage(r.address, record, keys.addressKey),
        nostr_sig: toHex(schnorr.sign(sha256(utf8(record)), keys.nostrKey, auxRand)),
    };
}

/** The Nostr tags a record is published with (kind 30078), so attest's address query finds it (SPEC §6.2). */
export function publicationTags(record: string): string[][] {
    const r = parseRecord(record);
    if (!r) throw new Error('not a canonical record');
    const id = recordId(record);
    if (r.type === 'issuer') {
        return [['d', `${D_TAG_PREFIX}issuer:${id}`], ['t', 'oc-attest-key-issuer']];
    }
    return [['d', `${D_TAG_PREFIX}${r.address}:${id}`], ['t', r.address], ['t', 'oc-attest-key']];
}

const isHeight = (h: unknown): h is number => typeof h === 'number' && Number.isInteger(h) && h >= 0;

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
    | 'bad_anchor';

const ROTATION_KEYS = new Set(['record', 'old_sig', 'new_sig', 'ots']);

/**
 * The issuer terms, from the address the spec names and every issuer record
 * the verifier holds. Records signed by both sides are followed back to the
 * issuers before it and on to any after it; any other record is ignored,
 * since anyone can publish one.
 */
export function resolveIssuers(
    named: string,
    records: readonly Anchored[],
    blockHash: (height: number) => string | undefined
): { ok: true; terms: IssuerTerm[] } | { ok: false; reason: IssuerFailure } {
    const valid = new Map<string, { r: ParsedRecord & { type: 'issuer' }; anchoredAt?: number }>();
    for (const { envelope, anchoredAt } of records) {
        if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope)) continue;
        const e = envelope as Record<string, unknown>;
        if (Object.keys(e).some((k) => !ROTATION_KEYS.has(k))) continue;
        if (typeof e.record !== 'string' || typeof e.old_sig !== 'string' || typeof e.new_sig !== 'string') continue;
        const r = parseRecord(e.record);
        if (!r || r.type !== 'issuer') continue;
        if (!verifySignature(r.old, e.record, e.old_sig) || !verifySignature(r.new, e.record, e.new_sig)) continue;
        if (chainHas(blockHash, r.since) !== 'yes') return { ok: false, reason: 'issuer_record_unverified' };
        if (anchoredAt !== undefined && (!isHeight(anchoredAt) || anchoredAt <= r.since.height)) {
            return { ok: false, reason: 'bad_anchor' };
        }
        const id = recordId(e.record);
        const seen = valid.get(id);
        valid.set(id, { r, anchoredAt: seen?.anchoredAt ?? anchoredAt });
    }
    const all = [...valid.values()];
    const terms: IssuerTerm[] = [{ address: named, from: 0 }];
    const seen = new Set([named]);
    // Back to the issuers before the named one.
    for (let first = terms[0]!; ; first = terms[0]!) {
        const into = all.filter((x) => x.r.new === first.address);
        if (into.length === 0) break;
        if (into.length > 1) return { ok: false, reason: 'conflicting_issuer_records' };
        const { r, anchoredAt } = into[0]!;
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
        const { r, anchoredAt } = out[0]!;
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

/** The terms of the one issuer address the spec names, with no issuer record. */
export function namedIssuer(address: string): IssuerTerm[] {
    return [{ address, from: 0 }];
}

export interface VerifyContext {
    /** The issuer terms (resolveIssuers, or namedIssuer for an issuer never rotated). */
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
    | 'custodial_key_signed' // a custodial binding or a retire carries an identity or Nostr signature
    | 'address_sig_missing'
    | 'address_sig_invalid' // not a signature by the record's identity address
    | 'nostr_sig_invalid'
    | 'since_unverified' // the verifier's chain has no block at that height
    | 'since_not_on_chain' // the block named is not the chain's block at that height
    | 'bad_anchor'; // an anchor that is not a height above the since block

export type VerifiedRecord =
    | { ok: true; id: string; record: AddressRecord }
    | { ok: false; reason: RecordFailure; issuerSigned: boolean };

const ENVELOPE_KEYS = new Set(['record', 'issuer_sig', 'address_sig', 'nostr_sig', 'ots']);

/**
 * Check one copy of an address record. Pure, offline and never throws; the
 * caller supplies the chain, the issuer terms and the anchor it verified.
 * `issuerSigned` says whether a trusted issuer signed this text, so a reader
 * can tell a broken copy of a real record from anyone's noise.
 */
export function verifyRecord(env: unknown, ctx: VerifyContext, anchoredAt?: number): VerifiedRecord {
    const fail = (reason: RecordFailure, issuerSigned = false): VerifiedRecord => ({ ok: false, reason, issuerSigned });
    if (!env || typeof env !== 'object' || Array.isArray(env)) return fail('malformed');
    const e = env as Record<string, unknown>;
    for (const k of Object.keys(e)) if (!ENVELOPE_KEYS.has(k)) return fail('malformed');
    if (typeof e.record !== 'string' || typeof e.issuer_sig !== 'string') return fail('malformed');
    for (const k of ['address_sig', 'nostr_sig', 'ots']) {
        if (k in e && typeof e[k] !== 'string') return fail('malformed');
    }
    const record = parseRecord(e.record);
    if (!record || record.type === 'issuer') return fail('not_canonical');
    const text = e.record;
    const id = recordId(text);
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
        if (!verifySignature(record.address, text, e.address_sig)) return fail('address_sig_invalid', true);
        const sig = typeof e.nostr_sig === 'string' && /^[0-9a-f]{128}$/.test(e.nostr_sig) ? fromHex(e.nostr_sig) : null;
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
    return { ok: true, id, record };
}

/**
 * What a verifier read for one address: every record copy relays served
 * under its `t` tag, and whether the read was complete, which a verifier may
 * say only at the read floor (README §4).
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
    | 'unavailable' // no valid binding found, and the read was not complete
    | 'record_unverified' // a record the issuer signed, of which no copy verifies here
    | 'named_binding_missing'
    | 'conflicting_bindings'
    | 'takeover_without_binding'
    | 'conflicting_takeovers'
    | 'takeover_of_user_binding' // the binding never had orangecheck as key holder
    | 'takeover_mismatch' // its did:oc or Nostr key differ from the binding's
    | 'takeover_before_binding'
    | 'takeover_after_retire' // the retire is anchored before the takeover was made
    | 'retire_without_binding'
    | 'conflicting_retires'
    | 'retire_of_user_binding'
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
 * read for it. Copies that no trusted issuer signed are ignored, since anyone
 * can publish one. A record the issuer signed counts once any copy of it
 * verifies; if none does, the address is refused, not read as unbound.
 * Holding no takeover is not proof there is none, so `holder: 'orangecheck'`
 * means "as far as these records show", which only ever refuses more.
 */
export function resolveKeyHolder(address: string, lookup: RecordLookup, ctx: ResolveContext): KeyHolderState {
    const refuse = (reason: ResolveFailure | RecordFailure): KeyHolderState => ({ status: 'refused', reason });
    const valid = new Map<string, { record: AddressRecord; anchoredAt?: number }>();
    const broken = new Map<string, RecordFailure>();
    for (const { envelope, anchoredAt } of lookup.records) {
        const v = verifyRecord(envelope, ctx, anchoredAt);
        if (v.ok) {
            if (v.record.address !== address) continue;
            const seen = valid.get(v.id);
            valid.set(v.id, { record: v.record, anchoredAt: seen?.anchoredAt ?? anchoredAt });
            continue;
        }
        if (!v.issuerSigned) continue;
        const r = parseRecord((envelope as SignedRecord).record) as AddressRecord;
        if (r.address !== address) continue;
        broken.set(recordId((envelope as SignedRecord).record), v.reason);
    }
    for (const [id, reason] of broken) {
        if (!valid.has(id)) return refuse(reason === 'bad_anchor' ? reason : 'record_unverified');
    }

    type Of<T extends AddressRecord['type']> = [string, Extract<AddressRecord, { type: T }>, number | undefined];
    const all = [...valid.entries()].map(([id, v]) => [id, v.record, v.anchoredAt] as const);
    const bindings = all.filter(([, r]) => r.type === 'binding') as Of<'binding'>[];
    const takeovers = all.filter(([, r]) => r.type === 'takeover') as Of<'takeover'>[];
    const retires = all.filter(([, r]) => r.type === 'retire') as Of<'retire'>[];

    if (bindings.length > 1) return refuse('conflicting_bindings');
    if (bindings.length === 0) {
        if (takeovers.length) return refuse('takeover_without_binding');
        if (retires.length) return refuse('retire_without_binding');
        if (ctx.namedBinding !== undefined) return refuse('named_binding_missing');
        return lookup.complete ? { status: 'unbound' } : refuse('unavailable');
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
    if (retires.some(([, r]) => r.binding !== bindingId)) return refuse('retire_without_binding');
    if (takeovers.length > 1) return refuse('conflicting_takeovers');
    if (retires.length > 1) return refuse('conflicting_retires');
    const takeover = takeovers[0];
    const retire = retires[0];

    if (takeover) {
        const [, t] = takeover;
        if (binding.keyHolder !== 'orangecheck') return refuse('takeover_of_user_binding');
        if (t.didOc !== binding.didOc || t.nostr !== binding.nostr) return refuse('takeover_mismatch');
        if (t.since.height < binding.since.height) return refuse('takeover_before_binding');
    }
    if (retire) {
        const [, r] = retire;
        if (binding.keyHolder !== 'orangecheck') return refuse('retire_of_user_binding');
        if (r.didOc !== binding.didOc) return refuse('retire_mismatch');
        if (r.since.height < binding.since.height) return refuse('retire_before_binding');
    }
    // A retire counts against a takeover only where its anchor shows it was there before the takeover was made.
    if (takeover && retire && retire[2] !== undefined && retire[2] <= takeover[1].since.height) {
        return refuse('takeover_after_retire');
    }
    if (takeover) {
        const [id, t, anchoredAt] = takeover;
        state.holder = 'user';
        state.takeover = { id, since: t.since, anchoredAt };
    } else if (retire) {
        const [id, r, anchoredAt] = retire;
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
