/**
 * Regression tests for the signature-shape validation wrapper + the UniSat
 * no-silent-legacy-fallback change.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { getSigner } from '../sign';

afterEach(() => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = (globalThis as any).window;
    delete w.unisat;
    vi.restoreAllMocks();
});

describe('signature-shape validation wrapper', () => {
    function mockUnisat(returnValue: string | Promise<string>) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (globalThis as any).window.unisat = {
            signMessage: vi.fn(() =>
                returnValue instanceof Promise ? returnValue : Promise.resolve(returnValue)
            ),
        };
    }

    it('accepts a plausible base64 signature', async () => {
        mockUnisat('AkcwRAIgXyZabc+defGhi=');
        const sig = await getSigner('unisat', { address: 'bc1q' })('msg');
        expect(sig).toBe('AkcwRAIgXyZabc+defGhi=');
    });

    it('accepts a plausible hex signature', async () => {
        mockUnisat('a1b2c3d4'.repeat(16));
        await expect(getSigner('unisat', { address: 'bc1q' })('msg')).resolves.toBeTruthy();
    });

    it('rejects an HTML error page returned instead of a signature', async () => {
        mockUnisat('<!doctype html><html><body>Something went wrong</body></html>');
        await expect(getSigner('unisat', { address: 'bc1q' })('msg')).rejects.toThrow(
            /base64 or hex/i
        );
    });

    it('rejects the empty string', async () => {
        mockUnisat('');
        await expect(getSigner('unisat', { address: 'bc1q' })('msg')).rejects.toThrow(/empty/i);
    });

    it('rejects an absurdly long string', async () => {
        mockUnisat('A'.repeat(3000));
        await expect(getSigner('unisat', { address: 'bc1q' })('msg')).rejects.toThrow(/length/i);
    });

    it('propagates the wallet throw instead of silently falling back to ECDSA', async () => {
        mockUnisat(Promise.reject(new Error('User rejected')));
        await expect(getSigner('unisat', { address: 'bc1q' })('msg')).rejects.toThrow(
            /user rejected/i
        );
    });
});
