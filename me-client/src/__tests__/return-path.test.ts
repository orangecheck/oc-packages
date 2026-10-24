import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { safeReturnPath } from '../index';

// Shared with sdk-py's tests/test_return_path.py.
const V = JSON.parse(
    readFileSync(join(__dirname, '..', '..', 'test-vectors', 'return-path.json'), 'utf8')
) as { fallback: string; refused: string[]; kept: Array<{ in: string; out: string }> };

describe('safeReturnPath', () => {
    it.each(V.refused.map((raw) => [JSON.stringify(raw).slice(0, 40), raw]))(
        'answers the fallback for %s',
        (_, raw) => {
            expect(safeReturnPath(raw, V.fallback)).toBe(V.fallback);
            expect(safeReturnPath(raw, '/account')).toBe('/account');
        }
    );

    it.each(V.kept.map((k) => [k.in, k.out]))('keeps %s as %s', (input, out) => {
        expect(safeReturnPath(input, V.fallback)).toBe(out);
    });

    it('answers the fallback for anything that is not text, and defaults it to /', () => {
        for (const raw of [undefined, null, 42, ['/account'], { toString: () => '/account' }]) {
            expect(safeReturnPath(raw)).toBe('/');
        }
    });
});
