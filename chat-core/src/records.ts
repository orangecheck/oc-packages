// Who a principal's kind-30078 records bind, from the records a relay holds:
// OC Lock's rule for a Bitcoin address (@orangecheck/lock-device), §8.6 for a
// did:oc. The caller looks the records up; these answer from them.

import { isDidOc } from '@orangecheck/auth-core/identifiers';
import {
    authorizedDevices,
    boundNostrKeys,
    verifyDeviceRecords,
    type NostrEvent,
    type ParsedDeviceEvent,
} from '@orangecheck/lock-device';

import type { IsBound } from './channel';
import { verifyNostrEvent } from './event';
import { UnansweredReadError, type VerifyBip322 } from './read';
import { liveSessionDevices, sessionDeviceDtag, sessionKeysEverBound, type AuthHostKey } from './session';
import { btcBindingLive, sessionBindingRevoked, type Liveness, type VersionBinding } from './version-binding';

export { isDidOc };

/** The d-tag a Bitcoin address's device records are published under (OC Lock SPEC §3). */
export function addressDeviceDtag(address: string): string {
    return `oc-lock:device:${address}`;
}

/** The d-tag a principal's device records are published under: an address's, or a did:oc's session records. */
export function deviceDtag(principal: string): string {
    return isDidOc(principal) ? sessionDeviceDtag(principal) : addressDeviceDtag(principal);
}

/**
 * Every inbox key an address's verified records have bound, revoked ones too
 * (§8.3.1): an earlier channel version stands on its binding whatever became
 * of the key since. A device's own revocation replaces its bind record at the
 * relay, so for a device no bind record of which remains, the key that carried
 * its revocation counts. A revocation carried by a fresh key adds nothing.
 */
export function addressKeysEverBound(verified: readonly ParsedDeviceEvent[], now: Date = new Date()): string[] {
    const binds = verified.filter((p) => !p.revoked);
    const boundIds = new Set(binds.map((p) => p.device_id));
    const replaced = verified.filter((p) => p.revoked && !boundIds.has(p.device_id)).map((p) => p.nostrPubkey);
    return [...new Set([...authorizedDevices(binds, { now }).map((d) => d.nostrPubkey), ...replaced])];
}

/**
 * The kind-30078 records the relays hold under a principal's d-tag; whether one
 * finished answering; and, when the caller knows, whether every relay asked did
 * (`complete`). A record seen on any relay counts. A conclusion that rests on a
 * record not being there needs every relay's answer: "bound now" and "live"
 * (no revocation seen), and "not bound". With `complete: false` those are not
 * read.
 */
export type RecordLookup = (
    principal: string
) => Promise<{ events: NostrEvent[]; answered: boolean; complete?: boolean }>;

export interface RecordReadOptions {
    /** The auth host's published keys, retired ones included (§8.6). Read only for a did:oc. */
    hostKeys: () => Promise<readonly AuthHostKey[]>;
    verifyBip322: VerifyBip322;
    /** The reader's clock. */
    now?: () => Date;
}

/** The binding reads a resolver needs, answered from looked-up records. */
export interface RecordReads {
    /** The keys a principal's records bind now, or 'no-answer' (also when a relay asked did not answer). */
    boundKeys(principal: string): Promise<string[] | 'no-answer'>;
    /** Throws UnansweredReadError when no relay answered, or when one asked did not
     *  (`complete: false`): "bound now" and "not bound" both rest on what was not seen. */
    isBound: IsBound;
    liveness(b: VersionBinding): Promise<Liveness>;
    everBoundKeys(principal: string): Promise<{ keys: string[]; answered: boolean }>;
}

/** Binding reads over `lookup`, one lookup per principal for the life of the object. */
export function recordReads(lookup: RecordLookup, opts: RecordReadOptions): RecordReads {
    const now = () => (opts.now ? opts.now() : new Date());
    const looked = new Map<string, ReturnType<RecordLookup>>();
    const records = (p: string) => {
        if (!looked.has(p)) looked.set(p, lookup(p));
        return looked.get(p)!;
    };
    const verified = async (address: string) => {
        const { events, answered, complete } = await records(address);
        return {
            answered,
            complete: complete !== false,
            verified: await verifyDeviceRecords(events, address, { verifyBip322: opts.verifyBip322 }),
        };
    };
    const sessionEvents = async (didOc: string) => {
        const { events, answered, complete } = await records(didOc);
        // Only records signed by the key they name count for anything (§8.6).
        return { answered, complete: complete !== false, events: events.filter(verifyNostrEvent) };
    };
    // Which keys are bound now rests on no revocation being seen: every relay asked must answer.
    const boundKeys = async (principal: string): Promise<string[] | 'no-answer'> => {
        if (isDidOc(principal)) {
            const { events, answered, complete } = await sessionEvents(principal);
            if (!answered || !complete) return 'no-answer';
            const keys = events.length > 0 ? await opts.hostKeys() : [];
            return liveSessionDevices(events, principal, keys).map((d) => d.nostrPubkey);
        }
        const v = await verified(principal);
        if (!v.answered || !v.complete) return 'no-answer';
        return boundNostrKeys(v.verified, { now: now() });
    };
    return {
        boundKeys,
        async isBound(pubkey, principal) {
            const keys = await boundKeys(principal);
            if (keys === 'no-answer') {
                const { answered } = await records(principal);
                throw new UnansweredReadError(
                    answered
                        ? 'a relay that did not answer may hold a record that binds or revokes this key'
                        : undefined
                );
            }
            return keys.includes(pubkey);
        },
        // A revocation seen settles 'revoked' on any answer; 'live' rests on none being
        // seen, so it needs every relay asked.
        async liveness(b) {
            if (b.kind === 'btc') {
                const v = await verified(b.principal);
                if (!v.answered) return 'unknown';
                if (!btcBindingLive(b, v.verified, now())) return 'revoked';
                return v.complete ? 'live' : 'unknown';
            }
            const { events, answered, complete } = await sessionEvents(b.principal);
            if (!answered) return 'unknown';
            const keys = await opts.hostKeys();
            if (keys.length === 0) return 'unknown';
            if (sessionBindingRevoked(b, events, keys)) return 'revoked';
            return complete ? 'live' : 'unknown';
        },
        async everBoundKeys(principal) {
            if (isDidOc(principal)) {
                const { events, answered } = await sessionEvents(principal);
                const keys = events.length > 0 ? await opts.hostKeys() : [];
                return { keys: sessionKeysEverBound(events, principal, keys), answered };
            }
            const v = await verified(principal);
            return { keys: addressKeysEverBound(v.verified, now()), answered: v.answered };
        },
    };
}

/**
 * The Bitcoin address a session message's signing key steps up to (§8.6), or
 * null: of the addresses named by the OC Lock device records `nostrPk` itself
 * published (`authored`), the lexicographically smallest that binds it.
 */
export async function stepUpAddress(
    nostrPk: string,
    authored: readonly NostrEvent[],
    isBound: IsBound
): Promise<string | null> {
    const prefix = addressDeviceDtag('');
    const candidates = new Set<string>();
    for (const e of authored) {
        if (e.kind !== 30078 || e.pubkey !== nostrPk || !verifyNostrEvent(e)) continue;
        const d = e.tags.find((t) => t[0] === 'd')?.[1] ?? '';
        if (!d.startsWith(prefix)) continue;
        const address = d.slice(prefix.length);
        if (address && !isDidOc(address)) candidates.add(address);
    }
    for (const address of [...candidates].sort()) {
        if (await isBound(nostrPk, address)) return address;
    }
    return null;
}
