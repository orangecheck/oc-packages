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

interface OkxBitcoinGlobal {
    connect?: () => Promise<{ address: string; publicKey: string }>;
    signMessage?: (msg: string, type?: string) => Promise<string>;
}

interface PhantomBitcoinGlobal {
    requestAccounts?: () => Promise<Array<{ address: string; addressType: string }>>;
    signMessage?: (msg: Uint8Array, addressType?: string) => Promise<{ signature: Uint8Array }>;
}

/**
 * The wallets that can sign BIP-322 for an address. Alby is not one: WebLN's
 * signMessage signs with a Lightning node key, which never verifies for a
 * Bitcoin address, so listing it offered a button that could only fail.
 */
type ListedWalletId = Exclude<WalletId, 'alby'>;

/**
 * Duck-typed checks against `window.*`. Each wallet uses a different global
 * name — we check the shape, not trust the name, so spoofing wrappers don't
 * appear as false positives.
 */
function detect(): Record<ListedWalletId, boolean> {
    if (typeof window === 'undefined') {
        return {
            unisat: false,
            xverse: false,
            leather: false,
            okx: false,
            phantom: false,
            manual: true,
        };
    }
    const w = window as unknown as {
        unisat?: UnisatGlobal;
        XverseProviders?: { BitcoinProvider?: XverseGlobal } | unknown;
        BitcoinProvider?: XverseGlobal; // Xverse also exposes this in some injections.
        LeatherProvider?: LeatherGlobal;
        btc?: LeatherGlobal; // Leather / Stacks Connect alias.
        okxwallet?: { bitcoin?: OkxBitcoinGlobal };
        phantom?: { bitcoin?: PhantomBitcoinGlobal };
    };
    // Shape checks only. `Boolean(w.XverseProviders)` used to be enough, but
    // any bookmarklet or unrelated extension setting `window.XverseProviders = {}`
    // would register as Xverse and produce signing failures downstream. Require
    // a callable `request` function — same rule we use for every other wallet.
    const xverseFromProviders = (() => {
        const xp = w.XverseProviders;
        if (!xp || typeof xp !== 'object') return false;
        const bp = (xp as { BitcoinProvider?: XverseGlobal }).BitcoinProvider;
        return typeof bp?.request === 'function';
    })();
    return {
        unisat: typeof w.unisat?.signMessage === 'function',
        xverse: xverseFromProviders || typeof w.BitcoinProvider?.request === 'function',
        leather:
            typeof w.LeatherProvider?.request === 'function' ||
            typeof w.btc?.request === 'function',
        okx: typeof w.okxwallet?.bitcoin?.signMessage === 'function',
        phantom: typeof w.phantom?.bitcoin?.signMessage === 'function',
        manual: true,
    };
}

const WALLETS: Record<ListedWalletId, Omit<WalletInfo, 'detected'>> = {
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
    okx: {
        id: 'okx',
        name: 'OKX',
        installUrl: 'https://www.okx.com/web3',
    },
    phantom: {
        id: 'phantom',
        name: 'Phantom',
        installUrl: 'https://phantom.app',
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
    return (Object.keys(WALLETS) as ListedWalletId[]).map((id) => ({
        ...WALLETS[id],
        detected: flags[id],
    }));
}

/**
 * Every supported wallet as a server sees them: none installed, paste always
 * there. What a list shows before it can look at `window`, so its rows are
 * there from the first render and detection only changes their state.
 */
export function listedWallets(): WalletInfo[] {
    return (Object.keys(WALLETS) as ListedWalletId[]).map((id) => ({
        ...WALLETS[id],
        detected: id === 'manual',
    }));
}

export function isWalletDetected(id: WalletId): boolean {
    return id !== 'alby' && detect()[id];
}
