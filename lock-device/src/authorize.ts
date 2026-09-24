// Which Nostr pubkeys a set of device records authorizes. See SPEC §3.4.

import type { ParsedDeviceEvent } from './index.js';

/**
 * Select the device records whose `nostrPubkey` may act for their address.
 *
 * `records` MUST already be BIP-322-verified, non-revoked bind records for one
 * address. A v3 record signs its Nostr pubkey, so it is always authorized. A v2
 * record does not, so its pubkey is only the event author's claim: it is
 * authorized only while its `device_id` has no v3 record and appears under
 * exactly one Nostr pubkey. Two pubkeys carrying one v2 device authorize neither.
 */
export function authorizedDevices(records: readonly ParsedDeviceEvent[]): ParsedDeviceEvent[] {
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
        if (v3Ids.has(r.device_id)) return false;
        return v2Pubkeys.get(r.device_id)?.size === 1;
    });
}
