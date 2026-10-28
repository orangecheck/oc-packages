// did:oc session devices (SPEC §8.6): the auth host's vouch that binds a device
// key to a did:oc, the host's signed revocations, and which keys stand.
//
// A session record has no BIP-322 signature, and its Nostr self-signature
// proves only that SOME key published it. What binds it to a did:oc is the
// auth host (ochk.io), the named trust anchor, signing the exact (did_oc,
// device_pk, nostr_pk, device_id) after the device proved it holds the Nostr
// key. This tier is not offline-verifiable and not Bitcoin-load-bearing.
// The caller supplies the host's published keys.

import { ed25519 } from '@noble/curves/ed25519';
import { utf8Encode } from '@orangecheck/lock-crypto';
import { DEVICE_KIND, type NostrEvent } from '@orangecheck/lock-device';

import { verifyNostrEvent } from './event';

export const AUTH_HOST_JWKS_URL = 'https://ochk.io/.well-known/jwks.json';
export const VOUCH_JWS_TYP = 'oc-chat-device-vouch';
export const REVOCATION_JWS_TYP = 'oc-chat-device-revoke';

/** The d-tag a did:oc's session device records are published under. */
export function sessionDeviceDtag(didOc: string): string {
    return `oc-chat:device:${didOc}`;
}

export interface VouchSubject {
    didOc: string;
    device_pk: string;
    nostr_pk: string;
    device_id: string;
}

export interface AuthHostKey {
    kid?: string;
    kty?: string;
    crv?: string;
    x?: string;
    /** A key rotated out: it verifies only what it signed before `retired_at`. */
    status?: string;
    retired_at?: number;
}

function fields(ns: string, s: VouchSubject): string[] {
    return [
        ns,
        `did_oc: ${s.didOc}`,
        `device_pk: ${s.device_pk}`,
        `nostr_pk: ${s.nostr_pk}`,
        `device_id: ${s.device_id}`,
    ];
}

/** The request the device's Nostr key signs (proof of possession). */
export function vouchRequestStatement(s: VouchSubject): string {
    return fields('oc-chat:device-vouch-request:v1', s).join('\n') + '\n';
}

function b64urlDecode(s: string): Uint8Array {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
    const pad = b64.length % 4 === 0 ? '' : '='.repeat(4 - (b64.length % 4));
    const bin = atob(b64 + pad);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
}

/**
 * The plain-text statement of a host JWS of type `typ`, signed by a published
 * key, or null. A retired key counts only for a statement whose signed time
 * (`timeField`) is before its `retired_at` (SPEC §8.6).
 */
function hostStatement(
    jws: string,
    typ: string,
    timeField: string,
    keys: readonly AuthHostKey[]
): string[] | null {
    try {
        const parts = jws.split('.');
        if (parts.length !== 3) return null;
        const [h, p, sig] = parts as [string, string, string];
        const header = JSON.parse(new TextDecoder().decode(b64urlDecode(h))) as Record<
            string,
            unknown
        >;
        if (header.alg !== 'EdDSA' || header.typ !== typ) return null;
        const key = keys.find(
            (k) => k.kty === 'OKP' && k.crv === 'Ed25519' && k.x && k.kid === header.kid
        );
        if (!key?.x) return null;
        if (!ed25519.verify(b64urlDecode(sig), utf8Encode(`${h}.${p}`), b64urlDecode(key.x))) {
            return null;
        }
        const lines = new TextDecoder().decode(b64urlDecode(p)).split('\n');
        const at = lines.find((l) => l.startsWith(`${timeField}: `));
        const t = at ? Number(at.slice(timeField.length + 2)) : NaN;
        if (!/^\d+$/.test(at?.slice(timeField.length + 2) ?? '')) return null;
        if (
            key.status === 'retired' &&
            !(typeof key.retired_at === 'number' && t < key.retired_at)
        ) {
            return null;
        }
        return lines;
    } catch {
        return null;
    }
}

/**
 * Does `vouch` — a compact JWS from the auth host — vouch for exactly this
 * subject? Checks the header, the Ed25519 signature against a published key
 * (a retired one only for a vouch issued before it retired), and every
 * statement field. Pure; the caller supplies the keys.
 */
export function verifySessionVouch(
    vouch: string,
    subject: VouchSubject,
    keys: readonly AuthHostKey[]
): boolean {
    const lines = hostStatement(vouch, VOUCH_JWS_TYP, 'issued_at', keys);
    if (!lines) return false;
    const expected = fields('oc-chat:device-vouch:v1', subject);
    // The statement is the expected fields, an issued_at line, and the final LF.
    if (lines.length !== expected.length + 2) return false;
    for (let i = 0; i < expected.length; i++) if (lines[i] !== expected[i]) return false;
    return /^issued_at: \d+$/.test(lines[expected.length]!) && lines.at(-1) === '';
}

/** Who a host-signed device revocation names (SPEC §8.6), or null if it does not verify. */
export function verifyHostRevocation(
    jws: string,
    keys: readonly AuthHostKey[]
): {
    didOc: string;
    device_id: string;
    nostr_pk: string;
    revoked_at: number;
    statement: string;
} | null {
    const lines = hostStatement(jws, REVOCATION_JWS_TYP, 'revoked_at', keys);
    if (!lines || lines[0] !== 'oc-chat:device-revoke:v1' || lines.at(-1) !== '') return null;
    // The signature covers every line. The named ones are read by name, once
    // each, and a line the host adds later is kept in the statement but not read.
    const field = (name: string) => {
        const found = lines.filter((l) => l.startsWith(`${name}: `));
        return found.length === 1 ? found[0]!.slice(name.length + 2) : null;
    };
    const didOc = field('did_oc');
    const device_id = field('device_id');
    const nostr_pk = field('nostr_pk');
    const at = field('revoked_at');
    const revoked_at = at === null ? NaN : Number(at);
    if (!didOc || !device_id || !nostr_pk || !Number.isFinite(revoked_at)) return null;
    return { didOc, device_id, nostr_pk, revoked_at, statement: lines.join('\n') };
}

/** The signed issued_at of a vouch, read without verifying it (callers verify first). */
export function vouchIssuedAt(vouch: string): number | null {
    try {
        const p = vouch.split('.')[1] ?? '';
        const line = new TextDecoder()
            .decode(b64urlDecode(p))
            .split('\n')
            .find((l) => l.startsWith('issued_at: '));
        const t = line ? Number(line.slice('issued_at: '.length)) : NaN;
        return Number.isFinite(t) ? t : null;
    } catch {
        return null;
    }
}


export interface ParsedSessionDeviceEvent {
    /** The did:oc this device is published under. */
    didOc: string;
    device_id: string;
    device_pk: string;
    bindingStatement: string;
    revoked: boolean;
    createdAtUnix: number;
    nostrPubkey: string;
    eventId: string;
    /** The auth host's vouch, or null when the record carries none. */
    vouch: string | null;
}

/**
 * Parse a session device event. Unlike lock-device's parseDeviceEvent, this does
 * NOT require a non-empty binding_sig (session devices have none) and asserts
 * the `auth=session` tag so a lock-namespace record can never be parsed here.
 */
export function parseSessionDeviceEvent(event: NostrEvent): ParsedSessionDeviceEvent {
    if (event.kind !== DEVICE_KIND) {
        throw new Error('not a device event (kind mismatch)');
    }
    const tag = (name: string): string | null => {
        for (const t of event.tags) {
            if (t[0] === name && t.length > 1) return t[1] ?? null;
        }
        return null;
    };
    const didOc = tag('addr');
    const device_id = tag('device_id');
    const device_pk = tag('device_pk');
    if (!didOc || !device_id || !device_pk) {
        throw new Error('session device event missing required tags');
    }
    if (tag('auth') !== 'session') {
        throw new Error('not a session device event (auth tag mismatch)');
    }
    return {
        didOc,
        device_id,
        device_pk,
        bindingStatement: event.content,
        revoked: device_pk === 'revoked',
        createdAtUnix: event.created_at,
        nostrPubkey: event.pubkey,
        eventId: event.id,
        vouch: tag('vouch'),
    };
}

/** Every revocation of `didOc`'s session devices seen on any relay (SPEC §8.6). */
export interface SessionRevocations {
    /** "nostr_pk:device_id" of devices whose own key signed a revocation. */
    self: Set<string>;
    /** device_id → the latest host-signed revoked_at for it. */
    host: Map<string, number>;
    /** The nostr_pk each host revocation names. */
    hostNamed: Set<string>;
}

export function sessionRevocations(
    events: readonly NostrEvent[],
    didOc: string,
    hostKeys: readonly AuthHostKey[]
): SessionRevocations {
    const out: SessionRevocations = { self: new Set(), host: new Map(), hostNamed: new Set() };
    for (const e of events) {
        if (!verifyNostrEvent(e)) continue;
        const tag = (name: string) => e.tags.find((t) => t[0] === name)?.[1];
        const jws = tag('revocation');
        if (jws) {
            // Whatever key carried it: the host's signature is the authority. The
            // device is the one the statement names, whatever the other tags say;
            // only the d tag and addr must name this did:oc (SPEC §8.6).
            const r = verifyHostRevocation(jws, hostKeys);
            if (
                r &&
                r.statement === e.content &&
                r.didOc === didOc &&
                tag('d') === `oc-chat:device:${didOc}` &&
                tag('addr') === didOc
            ) {
                out.host.set(r.device_id, Math.max(out.host.get(r.device_id) ?? -1, r.revoked_at));
                out.hostNamed.add(r.nostr_pk);
            }
            continue;
        }
        try {
            const p = parseSessionDeviceEvent(e);
            if (p.revoked && p.didOc === didOc) out.self.add(`${e.pubkey}:${p.device_id}`);
        } catch {
            // not a session record
        }
    }
    return out;
}

/** Is this bind retired: by its own key, or by a host revocation dated at or
 *  after its vouch was issued (both times the host's own)? */
export function sessionDeviceRevoked(
    d: { nostrPubkey: string; device_id: string; issuedAt: number | null },
    revs: SessionRevocations
): boolean {
    if (revs.self.has(`${d.nostrPubkey}:${d.device_id}`)) return true;
    const at = revs.host.get(d.device_id);
    return at !== undefined && (d.issuedAt === null || d.issuedAt <= at);
}

/** The session records for `didOc` whose own signature and host vouch verify, revoked or not. */
export function vouchedSessionDevices(
    events: readonly NostrEvent[],
    didOc: string,
    hostKeys: readonly AuthHostKey[]
): ParsedSessionDeviceEvent[] {
    const out: ParsedSessionDeviceEvent[] = [];
    for (const e of events) {
        try {
            const p = parseSessionDeviceEvent(e);
            if (p.revoked) continue;
            if (p.didOc !== didOc) continue; // namespace must match the queried did:oc
            if (!verifyNostrEvent(e)) continue; // integrity gate
            // The binding itself: the auth host vouched for this did:oc + keys.
            if (
                !p.vouch ||
                !verifySessionVouch(
                    p.vouch,
                    {
                        didOc,
                        device_pk: p.device_pk,
                        nostr_pk: p.nostrPubkey,
                        device_id: p.device_id,
                    },
                    hostKeys
                )
            ) {
                continue;
            }
            out.push(p);
        } catch {
            // skip malformed / non-session records
        }
    }
    return out;
}

/** The session devices that bind for `didOc` now: vouched, and retired by no revocation seen (§8.6). */
export function liveSessionDevices(
    events: readonly NostrEvent[],
    didOc: string,
    hostKeys: readonly AuthHostKey[]
): ParsedSessionDeviceEvent[] {
    const revoked = sessionRevocations(events, didOc, hostKeys);
    return vouchedSessionDevices(events, didOc, hostKeys).filter(
        (p) =>
            !sessionDeviceRevoked(
                { ...p, issuedAt: p.vouch ? vouchIssuedAt(p.vouch) : null },
                revoked
            )
    );
}

/**
 * Every inbox key the auth host has vouched for `didOc`, revoked ones too. An
 * earlier channel version stands on its binding whatever became of the key
 * since (§8.3.1), so a version reader asks each. A device's own revocation
 * replaces its record at the relay, so for a device no record of which remains,
 * the key that carried it counts; a host revocation names its key.
 */
export function sessionKeysEverBound(
    events: readonly NostrEvent[],
    didOc: string,
    hostKeys: readonly AuthHostKey[]
): string[] {
    const bound = vouchedSessionDevices(events, didOc, hostKeys);
    const boundIds = new Set(bound.map((p) => p.device_id));
    const revs = sessionRevocations(events, didOc, hostKeys);
    const replaced = [...revs.self]
        .map((s) => s.split(':') as [string, string])
        .filter(([, id]) => !boundIds.has(id))
        .map(([pk]) => pk);
    return [...new Set([...bound.map((p) => p.nostrPubkey), ...replaced, ...revs.hostNamed])];
}
