/**
 * A signed challenge verifies only in its canonical text: the lines issueChallenge writes, in its
 * order, each once, ending in one newline, or in none as a shell passes it. Every message below
 * carries a valid signature over its own bytes, so only the text decides.
 */
import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { describe, expect, it } from 'vitest';

import { issueChallenge, verifyChallenge } from '../index';

const KEY = '00'.repeat(31) + '01';
const ADDRESS = addressFromPrivateKey(KEY, 'p2wpkh');
const NOW = new Date('2026-11-09T05:00:00Z');

const ISSUE = {
    address: ADDRESS,
    nonce: 'a'.repeat(32),
    audience: 'https://a.example',
    purpose: 'login',
    now: NOW,
};
const issued = issueChallenge(ISSUE);
// Each control character a value may not hold, by code point: C0 samples, DEL, NEL, LS, PS.
const SPLITTERS = [0x00, 0x09, 0x0b, 0x0c, 0x1b, 0x1f, 0x7f, 0x85, 0x2028, 0x2029];

function verify(message: string, expected: { audience?: string; purpose?: string } = {}) {
    return verifyChallenge({
        message,
        signature: signMessage(ADDRESS, message, KEY),
        expectedNonce: 'a'.repeat(32),
        expectedAudience: expected.audience ?? 'https://a.example',
        expectedPurpose: expected.purpose ?? 'login',
        now: NOW,
    });
}

describe('a signed challenge verifies only in its canonical text', () => {
    it('verifies the issued text', async () => {
        expect(await verify(issued.message)).toMatchObject({ ok: true, address: ADDRESS });
    });

    it('verifies the issued text without its final LF, as a shell passes it', async () => {
        const r = await verify(issued.message.slice(0, -1));
        expect(r).toMatchObject({ ok: true, address: ADDRESS, audience: 'https://a.example' });
    });

    it('verifies an issued text with no extensions', async () => {
        const plain = issueChallenge({ address: ADDRESS, nonce: 'a'.repeat(32), now: NOW });
        const r = await verifyChallenge({
            message: plain.message,
            signature: signMessage(ADDRESS, plain.message, KEY),
            now: NOW,
        });
        expect(r).toMatchObject({ ok: true, address: ADDRESS });
    });

    it('refuses a repeated audience line', async () => {
        const message = issued.message + 'audience: https://b.example\n';
        expect(await verify(message, { audience: 'https://b.example' })).toEqual({
            ok: false,
            reason: 'malformed',
        });
    });

    it('refuses a repeated purpose line', async () => {
        const message = issued.message + 'purpose: link\n';
        expect(await verify(message, { purpose: 'link' })).toEqual({
            ok: false,
            reason: 'malformed',
        });
    });

    it('refuses blank lines', async () => {
        for (const message of [
            issued.message + '\n',
            issued.message.replace('ack: ', '\nack: '),
            issued.message + '\n'.repeat(40) + 'audience: https://b.example\n',
        ]) {
            expect(await verify(message)).toEqual({ ok: false, reason: 'malformed' });
        }
    });

    it('refuses trailing content', async () => {
        for (const message of [
            issued.message + 'note: hello\n',
            issued.message + 'hello\n',
            issued.message + 'hello',
            issued.message + 'note: hello',
        ]) {
            expect(await verify(message)).toEqual({ ok: false, reason: 'malformed' });
        }
    });

    it('refuses a repeated extension', async () => {
        const memo = issueChallenge({ address: ADDRESS, nonce: 'a'.repeat(32), now: NOW }).message;
        const message = memo + 'memo: one\nmemo: one\n';
        const r = await verifyChallenge({
            message,
            signature: signMessage(ADDRESS, message, KEY),
            now: NOW,
        });
        expect(r).toEqual({ ok: false, reason: 'malformed' });
    });

    it('refuses the issued lines restated: reordered, re-spelled or re-ended', async () => {
        const swap = issued.message.replace(
            'audience: https://a.example\npurpose: login\n',
            'purpose: login\naudience: https://a.example\n'
        );
        for (const message of [
            swap,
            issued.message.replace('T05:00:00Z', 'T05:00:00.000Z'),
            issued.message.replace(/\n/g, '\r\n'),
            issued.message.slice(0, -1) + '\r',
            issued.message.replace('purpose: login', 'Purpose: login'),
        ]) {
            expect(message).not.toBe(issued.message);
            expect(await verify(message)).toEqual({ ok: false, reason: 'malformed' });
        }
    });

    it('refuses a time outside the years 0000 to 9999, however Date reads it', async () => {
        for (const message of [
            issued.message.replace(/expires_at: .*\n/, 'expires_at: +010000-01-01T00:00:00Z\n'),
            issued.message.replace(/issued_at: .*\n/, 'issued_at: -000001-01-01T00:00:00Z\n'),
        ]) {
            expect(await verify(message)).toEqual({ ok: false, reason: 'malformed' });
        }
    });

    it('refuses a value holding a control character or a line separator', async () => {
        for (const code of SPLITTERS) {
            const message = issued.message.replace(
                'purpose: login\n',
                `memo: a${String.fromCharCode(code)}b\npurpose: login\n`
            );
            expect(await verify(message), `U+${code.toString(16)}`).toEqual({
                ok: false,
                reason: 'malformed',
            });
        }
    });

    it('refuses an audience a wallet shows as two lines, even when it is the one expected', async () => {
        const audience = `https://a.example${String.fromCharCode(0x2028)}audience: https://b.example`;
        const message = issued.message.replace('audience: https://a.example', `audience: ${audience}`);
        expect(await verify(message, { audience })).toEqual({ ok: false, reason: 'malformed' });
    });

    it('reads a value untrimmed and accepts other text, as issued', async () => {
        const purpose = 'sign in at the café ';
        const plain = issueChallenge({ ...ISSUE, purpose });
        expect(plain.message).toContain(`purpose: ${purpose}\n`);
        expect(await verify(plain.message, { purpose })).toMatchObject({ ok: true, purpose });
        expect(await verify(plain.message, { purpose: purpose.trim() })).toMatchObject({
            ok: false,
            reason: 'purpose_mismatch',
        });
    });

    it('issues no challenge outside the years 0000 to 9999', () => {
        const at = (now: string, ttlSeconds = 300) => () =>
            issueChallenge({ ...ISSUE, now: new Date(now), ttlSeconds });
        expect(at('+010000-01-01T00:00:00Z')).toThrow(/years 0000 to 9999/);
        expect(at('-000001-01-01T00:00:00Z')).toThrow(/years 0000 to 9999/);
        expect(at('9999-12-31T23:59:00Z', 120)).toThrow(/years 0000 to 9999/);
        expect(at('0000-01-01T00:00:00Z')).not.toThrow();
        expect(at('9999-12-31T23:54:59Z')).not.toThrow();
    });

    it('issues no challenge whose value holds a control character or a line separator', () => {
        for (const code of SPLITTERS) {
            const c = String.fromCharCode(code);
            for (const over of [
                { audience: `https://a.example${c}audience: https://b.example` },
                { purpose: `login${c}x` },
                { address: `${ADDRESS}${c}` },
            ]) {
                expect(() => issueChallenge({ ...ISSUE, ...over }), `U+${code.toString(16)}`).toThrow(
                    /must be one line/
                );
            }
        }
    });

    it('issues no challenge whose value spans lines', () => {
        for (const over of [
            { audience: 'https://a.example\npurpose: link' },
            { purpose: 'login\r\naudience: https://b.example' },
            { address: `${ADDRESS}\nnote: x` },
        ]) {
            const issue = () =>
                issueChallenge({ address: ADDRESS, nonce: 'a'.repeat(32), ...over });
            expect(issue).toThrow(/must be one line/);
        }
    });
});
