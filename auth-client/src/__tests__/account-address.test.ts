import { describe, expect, it } from 'vitest';

import { accountAddress, type OcAccount } from '../index';

const ADDR = 'bc1qvvrdxujyrh78jtnesw22cv2akfzwmvr89zkvnt';
const PRIMARY = 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l';

const account = (over: Partial<OcAccount>): OcAccount => ({
    accountId: 'acc-a',
    didOc: 'did:oc:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    primaryBtc: null,
    displayIdentity: { kind: 'did', value: 'did:oc:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa' },
    ...over,
});

describe('accountAddress', () => {
    it("a consumer site's answer for a wallet account: the display identity", () => {
        expect(accountAddress(account({ displayIdentity: { kind: 'btc', value: ADDR } }))).toBe(ADDR);
    });

    it('primaryBtc when the answer carries one, over a different display identity', () => {
        expect(
            accountAddress(account({ primaryBtc: PRIMARY, displayIdentity: { kind: 'btc', value: ADDR } }))
        ).toBe(PRIMARY);
    });

    it.each([
        ['email', 'a@example.com'],
        ['did', 'did:oc:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'],
        ['nostr', 'npub1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq'],
    ] as const)('null for an account that shows %s and has no primary address', (kind, value) => {
        expect(accountAddress(account({ displayIdentity: { kind, value } }))).toBeNull();
    });

    it('null when signed out', () => {
        expect(accountAddress(null)).toBeNull();
        expect(accountAddress(undefined)).toBeNull();
    });
});
