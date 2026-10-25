import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

import { ocAuthExpress, ocAuthHono, withOcAuth } from '../server';

/**
 * A `requireBond` that is not a floor throws when the adapter is made, as
 * auth-core's readBondNeed reads it. Shared with auth-core's
 * src/__tests__/bond-need.test.ts and sdk-py's tests/test_bond_need.py.
 */
type Case = { need: Record<string, unknown>; valid: boolean };
const V = JSON.parse(
    readFileSync(new URL('../../../auth-core/test-vectors/bond-need.json', import.meta.url), 'utf8')
) as { cases: Case[] };

const CAMEL: Record<string, string> = { min_sats: 'minSats', min_days: 'minDays', max_age_secs: 'maxAgeSecs' };
const special = (v: unknown) =>
    v !== null && typeof v === 'object' && '$number' in v ? Number((v as { $number: string }).$number) : v;
const requireBond = (c: Case) =>
    Object.fromEntries(Object.entries(c.need).map(([k, v]) => [CAMEL[k] ?? k, special(v)])) as never;

describe('requireBond (auth-core test-vectors/bond-need.json)', () => {
    it.each(V.cases.map((c) => [JSON.stringify(c.need), c] as const))('%s', (_name, c) => {
        const options = { audience: 'https://my-site.example', requireBond: requireBond(c) };
        const adapters = [
            () => withOcAuth(() => undefined, options),
            () => ocAuthExpress(options),
            () => ocAuthHono(options),
        ];
        for (const make of adapters) {
            if (c.valid) expect(make).not.toThrow();
            else expect(make).toThrow(TypeError);
        }
    });
});
