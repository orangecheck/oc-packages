import { describe, expect, it } from 'vitest';

import { bondMeets, readBondClaim, type SessionPayload } from '../index';

const now = Math.floor(Date.now() / 1000);
const BOND = {
    v: 1 as const,
    sats_floor: 100_000,
    days_floor: 30,
    height: 971_800,
    checked_at: now - 120,
    nullifier: 'ab'.repeat(32),
};
const session = (oc_bond?: unknown) =>
    ({ sub: 'acct', did_oc: 'did:oc:x', jti: 'j', oc_bond }) as SessionPayload;

describe('the bond claim', () => {
    it('reads a well-formed claim and nothing else', () => {
        expect(readBondClaim(session(BOND))).toEqual(BOND);
        expect(readBondClaim(session())).toBeNull();
        expect(readBondClaim(session({ ...BOND, v: 2 }))).toBeNull();
        expect(readBondClaim(session({ ...BOND, sats_floor: '100000' }))).toBeNull();
        expect(readBondClaim(session({ ...BOND, nullifier: 'not-hex' }))).toBeNull();
    });

    it('meets a requirement by floor, and by freshness when asked', () => {
        expect(bondMeets(session(BOND), { minSats: 100_000, minDays: 30 })).toBe(true);
        expect(bondMeets(session(BOND), { minSats: 50_000 })).toBe(true);
        expect(bondMeets(session(BOND), { minSats: 1_000_000 })).toBe(false);
        expect(bondMeets(session(BOND), { minDays: 90 })).toBe(false);
        expect(bondMeets(session(BOND), { maxAgeSecs: 600 })).toBe(true);
        expect(bondMeets(session(BOND), { maxAgeSecs: 60 })).toBe(false);
        expect(bondMeets(session(), {})).toBe(false);
    });
});
