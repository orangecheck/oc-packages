import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { decodeAddress, normalizeAddress, verifySignature } from '../src/index';

type Input = string | { prefix?: string; repeat: string; count: number; suffix?: string };

// Shared with sdk-py (tests/test_address_length.py).
const V = JSON.parse(readFileSync(new URL('../test-vectors/address-length.json', import.meta.url), 'utf8')) as {
    cases: { input: Input; address: boolean; normalized: string | null }[];
};

const text = (i: Input) => (typeof i === 'string' ? i : `${i.prefix ?? ''}${i.repeat.repeat(i.count)}${i.suffix ?? ''}`);
const label = (i: Input) => (typeof i === 'string' ? JSON.stringify(i) : `${i.count} x ${JSON.stringify(i.repeat)}`);

describe('inputs at and past the longest address (test-vectors/address-length.json)', () => {
    it.each(V.cases.map((c) => [label(c.input), c] as const))('%s', (_name, c) => {
        const input = text(c.input);
        expect(decodeAddress(input) !== null).toBe(c.address);
        expect(normalizeAddress(input)).toBe(c.normalized);
    });

    it('refuses a long input before decoding it, so it costs no more than a short one', () => {
        for (const c of V.cases.filter((c) => typeof c.input !== 'string' && c.input.count >= 8000)) {
            const input = text(c.input);
            const started = performance.now();
            expect(decodeAddress(input)).toBeNull();
            expect(normalizeAddress(input)).toBeNull();
            expect(verifySignature(input, 'Hello World', 'AA==')).toBe(false);
            expect(performance.now() - started, label(c.input)).toBeLessThan(250);
        }
    });
});
