/**
 * isOneLineValue is the one rule for a signed value (SPEC §2.2, Appendix A.1), and issueChallenge,
 * verifyChallenge, buildCanonicalMessage and verify() all read it. A lone surrogate is in it because
 * an encoder writes U+FFFD in its place, so one signature would verify two strings.
 */
import { addressFromPrivateKey, signMessage, verifySignature } from '@orangecheck/bip322';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCanonicalMessage, isOneLineValue, issueChallenge, verify, verifyChallenge } from '../index';

const KEY = '00'.repeat(31) + '01';
const ADDRESS = addressFromPrivateKey(KEY, 'p2wpkh');
const NOW = new Date('2026-11-09T05:00:00Z');
const char = (...units: number[]) => String.fromCharCode(...units);
const HIGH = 0xd800;
const LOW = 0xdc00;

describe('isOneLineValue', () => {
    it('refuses every C0 control, DEL, U+0085, U+2028 and U+2029', () => {
        const refused = [...Array.from({ length: 0x20 }, (_, i) => i), 0x7f, 0x85, 0x2028, 0x2029];
        for (const code of refused) expect(isOneLineValue(`a${char(code)}b`), code.toString(16)).toBe(false);
    });

    it('takes printable ASCII, the other C1 controls, text outside ASCII and paired surrogates', () => {
        const printable = Array.from({ length: 0x7f - 0x20 }, (_, i) => char(0x20 + i)).join('');
        expect(isOneLineValue(printable)).toBe(true);
        for (const code of [0x80, 0x84, 0x86, 0x9f, 0xe9, 0x2027, 0x202a, 0xfffd]) {
            expect(isOneLineValue(`a${char(code)}b`), code.toString(16)).toBe(true);
        }
        expect(isOneLineValue(String.fromCodePoint(0x1f600, 0x10ffff))).toBe(true);
        expect(isOneLineValue('')).toBe(true);
    });

    it('refuses a surrogate without its partner, wherever it stands', () => {
        const lone = [[HIGH], [LOW], [0x61, HIGH], [LOW, 0x61], [LOW, HIGH], [HIGH, HIGH, LOW], [HIGH, LOW, LOW]];
        for (const units of lone) expect(isOneLineValue(char(...units)), units.join(',')).toBe(false);
    });

    // Node 18, which the package supports, has no isWellFormed; Node 20 and later do.
    const wellFormed = (String.prototype as unknown as { isWellFormed?: (this: string) => boolean }).isWellFormed;
    it.runIf(typeof wellFormed === 'function')('agrees with isWellFormed on every string of up to four units', () => {
        const pool = [0x61, 0xd7ff, HIGH, 0xdbff, LOW, 0xdfff, 0xe000];
        let strings = [''];
        let checked = 0;
        for (let length = 1; length <= 4; length++) {
            strings = strings.flatMap((s) => pool.map((u) => s + char(u)));
            for (const s of strings) {
                expect(isOneLineValue(s), [...s].map((c) => c.charCodeAt(0).toString(16)).join(',')).toBe(
                    wellFormed!.call(s)
                );
                checked++;
            }
        }
        expect(checked).toBe(7 + 49 + 343 + 2401);
    });
});

describe('a lone surrogate in a challenge', () => {
    const audience = `https://a.example${char(HIGH)}`;

    const ISSUE = { address: ADDRESS, nonce: 'a'.repeat(32), purpose: 'login', now: NOW };

    it('is refused by issueChallenge', () => {
        expect(() => issueChallenge({ ...ISSUE, audience })).toThrow(/lone surrogate/);
    });

    it('is malformed to verifyChallenge, though the signature verifies it and its U+FFFD twin', async () => {
        const issued = issueChallenge({ ...ISSUE, audience: 'https://a.example' });
        const twin = issued.message.replace('https://a.example', `https://a.example${char(0xfffd)}`);
        const lone = issued.message.replace('https://a.example', audience);
        const signature = signMessage(ADDRESS, twin, KEY);
        expect(verifySignature(ADDRESS, lone, signature)).toBe(true);
        const check = (message: string, expectedAudience: string) =>
            verifyChallenge({
                message,
                signature,
                expectedNonce: 'a'.repeat(32),
                expectedAudience,
                expectedPurpose: 'login',
                now: NOW,
            });
        expect(await check(lone, audience)).toEqual({ ok: false, reason: 'malformed' });
        expect(await check(twin, `https://a.example${char(0xfffd)}`)).toMatchObject({ ok: true, address: ADDRESS });
    });
});

describe('a lone surrogate in an attestation', () => {
    beforeEach(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }))
        );
    });
    afterEach(() => vi.unstubAllGlobals());

    const build = (aud: string, identifier = 'alice') =>
        buildCanonicalMessage({ address: ADDRESS, identities: [{ protocol: 'github', identifier }] }, { aud }, {
            nonce: '0011223344556677889900aabbccddee',
            issuedAt: '2026-04-22T12:00:00Z',
        });

    it('is refused by buildCanonicalMessage in an extension value or an identity', () => {
        expect(() => build(`https://a.example${char(HIGH)}`)).toThrow(/one line/);
        expect(() => build('https://a.example', `alice${char(LOW)}`)).toThrow(/one line/);
    });

    it('is decode_error to verify(), though the signature verifies it and its U+FFFD twin', async () => {
        const twin = build(`https://a.example${char(0xfffd)}`);
        const lone = twin.replace(char(0xfffd), char(HIGH));
        const sig = signMessage(ADDRESS, twin, KEY);
        expect(verifySignature(ADDRESS, lone, sig)).toBe(true);
        const codes = async (msg: string) => (await verify({ addr: ADDRESS, msg, sig, scheme: 'bip322' })).codes;
        expect(await codes(lone)).toContain('decode_error');
        expect(await codes(twin)).not.toContain('decode_error');
    });

    it('is refused by buildCanonicalMessage in the address or issued_at', () => {
        const nonce = '0011223344556677889900aabbccddee';
        const address = `${ADDRESS}${char(0x2028)}network: testnet`;
        expect(() => buildCanonicalMessage({ address }, {}, { nonce })).toThrow(/one line/);
        const issuedAt = `2026-04-22T12:00:00Z${char(HIGH)}`;
        expect(() => buildCanonicalMessage({ address: ADDRESS }, {}, { nonce, issuedAt })).toThrow(/one line/);
    });
});

describe('a core value that is not one line', () => {
    beforeEach(() => {
        vi.stubGlobal(
            'fetch',
            vi.fn(async () => new Response('[]', { status: 200, headers: { 'content-type': 'application/json' } }))
        );
    });
    afterEach(() => vi.unstubAllGlobals());

    const ISSUED_AT = '2026-04-22T12:00:00Z';
    const base = buildCanonicalMessage(
        { address: ADDRESS, identities: [{ protocol: 'github', identifier: 'alice' }] },
        { aud: 'https://a.example' },
        { nonce: '0011223344556677889900aabbccddee', issuedAt: ISSUED_AT }
    );
    const codes = async (msg: string) =>
        (await verify({ addr: ADDRESS, msg, sig: signMessage(ADDRESS, msg, KEY), scheme: 'bip322' })).codes;

    it('leaves the message it starts from verifying', async () => {
        expect(await codes(base)).not.toContain('decode_error');
    });

    // Each one ends the value, where a reader that trims would drop it and read the value it signs.
    const ENDS = [0x09, 0x0b, 0x1b, 0x85, 0x2028, 0x2029].map((c) => [c.toString(16).padStart(4, '0'), c] as const);
    it.each(ENDS)('is decode_error in the address or issued_at: U+%s', async (_, code) => {
        const address = base.replace(`address: ${ADDRESS}\n`, `address: ${ADDRESS}${char(code)}\n`);
        const issuedAt = base.replace(`issued_at: ${ISSUED_AT}\n`, `issued_at: ${ISSUED_AT}${char(code)}\n`);
        expect(address).not.toBe(base);
        expect(issuedAt).not.toBe(base);
        expect(await codes(address)).toContain('decode_error');
        expect(await codes(issuedAt)).toContain('decode_error');
    });
});
