/**
 * A domain is proven by one thing: its https://<domain>/.well-known/orangecheck.txt
 * file naming the attestation. No DNS record is read, so the instructions offer
 * no TXT method, and a miss is a plain miss.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getVerificationInstructions } from '../identity';
import { getDnsVerificationInstructions, verifyDnsIdentity } from '../identity/dns';

const ID = 'ab'.repeat(32);

afterEach(() => vi.unstubAllGlobals());

describe('domain proof', () => {
    it('instructions name only the well-known file, and no TXT record', () => {
        for (const text of [
            getDnsVerificationInstructions(ID, 'example.com'),
            getVerificationInstructions(ID, { protocol: 'dns', identifier: 'example.com' }),
        ]) {
            expect(text).toContain('https://example.com/.well-known/orangecheck.txt');
            expect(text).toContain(ID);
            expect(text).not.toMatch(/\bTXT\b/);
            expect(text).not.toMatch(/txt record/i);
            expect(text).not.toContain('_orangecheck.');
            expect(text).toMatch(/Only this file is checked\. DNS records are not read\./);
        }
    });

    it('reads only the well-known file: a hit says so, a miss reads nothing else', async () => {
        const fetch = vi.fn(async () => new Response(`Attestation ID: ${ID}\n`, { status: 200 }));
        vi.stubGlobal('fetch', fetch);
        await expect(verifyDnsIdentity(ID, 'example.com')).resolves.toEqual({
            verified: true,
            method: 'well-known',
            url: 'https://example.com/.well-known/orangecheck.txt',
        });

        fetch.mockImplementation(async () => new Response('not found', { status: 404 }));
        const miss = await verifyDnsIdentity(ID, 'example.com');
        expect(miss.verified).toBe(false);
        expect(miss.method).toBeUndefined();
        expect(fetch.mock.calls.map(([u]) => String(u))).toEqual([
            'https://example.com/.well-known/orangecheck.txt',
            'https://example.com/.well-known/orangecheck.txt',
        ]);
    });
});
