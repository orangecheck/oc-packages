// A channel version's own proof of who signed it (SPEC §8.3.1, 0.3.0): the
// kind-30078 device record carried in the version event's `binding` tag. An
// earlier version stands on this proof alone; the last version of a chain also
// needs it to be live, which is the one read that goes to the relays.

import {
    authorizedDevices,
    liveDevices,
    parseDeviceEvent,
    type NostrEvent,
    type ParsedDeviceEvent,
} from '@orangecheck/lock-device';

import { verifyNostrEvent } from './event';
import { UnansweredReadError, type VerifyBip322 } from './read';
import {
    parseSessionDeviceEvent,
    sessionDeviceRevoked,
    sessionRevocations,
    verifySessionVouch,
    vouchIssuedAt,
    type AuthHostKey,
} from './session';

/** Who a version event's key is bound to, by the record in its `binding` tag. */
export type VersionBinding =
    | { kind: 'btc'; principal: string; pubkey: string; record: ParsedDeviceEvent }
    | {
          kind: 'session';
          principal: string;
          pubkey: string;
          deviceId: string;
          /** The vouch's signed issued_at (the host's clock). */
          issuedAt: number | null;
      };

export type Liveness = 'live' | 'revoked' | 'unknown';

/** What reading a `binding` record needs: the host's keys (retired ones included) and a BIP-322 verifier. */
export interface BindingVerifiers {
    /** Throw UnansweredReadError when they could not be read; an empty list binds nothing. */
    hostKeys: () => Promise<readonly AuthHostKey[]>;
    verifyBip322: VerifyBip322;
}

const bindingTag = (ev: NostrEvent): string | null =>
    ev.tags.find((t) => t[0] === 'binding')?.[1] ?? null;

/** True when the version carries a `binding` tag, valid or not (0.3.0 and later). */
export function hasBindingTag(ev: NostrEvent): boolean {
    return bindingTag(ev) !== null;
}

/**
 * The principal the event's `binding` record binds its key to, or null when the
 * tag is absent or does not bind this key.
 */
export async function readVersionBinding(
    ev: NostrEvent,
    v: BindingVerifiers
): Promise<VersionBinding | null> {
    const raw = bindingTag(ev);
    if (!raw) return null;
    let rec: NostrEvent;
    try {
        rec = JSON.parse(raw) as NostrEvent;
    } catch {
        return null;
    }
    return recordBinding(rec, ev.pubkey, v);
}

/** The principal a kind-30078 record binds `pubkey` to, or null. Throws
 *  UnansweredReadError when the host's keys could not be read. */
export async function recordBinding(
    rec: NostrEvent,
    pubkey: string,
    v: BindingVerifiers
): Promise<VersionBinding | null> {
    try {
        if (!rec || rec.kind !== 30078 || rec.pubkey !== pubkey || !verifyNostrEvent(rec)) return null;
        const auth = rec.tags.find((t) => t[0] === 'auth')?.[1];
        if (auth === 'session') {
            const p = parseSessionDeviceEvent(rec);
            if (p.revoked || !p.vouch) return null;
            const subject = {
                didOc: p.didOc,
                device_pk: p.device_pk,
                nostr_pk: rec.pubkey,
                device_id: p.device_id,
            };
            if (!verifySessionVouch(p.vouch, subject, await v.hostKeys())) return null;
            return {
                kind: 'session',
                principal: p.didOc,
                pubkey: rec.pubkey,
                deviceId: p.device_id,
                issuedAt: vouchIssuedAt(p.vouch),
            };
        }
        const p = parseDeviceEvent(rec);
        // Only a v3 statement signs the key that carries it (OC Lock SPEC §3.4).
        if (p.revoked || p.bindingVersion !== 'v3') return null;
        if (!authorizedDevices([p]).some((d) => d.nostrPubkey === pubkey)) return null;
        const ok = await v.verifyBip322({
            address: p.address,
            message: p.bindingStatement,
            signature: p.bindingSigBase64,
        });
        return ok === true ? { kind: 'btc', principal: p.address, pubkey, record: p } : null;
    } catch (e) {
        // A read with no answer (the host's keys) proves nothing: the caller hears it.
        if (e instanceof UnansweredReadError) throw e;
        return null;
    }
}

/** Is an address binding live, given every verified record seen for that address:
 *  OC Lock's own rule, with the version's bind included so a relay dropping it
 *  does not count as a revocation. */
export function btcBindingLive(
    b: Extract<VersionBinding, { kind: 'btc' }>,
    verified: readonly ParsedDeviceEvent[],
    now: Date
): boolean {
    const live = authorizedDevices(liveDevices([...verified, b.record], { now }), { now });
    return live.some((d) => d.nostrPubkey === b.pubkey);
}

/** Is a session device revoked on any relay, by its own key or by the auth host (§8.6)? */
export function sessionBindingRevoked(
    b: Extract<VersionBinding, { kind: 'session' }>,
    events: readonly NostrEvent[],
    hostKeys: readonly AuthHostKey[]
): boolean {
    return sessionDeviceRevoked(
        { nostrPubkey: b.pubkey, device_id: b.deviceId, issuedAt: b.issuedAt },
        sessionRevocations(events, b.principal, hostKeys)
    );
}
