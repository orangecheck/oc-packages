// Which device records are still live once revocations are applied. See OC Lock
// LIFECYCLE §1.1 and OC Chat SPEC §1.

import type { ParsedDeviceEvent } from './index.js';

/** A timestamp line from a signed device statement, as epoch ms, or null. */
export function signedTime(statement: string, field: 'created_at' | 'revoked_at'): number | null {
    const line = statement.split('\n').find((l) => l.startsWith(`${field}: `));
    if (!line) return null;
    const t = Date.parse(line.slice(field.length + 2));
    return Number.isFinite(t) ? t : null;
}

/**
 * The bind records still live after revocations.
 *
 * `records` MUST already be BIP-322-verified, both binds and revocations: a
 * revocation's authority is the address's signature, so one that was not
 * verified must not be passed in. A revocation retires every bind of its
 * `(address, device_id)` whose signed `created_at` is not later than its signed
 * `revoked_at`, whichever Nostr key carried either record and whichever relay
 * served it. Relay replacement is not needed, so a lost device can be revoked
 * from another device or the wallet, and a relay that missed the revocation
 * cannot keep the device alive. A bind signed after the revocation stays live.
 */
export function liveDevices(records: readonly ParsedDeviceEvent[]): ParsedDeviceEvent[] {
    const key = (r: ParsedDeviceEvent) => `${r.address}\n${r.device_id}`;
    const revokedAt = new Map<string, number>();
    for (const r of records) {
        if (!r.revoked) continue;
        const at = signedTime(r.bindingStatement, 'revoked_at');
        if (at !== null) revokedAt.set(key(r), Math.max(revokedAt.get(key(r)) ?? at, at));
    }
    return records.filter((r) => {
        if (r.revoked) return false;
        const cut = revokedAt.get(key(r));
        if (cut === undefined) return true;
        const bound = signedTime(r.bindingStatement, 'created_at');
        return bound !== null && bound > cut;
    });
}
