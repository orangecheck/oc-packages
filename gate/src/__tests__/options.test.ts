/**
 * The gate refuses an option it does not know. A typo, or an option a doc
 * describes that the gate never had, would otherwise be ignored, and the gate
 * would admit requests the caller meant it to refuse.
 */

import { describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/sdk', () => ({
    check: vi.fn(async () => ({ ok: true, sats: 1_000_000, days: 365 })),
    FANOUT_DEADLINE_MS: 4000,
}));

import { assertOc, ocGate, ocGateFastify, ocGateFetch, ocGateHono, withOcGate } from '../index';
import type { GateOptions } from '../types';

// An option no version of the gate has had: shaped like the one the docs described.
const stale = {
    minSats: 100_000,
    address: { from: 'header' },
    trustUnsafeSources: true,
    pledgeHistory: { minKept: 5 },
} as unknown as GateOptions;

const known: GateOptions = {
    minSats: 100_000,
    minDays: 30,
    address: { from: 'header', name: 'x-oc-address' },
    trustUnsafeSources: true,
    cacheTtlMs: 1000,
    cacheMax: 10,
    failOpen: false,
    relays: ['wss://relay.example'],
    lookupTimeoutMs: 5000,
    exposeSubject: false,
    onDecision: () => {},
    onBlocked: () => {},
};

describe('unknown options', () => {
    it('every middleware factory throws when it is built with one', () => {
        expect(() => ocGate(stale)).toThrow(/unknown option pledgeHistory/);
        expect(() => ocGateFastify(stale)).toThrow(/unknown option pledgeHistory/);
        expect(() => ocGateHono(stale)).toThrow(/unknown option pledgeHistory/);
        expect(() => withOcGate(() => undefined, stale)).toThrow(/unknown option pledgeHistory/);
    });

    it('the per-request checks refuse one too, instead of deciding without it', async () => {
        await expect(assertOc({ headers: { 'x-oc-address': 'bc1qabc' } }, stale)).rejects.toThrow(
            /unknown option pledgeHistory/
        );
        await expect(
            ocGateFetch(new Request('https://x.example', { headers: { 'x-oc-address': 'bc1qabc' } }), stale)
        ).rejects.toThrow(/unknown option pledgeHistory/);
    });

    it('a misspelled option is refused, not ignored', () => {
        expect(() => ocGate({ minsats: 100_000 } as unknown as GateOptions)).toThrow(/unknown option minsats/);
    });

    it('a subject source with a key it does not read is refused', () => {
        expect(() =>
            ocGate({ address: { from: 'header', nam: 'x-addr' } } as unknown as GateOptions)
        ).toThrow(/address: unknown key nam/);
        expect(() => ocGate({ address: { from: 'body', name: 'addr' } } as unknown as GateOptions)).toThrow(
            /address: unknown key name/
        );
    });

    it('every option the gate documents is accepted', async () => {
        expect(() => ocGate(known)).not.toThrow();
        expect(() => ocGate({ attestationId: { from: 'body', path: 'id' } })).not.toThrow();
        expect(() => ocGate({ identity: { from: () => 'github:alice' } })).not.toThrow();
        const d = await assertOc({ headers: { 'x-oc-address': 'bc1qabc' } }, known);
        expect(d.ok).toBe(true);
    });
});
