import type { SignFn, SignOptions, WalletId } from './types';

/**
 * Return a SignFn bound to a particular wallet. The returned function takes a
 * canonical message string and resolves to a BIP-322 signature.
 *
 *   const sign = getSigner('unisat', { address });
 *   const signature = await sign(challenge.message);
 *
 * Throws on unknown wallet IDs or when the wallet isn't available on window.
 */
export function getSigner(wallet: WalletId, opts: SignOptions): SignFn {
    switch (wallet) {
        case 'unisat':
            return signWithUnisat();
        case 'xverse':
            return signWithXverse(opts);
        case 'leather':
            return signWithLeather();
        case 'alby':
            return signWithAlby();
        case 'manual':
            return signManual(opts);
    }
}

function signWithUnisat(): SignFn {
    return async (message) => {
        const w = (
            globalThis as unknown as {
                window?: { unisat?: { signMessage?: (m: string, t?: string) => Promise<string> } };
            }
        ).window;
        if (!w?.unisat?.signMessage) throw new Error('UniSat wallet not found on window.unisat');
        // `bip322-simple` is the modern BIP-322 flow UniSat exposes. Fall back
        // to the default if the wallet rejects the type string.
        try {
            return await w.unisat.signMessage(message, 'bip322-simple');
        } catch {
            return await w.unisat.signMessage(message);
        }
    };
}

function signWithXverse(opts: SignOptions): SignFn {
    return async (message) => {
        const w = (
            globalThis as unknown as {
                window?: {
                    BitcoinProvider?: {
                        request?: (method: string, params: unknown) => Promise<unknown>;
                    };
                };
            }
        ).window;
        const provider = w?.BitcoinProvider;
        if (!provider?.request)
            throw new Error('Xverse wallet not found on window.BitcoinProvider');
        // Xverse's RPC returns { status, result: { signature, ... } }.
        const r = (await provider.request('signMessage', {
            address: opts.address,
            message,
            protocol: 'BIP322',
        })) as { status?: string; result?: { signature?: string } };
        if (r.status !== 'success' || !r.result?.signature) {
            throw new Error(`Xverse signMessage failed: ${r.status ?? 'unknown'}`);
        }
        return r.result.signature;
    };
}

function signWithLeather(): SignFn {
    return async (message) => {
        const w = (
            globalThis as unknown as {
                window?: {
                    LeatherProvider?: {
                        request?: (method: string, params?: unknown) => Promise<unknown>;
                    };
                    btc?: {
                        request?: (method: string, params?: unknown) => Promise<unknown>;
                    };
                };
            }
        ).window;
        const provider = w?.LeatherProvider ?? w?.btc;
        if (!provider?.request)
            throw new Error('Leather wallet not found on window.LeatherProvider');
        const r = (await provider.request('signMessage', { message, paymentType: 'p2tr' })) as {
            result?: { signature?: string };
        };
        if (!r.result?.signature) {
            throw new Error('Leather signMessage returned no signature');
        }
        return r.result.signature;
    };
}

function signWithAlby(): SignFn {
    return async (message) => {
        const w = (
            globalThis as unknown as {
                window?: {
                    webln?: {
                        enable?: () => Promise<unknown>;
                        signMessage?: (m: string) => Promise<string | { signature: string }>;
                    };
                };
            }
        ).window;
        if (!w?.webln?.signMessage) throw new Error('Alby / WebLN not found on window.webln');
        if (w.webln.enable) await w.webln.enable();
        const r = await w.webln.signMessage(message);
        // Alby variants return either the raw string or { signature }.
        if (typeof r === 'string') return r;
        if (r && typeof r === 'object' && typeof r.signature === 'string') return r.signature;
        throw new Error('Alby signMessage returned an unexpected shape');
    };
}

/**
 * Manual / paste fallback. Opens a browser prompt showing the canonical
 * message and asks the user to paste the signature. Works for Sparrow,
 * Bitcoin Core, hardware wallets via PSBT — anything that can produce a
 * BIP-322 or legacy signature out-of-band.
 *
 * In React apps, use `<OcWalletButton>` which renders a custom modal with a
 * copy-to-clipboard + proper textarea instead of browser prompts.
 */
function signManual(opts: SignOptions): SignFn {
    return async (message) => {
        if (typeof window === 'undefined') {
            throw new Error('Manual signing requires a browser environment');
        }
        const heading =
            opts.manualPrompt ??
            'Sign the following message in your wallet, then paste the signature:';
        const full = `${heading}\n\n--- MESSAGE START ---\n${message}\n--- MESSAGE END ---`;
        const sig = window.prompt(full);
        if (!sig) throw new Error('Manual signing cancelled');
        return sig.trim();
    };
}
