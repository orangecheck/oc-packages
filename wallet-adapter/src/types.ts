/**
 * Every supported wallet produces a signature the same way from our API's
 * perspective: we hand it a canonical message string, we get back a BIP-322
 * signature as a base64 or hex string.
 *
 * Individual wallet shims translate their quirky APIs into this shape.
 */
export type SignFn = (message: string) => Promise<string>;

export type WalletId =
    | 'unisat'
    | 'xverse'
    | 'leather'
    | 'alby'
    | 'okx'
    | 'phantom'
    | 'manual';

export interface WalletInfo {
    id: WalletId;
    /** Human-readable name for UI. */
    name: string;
    /** Home page for install prompts. */
    installUrl?: string;
    /** `true` when the wallet's browser extension is detected on window. */
    detected: boolean;
    /**
     * For the `manual` adapter, always true — it's the always-available fallback
     * for Sparrow / Bitcoin Core / hardware wallets that don't expose a browser
     * API. The UI prompts the user to paste a signature.
     */
    isManual?: boolean;
}

export interface SignOptions {
    /**
     * Bitcoin address the caller expects to sign under. Not all wallets use this
     * (UniSat ignores it), but some (Xverse, Leather) require it in their API.
     */
    address: string;
    /**
     * Prompt text for the `manual` adapter. Shown alongside the message so the
     * user knows what they're signing.
     */
    manualPrompt?: string;
}
