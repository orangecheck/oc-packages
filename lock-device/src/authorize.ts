// Which Nostr pubkeys a set of device records authorizes. See SPEC §3.4.

import type { ParsedDeviceEvent } from './index.js';

/** From this instant, by the reader's clock, a v2 record authorizes no Nostr key (SPEC §3.4). */
export const V2_INBOX_SUNSET = '2027-01-21T00:00:00Z';

export interface AuthorizeOptions {
    /** The reader's clock. Default: the current time. */
    now?: Date;
}

/**
 * Select the device records whose `nostrPubkey` may act for their address.
 *
 * `records` MUST already be BIP-322-verified, non-revoked bind records for one
 * address. A v3 record signs its Nostr pubkey, so it is always authorized. A v2
 * record does not, so its pubkey is only the event author's claim. Before
 * `V2_INBOX_SUNSET` it is authorized only while its `device_id` has no v3 record
 * and appears under exactly one Nostr pubkey; from then on it authorizes no key.
 * A v2 bind stays live for sealing to its `device_pk` either way (liveDevices).
 */
export function authorizedDevices(
    records: readonly ParsedDeviceEvent[],
    opts: AuthorizeOptions = {}
): ParsedDeviceEvent[] {
    for (const k of Object.keys(opts)) {
        if (k !== 'now') throw new TypeError(`authorizedDevices does not read option "${k}"`);
    }
    const v2Counts = (opts.now ?? new Date()).getTime() < Date.parse(V2_INBOX_SUNSET);
    const v3Ids = new Set<string>();
    const v2Pubkeys = new Map<string, Set<string>>();
    for (const r of records) {
        if (r.revoked) continue;
        if (r.bindingVersion === 'v3') {
            v3Ids.add(r.device_id);
        } else {
            const set = v2Pubkeys.get(r.device_id) ?? new Set<string>();
            set.add(r.nostrPubkey);
            v2Pubkeys.set(r.device_id, set);
        }
    }
    return records.filter((r) => {
        if (r.revoked) return false;
        if (r.bindingVersion === 'v3') return true;
        if (!v2Counts || v3Ids.has(r.device_id)) return false;
        return v2Pubkeys.get(r.device_id)?.size === 1;
    });
}
