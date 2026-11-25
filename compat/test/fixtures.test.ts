import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/** The README's rule: no token, vouch or other JWS is committed, only what each one says. */
describe('the fixtures', () => {
    const dir = join(import.meta.dirname, '..', 'fixtures');
    const names = readdirSync(dir).filter((n) => n.endsWith('.json'));

    it('hold no compact JWS', () => {
        expect(names).toEqual(expect.arrayContaining(['email-account.json', 'me-email-account.json']));
        for (const name of names) {
            expect(readFileSync(join(dir, name), 'utf8'), name).not.toMatch(/eyJ[\w-]*\.[\w-]*\.[\w-]+/);
        }
    });
});
