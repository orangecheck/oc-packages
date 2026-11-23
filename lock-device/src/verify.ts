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

/**
 * The texts a device record's `binding_sig` may cover (OC Lock SPEC §3.3): its
 * statement, and, when the statement ends in exactly one LF, the statement
 * without it, which is what a wallet that trims the text before signing it
 * signs. A reader tries these and no other.
 */
export function bindingSigTexts(statement: string): string[] {
    const oneLf = statement.endsWith('\n') && !statement.endsWith('\n\n');
    return oneLf ? [statement, statement.slice(0, -1)] : [statement];
}

export interface VerifyDeviceRecordsOptions {
    /** A BIP-322 verifier, such as @orangecheck/bip322's. */
    verifyBip322: (args: { address: string; message: string; signature: string }) => boolean | Promise<boolean>;
}

/**
 * The text `signature` covers for `address`: the one of bindingSigTexts(statement)
 * it verifies over, or null for neither. A publisher writes this text as
 * `event.content` (OC Lock SPEC §3.3). A verifier that throws counts as no.
 */
export async function signedBindingText(
    statement: string,
    address: string,
    signature: string,
    opts: VerifyDeviceRecordsOptions
): Promise<string | null> {
    for (const message of bindingSigTexts(statement)) {
        let ok = false;
        try {
            ok = (await opts.verifyBip322({ address, message, signature })) === true;
        } catch {
            ok = false;
        }
        if (ok) return message;
    }
    return null;
}

/**
 * The device records among `events` that count for `address`: binds and
 * revocations alike, each with a valid Nostr event, a statement that names
 * `address` itself, and a BIP-322 signature by `address` over that statement or
 * over it without its final LF (bindingSigTexts). A record filed under the
 * address's slot that names another address is dropped.
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
        if ((await signedBindingText(p.bindingStatement, p.address, p.bindingSigBase64, opts)) !== null) {
            verified.push(p);
        }
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
