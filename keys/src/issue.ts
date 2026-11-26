// One call per step of the key-holder lifecycle (README §4): the custodial
// binding and retire ochk.io issues (phase 1a), the takeover the key frame
// signs first and ochk.io countersigns (1b), and the read-back after publishing.
import type { IdentityKeys } from './derive';
import {
    bindingRecord,
    identitySign,
    issuerSign,
    parseRecord,
    possessionSign,
    publicationTags,
    recordId,
    resolveKeyHolder,
    retireRecord,
    takeoverRecord,
    verifyRecord,
    type AddressKey,
    type AddressRecord,
    type BoundState,
    type KeyHolder,
    type KeyHolderState,
    type RecordFailure,
    type RecordLookup,
    type RetireReason,
    type SignedRecord,
    type Since,
    type VerifyContext,
} from './records';

/** An unsigned kind-30078 event; the caller signs it with a fresh Nostr key, then drops the key (README §4, Publication). */
export interface NostrTemplate {
    kind: 30078;
    tags: string[][];
    content: string;
}

/** A record ready to stamp and publish: its id, its envelope and the event that carries it. */
export interface Issued {
    id: string;
    envelope: SignedRecord;
    event: NostrTemplate;
}

function issued(envelope: SignedRecord): Issued {
    return {
        id: recordId(envelope.record),
        envelope,
        event: { kind: 30078, tags: publicationTags(envelope.record), content: JSON.stringify(envelope) },
    };
}

/** A record goes out under a key dropped once it signs, so it can never be replaced: nothing that fails to verify is issued. */
function verified(envelope: SignedRecord, ctx: VerifyContext): Issued {
    const v = verifyRecord(envelope, ctx);
    if (!v.ok) throw new Error(`the finished record does not verify: ${v.reason}`);
    return issued(envelope);
}

function canonical<T extends AddressRecord['type']>(text: string, type: T): Extract<AddressRecord, { type: T }> {
    const r = parseRecord(text);
    if (!r || r.type !== type) throw new RangeError(`not a canonical ${type}: check every field`);
    return r as Extract<AddressRecord, { type: T }>;
}

/**
 * A custodial binding, at mint, before the key is sealed: the issuer's
 * signature and the key's own two (possessionSign), the one thing it ever
 * signs before a takeover. The address and Nostr key are the keys' own. It
 * throws unless the finished envelope verifies under `ctx`.
 */
export function issueCustodialBinding(a: {
    didOc: string;
    keys: Pick<IdentityKeys, 'address' | 'nostr' | 'addressKey' | 'nostrKey'>;
    issuer: AddressKey;
    since: Since;
    ctx: VerifyContext;
}): Issued {
    const record = bindingRecord({
        didOc: a.didOc,
        address: a.keys.address,
        nostr: a.keys.nostr,
        keyHolder: 'orangecheck',
        issuer: a.issuer.address,
        since: a.since,
    });
    canonical(record, 'binding');
    return verified({ record, issuer_sig: issuerSign(record, a.issuer.addressKey), ...possessionSign(record, a.keys) }, a.ctx);
}

/** Ends a custodial binding that was never taken over; `withdrawn` undoes a published one. Throws as issueCustodialBinding. */
export function issueRetire(a: {
    didOc: string;
    address: string;
    binding: string;
    reason: RetireReason;
    issuer: AddressKey;
    since: Since;
    ctx: VerifyContext;
}): Issued {
    const record = retireRecord({ ...a, issuer: a.issuer.address });
    canonical(record, 'retire');
    return verified({ record, issuer_sig: issuerSign(record, a.issuer.addressKey) }, a.ctx);
}

/** The takeover as the key frame sends it: the identity's two signatures, no issuer's yet. */
export interface TakeoverRequest {
    record: string;
    address_sig: string;
    nostr_sig: string;
}

/** In the key frame: the first thing the key signs, over the custodial binding it takes over. */
export function signTakeover(a: {
    binding: SignedRecord;
    keys: Pick<IdentityKeys, 'address' | 'nostr' | 'addressKey' | 'nostrKey'>;
    issuer: string;
    since: Since;
}): TakeoverRequest {
    const b = canonical(a.binding.record, 'binding');
    if (b.keyHolder !== 'orangecheck') throw new Error('only a custodial binding is taken over');
    if (a.keys.address !== b.address || a.keys.nostr !== b.nostr) throw new Error("these keys are not the binding's");
    if (a.since.height < b.since.height) throw new RangeError('the takeover cannot be made before its binding');
    const record = takeoverRecord({
        didOc: b.didOc,
        address: b.address,
        nostr: b.nostr,
        binding: recordId(a.binding.record),
        issuer: a.issuer,
        since: a.since,
    });
    canonical(record, 'takeover');
    return { record, ...identitySign(record, a.keys) };
}

export type TakeoverRefusal =
    | 'malformed' // not an object of exactly record, address_sig and nostr_sig, all strings
    | 'not_a_takeover' // the text is not a canonical takeover
    | 'not_custodial' // the binding it names is not one orangecheck holds
    | 'binding_mismatch' // it names another binding, or another did:oc, address or Nostr key
    | 'issuer_mismatch' // it names another issuer than the one countersigning
    | 'since_before_binding'
    | RecordFailure; // the finished envelope does not verify: the identity's signatures, its since block, the issuer's term

const REQUEST_KEYS = ['address_sig', 'nostr_sig', 'record'];

/**
 * On ochk.io, the gate before it deletes its copy of the key: the frame's
 * takeover must name this binding, and the envelope with the issuer's
 * signature added must verify, the identity's two signatures included.
 */
export function countersignTakeover(
    req: unknown,
    a: { binding: SignedRecord; issuer: AddressKey; ctx: VerifyContext }
): { ok: true; issued: Issued } | { ok: false; reason: TakeoverRefusal } {
    const no = (reason: TakeoverRefusal) => ({ ok: false as const, reason });
    if (!req || typeof req !== 'object' || Array.isArray(req)) return no('malformed');
    const q = req as Record<string, unknown>;
    if (Object.keys(q).sort().join() !== REQUEST_KEYS.join()) return no('malformed');
    if (REQUEST_KEYS.some((k) => typeof q[k] !== 'string')) return no('malformed');
    const text = q.record as string;
    const t = parseRecord(text);
    if (!t || t.type !== 'takeover') return no('not_a_takeover');
    const b = canonical(a.binding.record, 'binding');
    if (b.keyHolder !== 'orangecheck') return no('not_custodial');
    if (t.binding !== recordId(a.binding.record) || t.didOc !== b.didOc || t.address !== b.address || t.nostr !== b.nostr) {
        return no('binding_mismatch');
    }
    if (t.issuer !== a.issuer.address) return no('issuer_mismatch');
    if (t.since.height < b.since.height) return no('since_before_binding');
    // verifyRecord checks the identity's two signatures; the issuer's is discarded unless all of it holds.
    const envelope: SignedRecord = {
        record: text,
        issuer_sig: issuerSign(text, a.issuer.addressKey),
        address_sig: q.address_sig as string,
        nostr_sig: q.nostr_sig as string,
    };
    const v = verifyRecord(envelope, a.ctx);
    if (!v.ok) return no(v.reason);
    return { ok: true, issued: issued(envelope) };
}

export type ReadBackFailure =
    | 'unavailable' // the read was not complete: read again before deciding anything
    | 'not_seen' // a complete read, and no binding for the address
    | 'other_binding' // the address is bound by another binding
    | 'holder_differs' // bound by it, with another key holder now
    | 'refused'; // the records refuse the address (state.reason says why)

/** After publishing a batch: do the records the relays serve now say what was issued? */
export function readBack(a: {
    address: string;
    expect: { binding: string; holder: KeyHolder | 'retired' };
    lookup: RecordLookup;
    ctx: VerifyContext;
}): { ok: true; state: BoundState } | { ok: false; reason: ReadBackFailure; state: KeyHolderState } {
    const state = resolveKeyHolder(a.address, a.lookup, a.ctx);
    const no = (reason: ReadBackFailure) => ({ ok: false as const, reason, state });
    if (state.status === 'refused') return no(state.reason === 'unavailable' ? 'unavailable' : 'refused');
    if (state.status === 'unbound') return no('not_seen');
    if (state.binding.id !== a.expect.binding) return no('other_binding');
    if (state.holder !== a.expect.holder) return no('holder_differs');
    return { ok: true, state };
}
