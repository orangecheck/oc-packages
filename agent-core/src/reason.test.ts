// SPEC §9.1's revocation reason rule as a verifier applies it, the stricter
// rule a signer applies, and how a reason is shown.

import { describe, expect, it } from 'vitest';

import { authoredReasonProblem, reasonProblem, REVOCATION_REASON_MAX_BYTES, shownReason } from './index.js';

describe('reasonProblem, the spec rule verifiers apply', () => {
    it('takes any ASCII up to 128 bytes, control characters included, and the empty reason', () => {
        expect(REVOCATION_REASON_MAX_BYTES).toBe(128);
        for (const r of ['', 'agent key rotated', 'x'.repeat(128), 'key lost\nsigned_at: 2020-01-01T00:00:00Z', 'a\tb', 'a\x00b', 'a\x7fb']) {
            expect(reasonProblem(r)).toBeNull();
        }
    });

    it('refuses 129 bytes', () => {
        expect(reasonProblem('x'.repeat(129))).toBe('too_long');
    });

    it('refuses text outside ASCII, though it fits in 128 UTF-16 units', () => {
        expect(reasonProblem('\u00e9'.repeat(128))).toBe('not_ascii');
        expect(reasonProblem('rotated\u200b')).toBe('not_ascii');
    });

    it('refuses what is not text', () => {
        for (const v of [undefined, null, 0, {}, [], true]) expect(reasonProblem(v)).toBe('not_text');
    });
});

describe('authoredReasonProblem, the stricter rule signers apply', () => {
    it('takes printable ASCII up to 128 bytes', () => {
        expect(authoredReasonProblem(' !"#$%&\'()*+,-./0-9:;<=>?@A-Z[\\]^_`a-z{|}~')).toBeNull();
        expect(authoredReasonProblem('x'.repeat(128))).toBeNull();
    });

    it('refuses a control character, which the spec allows', () => {
        for (const r of ['key lost\nsigned_at: 2020-01-01T00:00:00Z', 'a\rb', 'a\tb', 'a\x00b', 'a\x7fb']) {
            expect(reasonProblem(r)).toBeNull();
            expect(authoredReasonProblem(r)).toBe('control_character');
        }
    });

    it('refuses what the spec refuses', () => {
        expect(authoredReasonProblem('\u00e9')).toBe('not_ascii');
        expect(authoredReasonProblem('x'.repeat(129))).toBe('too_long');
        expect(authoredReasonProblem(5)).toBe('not_text');
    });
});

describe('shownReason', () => {
    it('writes each control character and the backslash as an escape, and drops nothing', () => {
        expect(shownReason('a\nb\tc\rd\x07e\x7ff\\g')).toBe('a\\nb\\tc\\rd\\x07e\\x7ff\\\\g');
        expect(shownReason('agent key rotated')).toBe('agent key rotated');
    });
});
