// The public custody records (README §4) and the rule every verifier applies to
// a signature from a bound address (README §5).
//
// A record is LF-separated text with one trailing LF, fields in a fixed order.
// Its id is the SHA-256 of that text; the signatures travel beside the text,
// so the id is the same one the envelope gets with its signatures emptied.
//
// - binding (custody orangecheck): signed by the issuer only. A custodial key
//   signs nothing, so an identity or Nostr signature on it is refused.
// - binding (custody self, a passkey-first account): the issuer, the identity
//   address (BIP-322) and the Nostr key (BIP-340 over the id).
// - takeover: the same three. It flips a custodial binding to self.
// - retire: the issuer only, and only for a binding never taken over.
import { isDidOc } from '@orangecheck/auth-core/identifiers';
import { decodeAddress, signMessage, verifySignature } from '@orangecheck/bip322';
import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha2';

import { fromHex, toHex, utf8 } from './bytes';
import type { IdentityKeys } from './derive';

export { isDidOc };

export type Custody = 'orangecheck' | 'self';
export type RecordType = 'binding' | 'takeover' | 'retire';

export const RETIRE_REASONS = ['wallet_linked', 'merged', 'deleted', 'withdrawn'] as const;
export type RetireReason = (typeof RETIRE_REASONS)[number];

/** The takeover's fixed trust line: the trust it rests on, named in the record (family rule 8). */
export const TAKEOVER_TRUST =
    'orangecheck held this key until this record and says it deleted its copy. That cannot be proven.';

/** A block the record was made after: its height and its hash in the usual (RPC) byte order. */
export interface Since {
    height: number;
    block: string;
}

export interface BindingFields {
    didOc: string;
    address: string;
    nostr: string;
    custody: Custody;
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

export type ParsedRecord =
    | ({ type: 'binding' } & BindingFields)
    | ({ type: 'takeover' } & TakeoverFields)
    | ({ type: 'retire' } & RetireFields);

const HEADER: Record<RecordType, string> = {
    binding: 'oc-keys:binding:v1',
    takeover: 'oc-keys:takeover:v1',
    retire: 'oc-keys:retire:v1',
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
        `custody: ${f.custody}`,
        `issuer: ${f.issuer}`,
        ...sinceLines(f.since),
    ]);
}

export function takeoverRecord(f: TakeoverFields): string {
    return text([
        HEADER.takeover,
        `did_oc: ${f.didOc}`,
        `address: ${f.address}`,
        `nostr: ${f.nostr}`,
        `binding: ${f.binding}`,
        'custody: self',
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

export function recordText(r: ParsedRecord): string {
    if (r.type === 'binding') return bindingRecord(r);
    if (r.type === 'takeover') return takeoverRecord(r);
    return retireRecord(r);
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
    const didOc = get('did_oc');
    const address = get('address');
    const issuer = get('issuer');
    if (!isDidOc(didOc) || !isMainnetP2wpkh(address) || !isMainnetP2wpkh(issuer)) return null;

    let parsed: ParsedRecord;
    if (type === 'binding') {
        const custody = get('custody');
        if (custody !== 'orangecheck' && custody !== 'self') return null;
        parsed = { type, didOc, address, nostr: get('nostr'), custody, issuer, since };
    } else if (type === 'takeover') {
        parsed = { type, didOc, address, nostr: get('nostr'), binding: get('binding'), issuer, since };
    } else {
        const reason = get('reason') as RetireReason;
        if (!RETIRE_REASONS.includes(reason)) return null;
        parsed = { type, didOc, address, binding: get('binding'), issuer, since, reason };
    }
    if ('nostr' in parsed && !HEX64.test(parsed.nostr)) return null;
    if ('binding' in parsed && !HEX64.test(parsed.binding)) return null;
    // The fixed literals (custody: self, the trust line) and the field order are checked here.
    return recordText(parsed) === record ? parsed : null;
}

/** A record as it travels: its text and the signatures beside it. */
export interface SignedRecord {
    record: string;
    /** BIP-322 simple, base64, by the record's issuer address. */
    issuer_sig: string;
    /** BIP-322 simple, base64, by the record's identity address. Self bindings and takeovers only. */
    address_sig?: string;
    /** BIP-340, 128 hex, by the record's Nostr key over the 32-byte id. Self bindings and takeovers only. */
    nostr_sig?: string;
}

/** Whether the identity key signs this record. A custodial key signs nothing. */
export function identitySigns(r: ParsedRecord): boolean {
    return r.type === 'takeover' || (r.type === 'binding' && r.custody === 'self');
}

/** The issuer's signature over a record (BIP-322 simple by its P2WPKH address). */
export function issuerSign(record: string, issuerKey: Uint8Array): string {
    const r = parseRecord(record);
    if (!r) throw new Error('not a canonical record');
    return signMessage(r.issuer, record, issuerKey);
}

/** The identity's two signatures over a self binding or a takeover. `auxRand` only for vectors. */
export function identitySign(
    record: string,
    keys: Pick<IdentityKeys, 'address' | 'addressKey' | 'nostrKey'>,
    auxRand?: Uint8Array
): { address_sig: string; nostr_sig: string } {
    const r = parseRecord(record);
    if (!r) throw new Error('not a canonical record');
    if (!identitySigns(r)) throw new Error('a custodial key signs nothing');
    if (r.address !== keys.address) throw new Error('these keys are not the record address');
    return {
        address_sig: signMessage(r.address, record, keys.addressKey),
        nostr_sig: toHex(schnorr.sign(sha256(utf8(record)), keys.nostrKey, auxRand)),
    };
}

export interface VerifyContext {
    /** The issuer addresses this verifier trusts. The spec names orangecheck's. */
    issuers: readonly string[];
    /** The hash of the block at `height` on the verifier's own header chain, or undefined. */
    blockHash: (height: number) => string | undefined;
}

export type RecordFailure =
    | 'malformed' // not an object with a record and string signatures, or an unknown key
    | 'not_canonical' // the text is not a record in canonical form
    | 'issuer_unknown' // the issuer is not one the verifier trusts
    | 'issuer_sig_invalid'
    | 'custodial_key_signed' // a custodial binding or a retire carries an identity or Nostr signature
    | 'address_sig_missing'
    | 'address_sig_invalid' // not a signature by the record's identity address
    | 'nostr_sig_invalid'
    | 'since_unverified' // the verifier's chain has no block at that height
    | 'since_not_on_chain'; // the block named is not the chain's block at that height

export type VerifiedRecord = { ok: true; id: string; record: ParsedRecord } | { ok: false; reason: RecordFailure };

const ENVELOPE_KEYS = new Set(['record', 'issuer_sig', 'address_sig', 'nostr_sig']);

/** Check one signed record. Pure, offline and never throws; the caller supplies the chain and the issuers. */
export function verifyRecord(env: unknown, ctx: VerifyContext): VerifiedRecord {
    if (!env || typeof env !== 'object' || Array.isArray(env)) return { ok: false, reason: 'malformed' };
    const e = env as Record<string, unknown>;
    for (const k of Object.keys(e)) if (!ENVELOPE_KEYS.has(k)) return { ok: false, reason: 'malformed' };
    if (typeof e.record !== 'string' || typeof e.issuer_sig !== 'string') return { ok: false, reason: 'malformed' };
    for (const k of ['address_sig', 'nostr_sig']) {
        if (k in e && typeof e[k] !== 'string') return { ok: false, reason: 'malformed' };
    }
    const record = parseRecord(e.record);
    if (!record) return { ok: false, reason: 'not_canonical' };
    const text = e.record;
    const id = recordId(text);
    if (!ctx.issuers.includes(record.issuer)) return { ok: false, reason: 'issuer_unknown' };
    if (!verifySignature(record.issuer, text, e.issuer_sig)) return { ok: false, reason: 'issuer_sig_invalid' };
    if (identitySigns(record)) {
        if (typeof e.address_sig !== 'string') return { ok: false, reason: 'address_sig_missing' };
        if (!verifySignature(record.address, text, e.address_sig)) return { ok: false, reason: 'address_sig_invalid' };
        const sig = typeof e.nostr_sig === 'string' && /^[0-9a-f]{128}$/.test(e.nostr_sig) ? fromHex(e.nostr_sig) : null;
        const nostr = 'nostr' in record ? fromHex(record.nostr) : null;
        let good = false;
        try {
            good = !!sig && !!nostr && schnorr.verify(sig, fromHex(id)!, nostr);
        } catch {
            good = false;
        }
        if (!good) return { ok: false, reason: 'nostr_sig_invalid' };
    } else if ('address_sig' in e || 'nostr_sig' in e) {
        return { ok: false, reason: 'custodial_key_signed' };
    }
    let onChain: string | undefined;
    try {
        onChain = ctx.blockHash(record.since.height);
    } catch {
        onChain = undefined;
    }
    if (typeof onChain !== 'string') return { ok: false, reason: 'since_unverified' };
    if (onChain !== record.since.block) return { ok: false, reason: 'since_not_on_chain' };
    return { ok: true, id, record };
}

export type CustodyFailure =
    | RecordFailure
    | 'no_binding'
    | 'address_mismatch' // a record names another address
    | 'conflicting_bindings' // two different bindings for one address
    | 'custody_flip_without_takeover' // a self binding beside a custodial one, with no takeover between
    | 'conflicting_takeovers'
    | 'takeover_wrong_binding' // it names another binding's id
    | 'takeover_of_self_binding' // the binding was never custodial
    | 'takeover_mismatch' // its did:oc or Nostr key differ from the binding's
    | 'takeover_before_binding'
    | 'conflicting_retires'
    | 'retire_wrong_binding'
    | 'retire_of_self_binding'
    | 'retire_after_takeover' // a taken-over key is the user's; orangecheck cannot retire it
    | 'retire_mismatch'
    | 'retire_before_binding';

export interface CustodyState {
    ok: true;
    didOc: string;
    address: string;
    nostr: string;
    /** Who holds the key now, as far as these records show. */
    custody: Custody | 'retired';
    /** Who made the key: orangecheck (custodial first), or the user (passkey first). */
    born: Custody;
    binding: { id: string; since: Since };
    takeover?: { id: string; since: Since };
    retire?: { id: string; since: Since; reason: RetireReason };
}

/**
 * The custody of one address from every record the verifier holds for it.
 * Strict: one bad or conflicting record refuses the whole set. Holding no
 * takeover is not proof there is none, so a state of `orangecheck` means
 * "custodial as far as these records show".
 */
export function resolveCustody(
    address: string,
    envs: readonly unknown[],
    ctx: VerifyContext
): CustodyState | { ok: false; reason: CustodyFailure } {
    const byId = new Map<string, ParsedRecord>();
    for (const env of envs) {
        const v = verifyRecord(env, ctx);
        if (!v.ok) return { ok: false, reason: v.reason };
        if (v.record.address !== address) return { ok: false, reason: 'address_mismatch' };
        byId.set(v.id, v.record);
    }
    const all = [...byId.entries()];
    const bindings = all.filter(([, r]) => r.type === 'binding') as [string, ParsedRecord & { type: 'binding' }][];
    const takeovers = all.filter(([, r]) => r.type === 'takeover') as [string, ParsedRecord & { type: 'takeover' }][];
    const retires = all.filter(([, r]) => r.type === 'retire') as [string, ParsedRecord & { type: 'retire' }][];

    if (bindings.length === 0) return { ok: false, reason: 'no_binding' };
    if (bindings.length > 1) {
        const kinds = new Set(bindings.map(([, b]) => b.custody));
        return { ok: false, reason: kinds.size > 1 ? 'custody_flip_without_takeover' : 'conflicting_bindings' };
    }
    const [bindingId, binding] = bindings[0]!;
    const state: CustodyState = {
        ok: true,
        didOc: binding.didOc,
        address: binding.address,
        nostr: binding.nostr,
        custody: binding.custody,
        born: binding.custody,
        binding: { id: bindingId, since: binding.since },
    };

    if (takeovers.length > 1) return { ok: false, reason: 'conflicting_takeovers' };
    if (takeovers.length === 1) {
        const [id, t] = takeovers[0]!;
        if (t.binding !== bindingId) return { ok: false, reason: 'takeover_wrong_binding' };
        if (binding.custody !== 'orangecheck') return { ok: false, reason: 'takeover_of_self_binding' };
        if (t.didOc !== binding.didOc || t.nostr !== binding.nostr) return { ok: false, reason: 'takeover_mismatch' };
        if (t.since.height < binding.since.height) return { ok: false, reason: 'takeover_before_binding' };
        state.custody = 'self';
        state.takeover = { id, since: t.since };
    }

    if (retires.length > 1) return { ok: false, reason: 'conflicting_retires' };
    if (retires.length === 1) {
        const [id, r] = retires[0]!;
        if (r.binding !== bindingId) return { ok: false, reason: 'retire_wrong_binding' };
        if (binding.custody !== 'orangecheck') return { ok: false, reason: 'retire_of_self_binding' };
        if (state.takeover) return { ok: false, reason: 'retire_after_takeover' };
        if (r.didOc !== binding.didOc) return { ok: false, reason: 'retire_mismatch' };
        if (r.since.height < binding.since.height) return { ok: false, reason: 'retire_before_binding' };
        state.custody = 'retired';
        state.retire = { id, since: r.since, reason: r.reason };
    }
    return state;
}

/**
 * What a verifier knows about when a signed artifact was made, each height
 * already checked by the caller against its own header chain.
 */
export interface SignatureEvidence {
    /** The block that anchors the artifact (an OpenTimestamps proof or a transaction): it existed before this block. */
    anchoredAt?: number;
    /** A block whose hash the artifact commits to: it was made after this block. */
    madeAfter?: number;
    /** The block that anchors the takeover record itself: the takeover existed before this block. */
    takeoverAnchoredAt?: number;
}

export type SignatureVerdict =
    | { accept: true; reason: 'self_born' | 'after_takeover' | 'on_trust' }
    | { accept: false; reason: 'custodial' | 'retired' | 'before_takeover' | 'bad_evidence' };

const isHeight = (h: unknown): h is number => typeof h === 'number' && Number.isInteger(h) && h >= 0;

/**
 * The custody rule (README §5), for a signature that already verifies for the
 * address. A custodial key signs nothing, so every signature is refused while
 * the records say orangecheck holds the key, and after a takeover every one
 * anchored at or below the takeover's since block, which existed before the
 * takeover could be made. One that commits to a block at or above the
 * takeover's own anchor was made after it: `after_takeover`. Anything between
 * is `on_trust`: accepted on the trust the takeover names (orangecheck deleted
 * its copy and no copy leaked); a strict verifier refuses it.
 */
export function judgeSignature(state: CustodyState, evidence: SignatureEvidence = {}): SignatureVerdict {
    if (state.custody === 'retired') return { accept: false, reason: 'retired' };
    if (state.custody === 'orangecheck') return { accept: false, reason: 'custodial' };
    if (state.born === 'self') return { accept: true, reason: 'self_born' };
    const { anchoredAt, madeAfter, takeoverAnchoredAt } = evidence;
    const since = state.takeover!.since.height;
    for (const h of [anchoredAt, madeAfter, takeoverAnchoredAt]) {
        if (h !== undefined && !isHeight(h)) return { accept: false, reason: 'bad_evidence' };
    }
    // Each says something that cannot be: the takeover anchored before its own since block, or an artifact made after the block it was anchored in.
    if (takeoverAnchoredAt !== undefined && takeoverAnchoredAt <= since) return { accept: false, reason: 'bad_evidence' };
    if (anchoredAt !== undefined && madeAfter !== undefined && madeAfter >= anchoredAt) {
        return { accept: false, reason: 'bad_evidence' };
    }
    if (anchoredAt !== undefined && anchoredAt <= since) return { accept: false, reason: 'before_takeover' };
    if (madeAfter !== undefined && takeoverAnchoredAt !== undefined && madeAfter >= takeoverAnchoredAt) {
        return { accept: true, reason: 'after_takeover' };
    }
    return { accept: true, reason: 'on_trust' };
}
