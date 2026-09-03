/**
 * Opt-in integration test. Skipped unless OC_LIVE_TESTS=1.
 *
 *     OC_LIVE_TESTS=1 yarn test
 *
 * Every other test in this package mocks `check()`, which is exactly why
 * @orangecheck/airdrop-gate@0.1.3 shipped rejecting every real attestation and
 * no test noticed. It pinned @orangecheck/sdk@^0.1.3, and that SDK filtered
 * relays on a multi-letter `#address` tag — relays index single-letter tag
 * names only (NIP-12), so the query matched nothing and every candidate came
 * back `not_found`. Measured directly before the fix:
 *
 *     sdk 0.1.4  ->  ok=[0]  rejected=[1]  reasons=["not_found"]
 *     sdk 1.4.0  ->  ok=[1]  rejected=[0]  reasons=[]
 *
 * A mock cannot catch that, because the mock is the thing that was wrong. This
 * test talks to real relays and real chain data, so it is off by default: it is
 * slow, needs network, and would make CI fail on someone else's outage. Run it
 * when changing the SDK dependency or the lookup path.
 */
import { describe, expect, it } from 'vitest';

import { filterAllowlist } from '../index';

const LIVE = process.env.OC_LIVE_TESTS === '1';

// A real, long-standing attestation on public relays. If this address ever
// spends its bonded UTXO the sats/days assertions below go soft, which is why
// they only assert "> 0" rather than exact figures.
const ATTESTED = 'bc1pezn5yjxmz9nuahtqprvhfeya2nv4zdfk49u5amquhqptykx695rs60hqa2';
// BIP-173's example address. Valid bech32, never attested.
const NEVER_ATTESTED = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kygt080';

describe.skipIf(!LIVE)('filterAllowlist against live relays', () => {
    it('admits an address with a real attestation', async () => {
        const out = await filterAllowlist([ATTESTED], { minSats: 1, minDays: 0 });
        expect(out.ok).toEqual([ATTESTED]);
        expect(out.rejected).toEqual([]);
        // Narrow before asserting on the metrics, so a missing decision fails
        // as "no decision" rather than three confusing undefined comparisons.
        const decision = out.all[0];
        expect(decision).toBeDefined();
        const result = decision?.check;
        expect(result).toBeDefined();
        expect(result?.sats).toBeGreaterThan(0);
        expect(result?.days).toBeGreaterThan(0);
        expect(result?.attestation_id).toMatch(/^[0-9a-f]{64}$/);
    }, 60_000);

    it('rejects a valid address that never attested, and says why', async () => {
        // The negative case matters as much as the positive one: a lookup that
        // is broken end-to-end also "rejects" this address, for the wrong
        // reason. Only the pair together distinguishes a working lookup from a
        // dead one.
        const out = await filterAllowlist([NEVER_ATTESTED], { minSats: 1, minDays: 0 });
        expect(out.ok).toEqual([]);
        expect(out.rejected[0]?.reasons).toContain('not_found');
    }, 60_000);

    it('separates the two in one pass', async () => {
        const out = await filterAllowlist([ATTESTED, NEVER_ATTESTED], { minSats: 1, minDays: 0 });
        expect(out.ok).toEqual([ATTESTED]);
        expect(out.rejected.map((r) => r.address)).toEqual([NEVER_ATTESTED]);
    }, 90_000);
});
