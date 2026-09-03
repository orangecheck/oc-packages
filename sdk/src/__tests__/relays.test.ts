/**
 * Guards on the default relay set and the fan-out budget.
 *
 * Both of these were, until 1.5.0, the reason `check({ addr })` took 10.4
 * seconds instead of one: the queries fan out with Promise.allSettled, so a
 * fan-out costs as long as its slowest relay, and relay.nostr.band — which was
 * in DEFAULT_RELAYS — stopped accepting TCP connections entirely. Every call
 * paid the full per-relay timeout.
 *
 * That broke a dependent outright rather than merely slowing it:
 * @orangecheck/gate races check() against a 5s lookupTimeoutMs, so a 10.4s
 * lookup lost the race every time and no address-based gate decision could
 * succeed at all.
 */
import { describe, expect, it } from 'vitest';

import { DEFAULT_RELAYS, FANOUT_DEADLINE_MS } from '../nostr';

/**
 * @orangecheck/gate's DEFAULT_LOOKUP_TIMEOUT_MS (src/core.ts). Duplicated as a
 * literal on purpose — importing the dependent would invert the dependency.
 */
const GATE_LOOKUP_TIMEOUT_MS = 5_000;

describe('fan-out budget', () => {
    it('resolves inside the timeout its own dependent allows it', () => {
        // If this ever fails, @orangecheck/gate cannot admit anybody: it will
        // always reject with lookup_timeout before check() returns. Raising
        // the budget means raising gate's default in the same change.
        expect(FANOUT_DEADLINE_MS).toBeLessThan(GATE_LOOKUP_TIMEOUT_MS);
    });

    it('leaves room for a cold WebSocket plus a query', () => {
        // Measured ~1s for a healthy relay from a cold connection. A budget
        // under that would cut off working relays and reintroduce not_found.
        expect(FANOUT_DEADLINE_MS).toBeGreaterThanOrEqual(2_000);
    });
});

describe('DEFAULT_RELAYS', () => {
    it('fans out across several independent relays', () => {
        // Invariant 5 (offline-verifiable) and the family rule that
        // relay.ochk.io is never the only copy of anything both depend on
        // there being real breadth here.
        expect(DEFAULT_RELAYS.length).toBeGreaterThanOrEqual(3);
        expect(new Set(DEFAULT_RELAYS).size).toBe(DEFAULT_RELAYS.length);
    });

    it('includes our own relay without depending on it', () => {
        expect(DEFAULT_RELAYS).toContain('wss://relay.ochk.io');
        const others = DEFAULT_RELAYS.filter((r) => r !== 'wss://relay.ochk.io');
        expect(others.length).toBeGreaterThanOrEqual(2);
    });

    it('lists only wss:// endpoints', () => {
        for (const r of DEFAULT_RELAYS) expect(r.startsWith('wss://')).toBe(true);
    });
});
