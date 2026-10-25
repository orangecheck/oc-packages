// SPEC §9.1's reason rule as a signer applies it, and how a reason is shown.
// Verifiers do not use it: see revocation-honoured.test.ts.

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
});
