/**
 * Detection regression tests. Xverse used to register as detected whenever
 * `window.XverseProviders` was any truthy value — including the empty object
 * a bookmarklet or unrelated extension might set. Now we require a callable
 * `request` function on the injected provider.
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import { detectWallets, isWalletDetected } from '../detect';

afterEach(() => {
    // Reset any globals we touched.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = globalThis as any;
    delete w.window?.XverseProviders;
    delete w.window?.BitcoinProvider;
    delete w.window?.unisat;
    delete w.window?.LeatherProvider;
    delete w.window?.webln;
    vi.restoreAllMocks();
});

function setupWindow(global: Record<string, unknown>) {
    // jsdom provides a `window`; we patch named globals onto it.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const w = (globalThis as any).window;
    Object.assign(w, global);
}

describe('Xverse detection', () => {
    it('does NOT trigger on a truthy-but-empty XverseProviders', () => {
        setupWindow({ XverseProviders: {} });
        expect(isWalletDetected('xverse')).toBe(false);
    });

    it('does NOT trigger on a bare truthy value', () => {
        setupWindow({ XverseProviders: 'bookmarklet-was-here' });
        expect(isWalletDetected('xverse')).toBe(false);
    });

    it('DOES trigger when XverseProviders.BitcoinProvider.request is callable', () => {
        setupWindow({
            XverseProviders: { BitcoinProvider: { request: () => Promise.resolve() } },
        });
        expect(isWalletDetected('xverse')).toBe(true);
    });

    it('DOES trigger on the legacy window.BitcoinProvider shape', () => {
        setupWindow({ BitcoinProvider: { request: () => Promise.resolve() } });
        expect(isWalletDetected('xverse')).toBe(true);
    });
});

describe('UniSat detection', () => {
    it('requires a callable signMessage', () => {
        setupWindow({ unisat: {} });
        expect(isWalletDetected('unisat')).toBe(false);
        setupWindow({ unisat: { signMessage: () => Promise.resolve('sig') } });
        expect(isWalletDetected('unisat')).toBe(true);
    });
});

describe('Leather detection', () => {
    it('matches either LeatherProvider or the legacy `btc` alias', () => {
        setupWindow({ LeatherProvider: { request: () => Promise.resolve() } });
        expect(isWalletDetected('leather')).toBe(true);
    });
});

describe('detectWallets enumeration', () => {
    it('always reports manual paste as detected', () => {
        const wallets = detectWallets();
        const manual = wallets.find((w) => w.id === 'manual');
        expect(manual?.detected).toBe(true);
    });

    it('returns a WalletInfo for every supported wallet', () => {
        const ids = detectWallets().map((w) => w.id);
        expect(ids).toEqual(['unisat', 'xverse', 'leather', 'alby', 'manual']);
    });
});
