// Device key binding and Nostr directory publication.
// See SPEC.md §3.

import { schnorr } from '@noble/curves/secp256k1';
import {
    generateX25519KeyPair,
    hexDecode,
    hexEncode,
    hkdfSha256,
    randomBytesN,
    sha256Bytes,
    utf8Encode,
} from '@orangecheck/lock-crypto';

export const DEVICE_KIND = 30078;
export const BINDING_VERSION = 'v2';

export interface DeviceKeyPair {
    device_id: string;
    device_pk: string; // 32-byte hex
    device_sk: Uint8Array; // 32 bytes
    created_at: string; // iso8601
}

export function generateDeviceKey(): DeviceKeyPair {
    const kp = generateX25519KeyPair();
    const deviceIdBytes = randomBytesN(16);
    return {
        device_id: hexEncode(deviceIdBytes),
        device_pk: hexEncode(kp.public),
        device_sk: kp.secret,
        created_at: new Date().toISOString(),
    };
}

export function buildBindingStatement(params: {
    address: string;
    device_pk: string;
    device_id: string;
    created_at: string;
}): string {
    // Exact byte layout per SPEC §3.2. Each line ends with LF; no trailing LF
    // beyond the last field's. Order is fixed.
    const lines = [
        `oc-lock:device-bind:${BINDING_VERSION}`,
        `address: ${params.address}`,
        `device_pk: ${params.device_pk}`,
        `device_id: ${params.device_id}`,
        `created_at: ${params.created_at}`,
    ];
    return lines.join('\n') + '\n';
}

export function buildRevocationStatement(params: {
    address: string;
    device_id: string;
    revoked_at: string;
}): string {
    const lines = [
        `oc-lock:device-revoke:${BINDING_VERSION}`,
        `address: ${params.address}`,
        `device_id: ${params.device_id}`,
        `revoked_at: ${params.revoked_at}`,
    ];
    return lines.join('\n') + '\n';
}

// ---------------------------------------------------------------------------
// Nostr event helpers
// ---------------------------------------------------------------------------

export interface NostrEvent {
    id: string;
    pubkey: string;
    created_at: number;
    kind: number;
    tags: string[][];
    content: string;
    sig: string;
}

/**
 * Derive an ephemeral Nostr keypair from a device secret per SPEC §3.4.
 * Returns a 32-byte private key (hex).
 */
export function deriveNostrKey(deviceSk: Uint8Array): { nostrSk: string; nostrPk: string } {
    const sk = hkdfSha256(
        deviceSk,
        utf8Encode('oc-lock/v2/nostr-key'),
        utf8Encode('nostr-sk'),
        32
    );
    const pk = schnorr.getPublicKey(sk);
    return { nostrSk: hexEncode(sk), nostrPk: hexEncode(pk) };
}

/**
 * Build a kind-30078 addressable event announcing a device binding.
 * The caller must supply the BIP-322 signature produced by the user's Bitcoin
 * wallet (we cannot sign BIP-322 in this package — that requires a wallet).
 */
export function buildDeviceEvent(params: {
    address: string;
    device_id: string;
    device_pk: string;
    bindingStatement: string;
    bindingSigBase64: string;
    createdAtUnix?: number;
}): Omit<NostrEvent, 'id' | 'sig' | 'pubkey'> & { pubkey?: undefined } {
    const tags: string[][] = [
        ['d', `oc-lock:device:${params.address}`],
        ['addr', params.address],
        ['device_id', params.device_id],
        ['device_pk', params.device_pk],
        ['alg', 'x25519'],
        ['binding_sig', params.bindingSigBase64],
    ];
    const created_at = params.createdAtUnix ?? Math.floor(Date.now() / 1000);
    return {
        kind: DEVICE_KIND,
        tags,
        content: params.bindingStatement,
        created_at,
    } as unknown as Omit<NostrEvent, 'id' | 'sig' | 'pubkey'> & { pubkey?: undefined };
}

/**
 * Sign a Nostr event with a Schnorr key (derived via deriveNostrKey). Produces
 * the full NostrEvent with id and sig.
 */
export function signNostrEvent(
    event: Omit<NostrEvent, 'id' | 'sig'>,
    nostrSkHex: string
): NostrEvent {
    const id = computeNostrEventId(event);
    const sk = hexDecode(nostrSkHex);
    const sig = schnorr.sign(hexDecode(id), sk);
    return {
        ...event,
        id,
        sig: hexEncode(sig),
    };
}

export function computeNostrEventId(event: Omit<NostrEvent, 'id' | 'sig'>): string {
    // Per NIP-01: id = sha256(utf8(JSON.stringify([0, pubkey, created_at, kind, tags, content]))).
    // The array must be serialized in *exactly* this form with no whitespace.
    const serialized = JSON.stringify([
        0,
        event.pubkey,
        event.created_at,
        event.kind,
        event.tags,
        event.content,
    ]);
    return hexEncode(sha256Bytes(utf8Encode(serialized)));
}

/**
 * Finalize a device event: derive Nostr key from device_sk, attach pubkey,
 * compute id, sign. Returns a fully-signed NIP-01 event ready to publish.
 */
export function finalizeDeviceEvent(params: {
    deviceSk: Uint8Array;
    address: string;
    device_id: string;
    device_pk: string;
    bindingStatement: string;
    bindingSigBase64: string;
    createdAtUnix?: number;
}): NostrEvent {
    const { nostrSk, nostrPk } = deriveNostrKey(params.deviceSk);
    const base = buildDeviceEvent({
        address: params.address,
        device_id: params.device_id,
        device_pk: params.device_pk,
        bindingStatement: params.bindingStatement,
        bindingSigBase64: params.bindingSigBase64,
        createdAtUnix: params.createdAtUnix,
    });
    const withPubkey = { ...base, pubkey: nostrPk } as Omit<NostrEvent, 'id' | 'sig'>;
    return signNostrEvent(withPubkey, nostrSk);
}

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

export interface ParsedDeviceEvent {
    address: string;
    device_id: string;
    device_pk: string;
    bindingStatement: string;
    bindingSigBase64: string;
    revoked: boolean;
    createdAtUnix: number;
    nostrPubkey: string;
    eventId: string;
}

export function parseDeviceEvent(event: NostrEvent): ParsedDeviceEvent {
    if (event.kind !== DEVICE_KIND) {
        throw new Error('not a device event (kind mismatch)');
    }
    const tag = (name: string): string | null => {
        for (const t of event.tags) {
            if (t[0] === name && t.length > 1) return t[1] ?? null;
        }
        return null;
    };
    const address = tag('addr');
    const device_id = tag('device_id');
    const device_pk = tag('device_pk');
    const binding_sig = tag('binding_sig');
    if (!address || !device_id || !device_pk || !binding_sig) {
        throw new Error('device event missing required tags');
    }

    // The BIP-322 signature covers `event.content` — the statement — and nothing
    // else. Tags are an index the relay lets anyone write, so a value read from a
    // tag has been authenticated by nobody.
    //
    // Skipping this check was a total confidentiality break, and it needed no key
    // material: republish a victim's device event with their real content and
    // real binding_sig, change only the `device_pk` TAG to your own X25519 key.
    // verifyBip322(content, sig, addr) passes — every signed byte is genuine —
    // and the sender then seals the content key to the attacker's key, because
    // the recipient record was built from the tag. Proven against the published
    // package before this existed.
    //
    // So the statement is the source of truth and the tags must agree with it.
    const signed = parseBindingStatement(event.content);
    if (!signed) {
        throw new Error('device event content is not a v2 bind or revoke statement');
    }
    if (signed.address !== address) {
        throw new Error(
            `device event addr tag (${address}) does not match the signed statement (${signed.address})`,
        );
    }
    if (signed.device_id !== device_id) {
        throw new Error(
            `device event device_id tag (${device_id}) does not match the signed statement (${signed.device_id})`,
        );
    }
    if (signed.kind === 'bind') {
        if (signed.device_pk !== device_pk) {
            throw new Error(
                `device event device_pk tag does not match the signed statement — ` +
                    `tag says ${device_pk}, the signature covers ${signed.device_pk}`,
            );
        }
    } else if (device_pk !== 'revoked') {
        throw new Error(
            `device event carries a revocation statement but its device_pk tag is ${device_pk}, not "revoked"`,
        );
    }

    return {
        address: signed.address,
        device_id: signed.device_id,
        // Take the key from the SIGNED bytes, never the tag.
        device_pk: signed.kind === 'bind' ? signed.device_pk : 'revoked',
        bindingStatement: event.content,
        bindingSigBase64: binding_sig,
        revoked: signed.kind === 'revoke',
        createdAtUnix: event.created_at,
        nostrPubkey: event.pubkey,
        eventId: event.id,
    };
}

/**
 * Read back the fields the signature actually commits to. Returns null for
 * anything that is not a well-formed v2 bind/revoke statement, which the caller
 * treats as an unusable record.
 */
function parseBindingStatement(
    content: string,
):
    | { kind: 'bind'; address: string; device_pk: string; device_id: string }
    | { kind: 'revoke'; address: string; device_id: string }
    | null {
    const lines = content.split('\n');
    const header = lines[0];
    const field = (name: string): string | null => {
        const prefix = `${name}: `;
        for (const l of lines.slice(1)) {
            if (l.startsWith(prefix)) return l.slice(prefix.length);
        }
        return null;
    };
    const address = field('address');
    const device_id = field('device_id');
    if (!address || !device_id) return null;

    if (header === `oc-lock:device-bind:${BINDING_VERSION}`) {
        const device_pk = field('device_pk');
        if (!device_pk) return null;
        return { kind: 'bind', address, device_pk, device_id };
    }
    if (header === `oc-lock:device-revoke:${BINDING_VERSION}`) {
        return { kind: 'revoke', address, device_id };
    }
    return null;
}
