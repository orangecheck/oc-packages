// SPEC §0: digits are ASCII 0-9, and whitespace is what JavaScript's \s and
// trim() take. test-vectors/text-classes.json pins both, with JSON integers,
// and gives answers sdk-py's tests/pledge/test_text_classes.py must also give.

import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { validatePledgeInput } from './canonical.js';
import { checkPledgeCreateScope } from './delegation.js';
import { validateResolutionQuery } from './resolution.js';
import type { PledgeCanonicalInput, PledgeEnvelope } from './types.js';

interface TextClasses {
    whitespace: number[];
    not_whitespace: number[];
    digits: string;
    not_digits: number[];
    resolution_queries: { mechanism: string; query: string; ok: boolean }[];
    times: { value: string; ok: boolean }[];
    counts: { field: 'min_sats' | 'min_days' | 'block'; value: unknown; ok: boolean }[];
    scopes: { min_sats: number; cases: { scope: string; ok: boolean }[] };
}

const V: TextClasses = JSON.parse(
    readFileSync(
        join(dirname(fileURLToPath(import.meta.url)), '..', 'test-vectors', 'text-classes.json'),
        'utf8',
    ),
);

const COUNTERPARTY = 'bc1qcounter0000000000000000000000000000000';
const PLEDGE: PledgeCanonicalInput = {
    swearer: 'bc1qswearer00000000000000000000000000000000',
    proposition: 'I will deliver the audit report to the counterparty.',
    resolution: {
        mechanism: 'counterparty_signs',
        query: `counterparty(${COUNTERPARTY}) signs outcome over pledge_id`,
    },
    resolves_at: { time: '2027-01-01T00:00:00Z' },
    expires_at: '2027-02-01T00:00:00Z',
    bond: { attestation_id: 'c'.repeat(64), min_sats: 1000, min_days: 1 },
    counterparty: COUNTERPARTY,
    dispute: { mechanism: null, params: null },
    remediation: 'breach_recorded',
    sworn_at: '2026-10-20T00:00:00Z',
    nonce: '0123456789abcdef0123456789abcdef',
};

describe('text classes (test-vectors/text-classes.json)', () => {
    it('lists exactly the code points \\s matches and trim() removes', () => {
        const matched: number[] = [];
        const trimmed: number[] = [];
        for (let cp = 0; cp <= 0x10ffff; cp++) {
            if (cp >= 0xd800 && cp <= 0xdfff) continue;
            const ch = String.fromCodePoint(cp);
            if (/^\s$/.test(ch)) matched.push(cp);
            if (ch.trim() === '') trimmed.push(cp);
        }
        const listed = [...V.whitespace].sort((a, b) => a - b);
        expect(matched).toEqual(listed);
        expect(trimmed).toEqual(listed);
        for (const cp of V.not_whitespace) expect(listed).not.toContain(cp);
    });

    it('reads only ASCII 0-9 as a digit', () => {
        const matched: string[] = [];
        for (let cp = 0; cp <= 0x10ffff; cp++) {
            if (cp >= 0xd800 && cp <= 0xdfff) continue;
            if (/^\d$/.test(String.fromCodePoint(cp))) matched.push(String.fromCodePoint(cp));
        }
        expect(matched.join('')).toBe(V.digits);
        for (const cp of V.not_digits) expect(V.digits.includes(String.fromCodePoint(cp))).toBe(false);
    });

    it.each(V.resolution_queries.map((c, i) => [i, c] as const))(
        'resolution query %i gives the listed answer',
        (_i, c) => {
            expect(validateResolutionQuery(c.mechanism, c.query).ok).toBe(c.ok);
        },
    );

    it.each(V.times.map((c, i) => [i, c] as const))('time %i gives the listed answer', (_i, c) => {
        expect(validatePledgeInput({ ...PLEDGE, sworn_at: c.value }).ok).toBe(c.ok);
    });

    it.each(V.counts.map((c, i) => [i, c] as const))('count %i gives the listed answer', (_i, c) => {
        const input =
            c.field === 'block'
                ? { ...PLEDGE, resolves_at: { block: c.value as number } }
                : { ...PLEDGE, bond: { ...PLEDGE.bond, [c.field]: c.value as number } };
        expect(validatePledgeInput(input).ok).toBe(c.ok);
    });

    it.each(V.scopes.cases.map((c, i) => [i, c] as const))(
        'delegation scope %i gives the listed answer',
        (_i, c) => {
            const pledge = { bond: { min_sats: V.scopes.min_sats } } as PledgeEnvelope;
            const delegation = {
                principal: 'bc1qprincipal',
                agent: 'bc1qagent',
                scopes: [c.scope],
                expires_at: '2027-01-01T00:00:00Z',
            };
            expect(checkPledgeCreateScope(pledge, delegation).ok).toBe(c.ok);
        },
    );
});
