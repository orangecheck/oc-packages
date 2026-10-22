import { describe, expect, it } from 'vitest';

import { parseStamp } from './parse.js';
import { StampError, stamp, verify } from './stamp.js';
import type { StampEnvelope } from './types.js';

const ADDRESS = 'bc1qtest00000000000000000000000000000000000';

async function good(): Promise<StampEnvelope> {
    return stamp({
        content: new TextEncoder().encode('hello stamp'),
        mime: 'text/plain',
        signer: { address: ADDRESS, signMessage: async () => 'ZmFrZS1zaWduYXR1cmU=' },
        signedAt: new Date('2026-04-24T18:30:00.123Z'),
    });
}

/** The code parseStamp throws for this input, or 'ok'. */
function codeOf(input: unknown): string {
    try {
        parseStamp(input);
        return 'ok';
    } catch (e) {
        if (!(e instanceof StampError)) throw e;
        return e.code;
    }
}

/** A good envelope with one change made to a JSON copy of it. */
async function changed(edit: (e: Record<string, any>) => void): Promise<string> {
    const env = JSON.parse(JSON.stringify(await good()));
    edit(env);
    return JSON.stringify(env);
}

describe('parseStamp()', () => {
    it('returns a stamp() envelope unchanged, from text or from a parsed value, and it still verifies', async () => {
        const env = await good();
        expect(parseStamp(JSON.stringify(env))).toEqual(env);
        expect(parseStamp(JSON.parse(JSON.stringify(env)))).toEqual(env);
        const r = await verify({ envelope: parseStamp(JSON.stringify(env)), skipSignatureVerification: true });
        expect(r.ok).toBe(true);
    });

    it('keeps unknown top-level fields and reads a missing ref, stake or ots as null', async () => {
        const text = await changed((e) => {
            e.relay_hint = 'wss://relay.example';
            delete e.content.ref;
            delete e.stake;
            delete e.ots;
        });
        const env = parseStamp(text) as StampEnvelope & { relay_hint?: string };
        expect(env.relay_hint).toBe('wss://relay.example');
        expect(env.content.ref).toBeNull();
        expect(env.stake).toBeNull();
        expect(env.ots).toBeNull();
    });

    it('refuses what is not an envelope at all', () => {
        for (const input of ['', 'not json', '[]', 'null', '42', '"stamp"', null, 7, [], 'x'.repeat(1_000_001)]) {
            expect(codeOf(input), String(input).slice(0, 20)).toBe('E_MALFORMED');
        }
    });

    it('says a newer version is unsupported, and a version that is not the number 1 is malformed', async () => {
        expect(codeOf(await changed((e) => (e.v = 2)))).toBe('E_UNSUPPORTED_VERSION');
        expect(codeOf(await changed((e) => (e.v = '1')))).toBe('E_MALFORMED');
        expect(codeOf(await changed((e) => delete e.v))).toBe('E_MALFORMED');
    });

    const cases: [string, (e: Record<string, any>) => void][] = [
        ['kind', (e) => (e.kind = 'stamps')],
        ['id uppercase', (e) => (e.id = e.id.toUpperCase())],
        ['id short', (e) => (e.id = e.id.slice(2))],
        ['content missing', (e) => delete e.content],
        ['content an array', (e) => (e.content = [])],
        ['hash prefix', (e) => (e.content.hash = e.content.hash.replace('sha256:', 'sha512:'))],
        ['hash uppercase', (e) => (e.content.hash = e.content.hash.toUpperCase().replace('SHA256:', 'sha256:'))],
        ['length a string', (e) => (e.content.length = '11')],
        ['length a fraction', (e) => (e.content.length = 1.5)],
        ['length negative', (e) => (e.content.length = -1)],
        ['mime empty', (e) => (e.content.mime = '')],
        ['mime with a newline', (e) => (e.content.mime = 'text/plain\nsigned_at: 2020-01-01T00:00:00Z')],
        ['ref a number', (e) => (e.content.ref = 3)],
        ['address with a space', (e) => (e.signer.address = 'bc1q test')],
        ['signer alg', (e) => (e.signer.alg = 'ecdsa')],
        ['sig pubkey another address', (e) => (e.sig.pubkey = 'bc1qother')],
        ['sig value empty', (e) => (e.sig.value = '')],
        ['sig alg', (e) => (e.sig.alg = 'schnorr')],
        ['signed_at one fractional digit', (e) => (e.signed_at = '2026-04-24T18:30:00.5Z')],
        ['signed_at microseconds', (e) => (e.signed_at = '2026-04-24T18:30:00.123456Z')],
        ['signed_at with an offset', (e) => (e.signed_at = '2026-04-24T18:30:00+00:00')],
        ['signed_at Feb 30', (e) => (e.signed_at = '2026-02-30T18:30:00Z')],
        ['signed_at hour 25', (e) => (e.signed_at = '2026-04-24T25:30:00Z')],
        ['stake id', (e) => (e.stake = { attestation_id: 'abc', sats_bonded: 1, days_unspent: 1 })],
        ['stake sats a string', (e) => (e.stake = { attestation_id: 'a'.repeat(64), sats_bonded: '1', days_unspent: 1 })],
        ['ots status', (e) => (e.ots = { status: 'done', proof: 'AA==', calendars: [], block_height: null, block_hash: null, upgraded_at: null })],
        ['ots proof not base64', (e) => (e.ots = { status: 'pending', proof: 'not base64!', calendars: [], block_height: null, block_hash: null, upgraded_at: null })],
        ['ots calendars not strings', (e) => (e.ots = { status: 'pending', proof: 'AA==', calendars: [1], block_height: null, block_hash: null, upgraded_at: null })],
        ['ots confirmed without a block', (e) => (e.ots = { status: 'confirmed', proof: 'AA==', calendars: [], block_height: null, block_hash: null, upgraded_at: null })],
        ['ots block hash short', (e) => (e.ots = { status: 'confirmed', proof: 'AA==', calendars: [], block_height: 1, block_hash: 'ab', upgraded_at: null })],
    ];
    for (const [name, edit] of cases) {
        it(`refuses: ${name}`, async () => {
            expect(codeOf(await changed(edit))).toBe('E_MALFORMED');
        });
    }

    it('takes both signed_at forms the spec allows', async () => {
        expect(codeOf(await changed((e) => (e.signed_at = '2026-04-24T18:30:00Z')))).toBe('ok');
        expect(codeOf(await changed((e) => (e.signed_at = '2026-04-24T18:30:00.123Z')))).toBe('ok');
    });

    it('takes a confirmed ots block with its height and hash', async () => {
        const text = await changed(
            (e) =>
                (e.ots = {
                    status: 'confirmed',
                    proof: 'AA==',
                    calendars: ['https://alice.btc.calendar.opentimestamps.org'],
                    block_height: 900_000,
                    block_hash: 'b'.repeat(64),
                    upgraded_at: '2026-04-24T20:00:00Z',
                })
        );
        expect(parseStamp(text).ots?.block_height).toBe(900_000);
    });

    it('is not tricked by a __proto__ key', async () => {
        const text = (await changed(() => undefined)).replace('{', '{"__proto__":{"ok":true},');
        const env = parseStamp(text);
        expect(({} as Record<string, unknown>).ok).toBeUndefined();
        expect(env.kind).toBe('stamp');
    });
});
