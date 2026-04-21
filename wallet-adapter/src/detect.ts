import type { WalletId, WalletInfo } from './types';

interface UnisatGlobal {
    signMessage?: (message: string, type?: string) => Promise<string>;
    getAccounts?: () => Promise<string[]>;
}

interface XverseGlobal {
    request?: (method: string, params: unknown) => Promise<unknown>;
}

interface LeatherGlobal {
    request?: (method: string, params?: unknown) => Promise<unknown>;
}

interface WeblnGlobal {
    signMessage?: (message: string) => Promise<string | { signature: string }>;
    enable?: () => Promise<unknown>;
}

/**
 * Duck-typed checks against `window.*`. Each wallet uses a different global
 * name — we check the shape, not trust the name, so spoofing wrappers don't
 * appear as false positives.
 */
function detect(): Record<WalletId, boolean> {
    if (typeof window === 'undefined') {
        return { unisat: false, xverse: false, leather: false, alby: false, manual: true };
    }
    const w = window as unknown as {
        unisat?: UnisatGlobal;
        XverseProviders?: unknown;
        BitcoinProvider?: XverseGlobal; // Xverse also exposes this in some injections.
        LeatherProvider?: LeatherGlobal;
        btc?: LeatherGlobal; // Leather / Stacks Connect alias.
        webln?: WeblnGlobal;
    };
    return {
        unisat: typeof w.unisat?.signMessage === 'function',
        xverse: Boolean(w.XverseProviders) || typeof w.BitcoinProvider?.request === 'function',
        leather:
            typeof w.LeatherProvider?.request === 'function' ||
            typeof w.btc?.request === 'function',
        alby: typeof w.webln?.signMessage === 'function',
        manual: true,
    };
}

const WALLETS: Record<WalletId, Omit<WalletInfo, 'detected'>> = {
    unisat: {
        id: 'unisat',
        name: 'UniSat',
        installUrl: 'https://unisat.io',
    },
    xverse: {
        id: 'xverse',
        name: 'Xverse',
        installUrl: 'https://www.xverse.app',
    },
    leather: {
        id: 'leather',
        name: 'Leather',
        installUrl: 'https://leather.io',
    },
    alby: {
        id: 'alby',
        name: 'Alby',
        installUrl: 'https://getalby.com',
    },
    manual: {
        id: 'manual',
        name: 'Paste signature (Sparrow / Core / hardware)',
        isManual: true,
    },
};

/**
 * Returns every supported wallet with a `detected` flag. Use in UIs to show
 * "Install UniSat" vs "Sign with UniSat" depending on whether the extension
 * is present.
 *
 *   const wallets = detectWallets();
 *   wallets.find((w) => w.detected && !w.isManual)   // prefer installed ones
 */
export function detectWallets(): WalletInfo[] {
    const flags = detect();
    return (Object.keys(WALLETS) as WalletId[]).map((id) => ({
        ...WALLETS[id],
        detected: flags[id],
    }));
}

export function isWalletDetected(id: WalletId): boolean {
    return detect()[id];
}
