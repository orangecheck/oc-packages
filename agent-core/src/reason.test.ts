// SPEC §9.1's reason rule as a signer applies it, and how a reason is shown.
// Verifiers do not use it: see revocation-honoured.test.ts.

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { authoredReasonProblem, REVOCATION_REASON_MAX_BYTES, shownReason } from './index.js';

describe('authoredReasonProblem, the rule signers apply', () => {
    it('takes printable ASCII up to 128 bytes, and the empty reason', () => {
        expect(REVOCATION_REASON_MAX_BYTES).toBe(128);
        for (const r of ['', 'agent key rotated', 'x'.repeat(128), ' !"#$%&\'()*+,-./0-9:;<=>?@A-Z[\\]^_`a-z{|}~']) {
            expect(authoredReasonProblem(r)).toBeNull();
        }
    });

    it('refuses 129 bytes', () => {
        expect(authoredReasonProblem('x'.repeat(129))).toBe('too_long');
    });

    it('refuses text outside ASCII, though it fits in 128 UTF-16 units', () => {
        expect(authoredReasonProblem('\u00e9'.repeat(128))).toBe('not_ascii');
        expect(authoredReasonProblem('rotated\u200b')).toBe('not_ascii');
    });

    it('refuses a control character', () => {
        for (const r of ['key lost\nsigned_at: 2020-01-01T00:00:00Z', 'a\rb', 'a\tb', 'a\x00b', 'a\x7fb']) {
            expect(authoredReasonProblem(r)).toBe('control_character');
        }
    });

    it('refuses what is not text', () => {
        for (const v of [undefined, null, 0, {}, [], true]) expect(authoredReasonProblem(v)).toBe('not_text');
    });
});

describe('shownReason', () => {
    it('writes each control character and the backslash as an escape, and drops nothing', () => {
        expect(shownReason('a\nb\tc\rd\x07e\x7ff\\g')).toBe('a\\nb\\tc\\rd\\x07e\\x7ff\\\\g');
        expect(shownReason('agent key rotated')).toBe('agent key rotated');
    });

    it('says there is no reason when there is none, or it is not text', () => {
        for (const v of [undefined, null, '', 5, {}]) expect(shownReason(v)).toBe('no reason given');
    });

    it('writes C1 and bidi controls, line separators and invisible characters as escapes', () => {
        expect(shownReason('a\u009b31mb')).toBe('a\\u{9b}31mb');
        expect(shownReason('key \u202eLOST')).toBe('key \\u{202e}LOST');
        expect(shownReason('\u2066x\u2069')).toBe('\\u{2066}x\\u{2069}');
        expect(shownReason('a\u2028b\u2029c')).toBe('a\\u{2028}b\\u{2029}c');
        expect(shownReason('rotated\u200b')).toBe('rotated\\u{200b}');
        expect(shownReason('\u3164\ufe0f\u{e0041}')).toBe('\\u{3164}\\u{fe0f}\\u{e0041}');
        expect(shownReason('\ud800')).toBe('\\u{d800}');
        expect(shownReason('cl\u00e9 perdue')).toBe('cl\u00e9 perdue');
    });

    it("escapes every character in the family's hidden set (auth-core HIDDEN_TEXT_CHARS)", () => {
        const here = dirname(fileURLToPath(import.meta.url));
        const source = readFileSync(resolve(here, '../../auth-core/src/display-name.ts'), 'utf8');
        const body = /export const HIDDEN_TEXT_CHARS =\s*\/(.+)\/u;/.exec(source)?.[1];
        expect(body).toBeTruthy();
        const hidden = new RegExp(body!, 'u');
        let checked = 0;
        for (let cp = 0; cp <= 0x10ffff; cp++) {
            const c = String.fromCodePoint(cp);
            if (!hidden.test(c)) continue;
            checked++;
            if (shownReason(c) === c) throw new Error(`U+${cp.toString(16)} is shown as itself`);
        }
        expect(checked).toBeGreaterThan(4000);
    });
});
