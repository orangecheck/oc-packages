// Which Nostr keys an address binds, from device events as a relay returned them
// (OC Lock SPEC §3.3–§3.5). Shared by OC Chat's client and its directory relay.

import { schnorr } from '@noble/curves/secp256k1';
import { hexDecode } from '@orangecheck/lock-crypto';

import { authorizedDevices } from './authorize.js';
import { computeNostrEventId, parseDeviceEvent, type NostrEvent, type ParsedDeviceEvent } from './index.js';
import { liveDevices } from './live.js';

/** NIP-01: the id is the hash of the event's own fields and the signature verifies against its pubkey. */
export function verifyNostrEvent(event: NostrEvent): boolean {
    try {
        const id = computeNostrEventId(event);
        if (id !== event.id) return false;
        return schnorr.verify(hexDecode(event.sig), hexDecode(id), hexDecode(event.pubkey));
    } catch {
        return false;
    }
}

export interface VerifyDeviceRecordsOptions {
    /** A BIP-322 verifier, such as @orangecheck/bip322's. */
    verifyBip322: (args: { address: string; message: string; signature: string }) => boolean | Promise<boolean>;
}

/**
 * The device records among `events` that count for `address`: binds and
 * revocations alike, each with a valid Nostr event, a statement that names
 * `address` itself, and a BIP-322 signature by `address` over that statement.
 * A record filed under the address's slot that names another address is dropped.
 */
export async function verifyDeviceRecords(
    events: readonly NostrEvent[],
    address: string,
    opts: VerifyDeviceRecordsOptions
): Promise<ParsedDeviceEvent[]> {
    for (const k of Object.keys(opts)) {
        if (k !== 'verifyBip322') throw new TypeError(`verifyDeviceRecords does not read option "${k}"`);
    }
    if (typeof opts.verifyBip322 !== 'function') throw new TypeError('verifyDeviceRecords needs verifyBip322');
    const verified: ParsedDeviceEvent[] = [];
    for (const e of events) {
        if (!verifyNostrEvent(e)) continue;
        let p: ParsedDeviceEvent;
        try {
            p = parseDeviceEvent(e);
        } catch {
            continue;
        }
        if (p.address !== address) continue;
        let ok = false;
        try {
            ok = (await opts.verifyBip322({ address: p.address, message: p.bindingStatement, signature: p.bindingSigBase64 })) === true;
        } catch {
            ok = false;
        }
        if (ok) verified.push(p);
    }
    return verified;
}

/**
 * The Nostr keys verified records bind for their address at `now`: live after
 * revocations (liveDevices), then authorized (authorizedDevices).
 */
export function boundNostrKeys(verified: readonly ParsedDeviceEvent[], opts: { now?: Date } = {}): string[] {
    for (const k of Object.keys(opts)) {
        if (k !== 'now') throw new TypeError(`boundNostrKeys does not read option "${k}"`);
    }
    const now = opts.now ?? new Date();
    return [...new Set(authorizedDevices(liveDevices(verified, { now }), { now }).map((d) => d.nostrPubkey))];
}
