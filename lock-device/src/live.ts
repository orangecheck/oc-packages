// Which device records are still live once revocations and the reader's clock
// are applied. See OC Lock SPEC §3.5 and LIFECYCLE §1.1.

import type { ParsedDeviceEvent } from './index.js';

/** A timestamp line from a signed device statement, as epoch ms, or null. */
export function signedTime(statement: string, field: 'created_at' | 'revoked_at'): number | null {
    const line = statement.split('\n').find((l) => l.startsWith(`${field}: `));
    if (!line) return null;
    const t = Date.parse(line.slice(field.length + 2));
    return Number.isFinite(t) ? t : null;
}

/** How far a bind's signed `created_at` may run ahead of the reader's clock and still count. */
export const DEFAULT_BIND_SKEW_MS = 10 * 60_000;

export interface LiveOptions {
    /** The reader's clock. Default: the current time. */
    now?: Date;
    /** Default DEFAULT_BIND_SKEW_MS. */
    maxSkewMs?: number;
}

/** Binds that no revocation retires, before the reader's clock is applied. */
function standing(records: readonly ParsedDeviceEvent[]): ParsedDeviceEvent[] {
    const key = (r: ParsedDeviceEvent) => `${r.address}\n${r.device_id}`;
    const revokedAt = new Map<string, number>();
    for (const r of records) {
        if (!r.revoked) continue;
        // One that signs no readable revoked_at bounds nothing: it retires every bind (SPEC §3.5).
        const at = signedTime(r.bindingStatement, 'revoked_at') ?? Infinity;
        revokedAt.set(key(r), Math.max(revokedAt.get(key(r)) ?? at, at));
    }
    return records.filter((r) => {
        if (r.revoked) return false;
        const bound = signedTime(r.bindingStatement, 'created_at');
        if (bound === null) return false;
        const cut = revokedAt.get(key(r));
        return cut === undefined || bound > cut;
    });
}

const limitOf = (opts: LiveOptions) =>
    (opts.now ?? new Date()).getTime() + (opts.maxSkewMs ?? DEFAULT_BIND_SKEW_MS);

/**
 * The bind records still live after revocations.
 *
 * `records` MUST already be BIP-322-verified, both binds and revocations: a
 * revocation's authority is the address's signature, so one that was not
 * verified must not be passed in. A revocation retires every bind of its
 * `(address, device_id)` whose signed `created_at` is not later than its signed
 * `revoked_at`, whichever Nostr key carried either record and whichever relay
 * served it. A bind signed after the revocation stays live. A bind whose signed
 * `created_at` is later than the reader's clock plus `maxSkewMs` is not live yet
 * (see pendingDevices).
 */
export function liveDevices(
    records: readonly ParsedDeviceEvent[],
    opts: LiveOptions = {}
): ParsedDeviceEvent[] {
    const limit = limitOf(opts);
    return standing(records).filter((r) => signedTime(r.bindingStatement, 'created_at')! <= limit);
}

/**
 * Binds that no revocation retires but that are dated later than the reader's
 * clock allows: nobody seals to them yet, and a device list shows them so they
 * can be revoked before their date.
 */
export function pendingDevices(
    records: readonly ParsedDeviceEvent[],
    opts: LiveOptions = {}
): ParsedDeviceEvent[] {
    const limit = limitOf(opts);
    return standing(records).filter((r) => signedTime(r.bindingStatement, 'created_at')! > limit);
}

/**
 * The `revoked_at` to sign when revoking `(address, deviceId)`: the current
 * time, or the latest signed `created_at` among that device's binds in
 * `records` if later, so the revocation also retires a bind dated ahead.
 */
export function revokedAtFor(
    records: readonly ParsedDeviceEvent[],
    address: string,
    deviceId: string,
    now: Date = new Date()
): string {
    let at = now.getTime();
    for (const r of records) {
        if (r.revoked || r.address !== address || r.device_id !== deviceId) continue;
        const t = signedTime(r.bindingStatement, 'created_at');
        if (t !== null && t > at) at = t;
    }
    return new Date(at).toISOString();
}
