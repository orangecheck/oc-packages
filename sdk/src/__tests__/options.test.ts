/**
 * check() and verify() refuse an option they do not read. A misspelt
 * `minSats` would otherwise be ignored and the threshold would be 0; a
 * misspelt `expectedAud` would skip the audience check.
 */

import { describe, expect, it } from 'vitest';

import { check, type CheckParams } from '../check';
import type { VerifyOptions } from '../types';
import { verify } from '../verify';

describe('unknown options', () => {
    it('check() refuses a misspelt threshold instead of reading it as 0', async () => {
        const misspelt = { addr: 'bc1qexample', minsats: 100_000 } as unknown as CheckParams;
        await expect(check(misspelt)).rejects.toThrow(TypeError);
        await expect(check(misspelt)).rejects.toThrow(/unknown option minsats/);
    });

    it('check() refuses a misspelt verify option', async () => {
        const misspelt = {
            addr: 'bc1qexample',
            verifyOptions: { expectedAudience: 'https://site.example' },
        } as unknown as CheckParams;
        await expect(check(misspelt)).rejects.toThrow(/verifyOptions: unknown option expectedAudience/);
    });

    it('verify() refuses a misspelt option instead of skipping the check it names', async () => {
        const misspelt = { expectedAudience: 'https://site.example' } as unknown as VerifyOptions;
        await expect(verify({ addr: 'bc1qexample', msg: 'x', sig: 'y' }, misspelt)).rejects.toThrow(
            /unknown option expectedAudience/
        );
    });

    it('every option they read is accepted', async () => {
        const verifyOptions: VerifyOptions = {
            testMode: false,
            demoMode: false,
            expectedAud: 'https://site.example',
            esploraMainnetBase: 'https://esplora.example/api',
            esploraSignetBase: 'https://esplora.example/signet/api',
            esploraTestnetBase: 'https://esplora.example/testnet/api',
            coverSats: 1,
        };
        // No subject: check() answers bad_request without a lookup.
        const known: CheckParams = { minSats: 1, minDays: 1, relays: [], verifyOptions };
        await expect(check(known)).resolves.toMatchObject({ ok: false, reasons: ['bad_request'] });
        await expect(verify({ addr: '', msg: '', sig: '' }, verifyOptions)).resolves.toMatchObject({ ok: false });
    });
});
