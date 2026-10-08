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
     * Bitcoin address the caller expects to sign under. Every signature is
     * verified against it before it is returned (`WrongAccountError` if not).
     */
    address: string;
    /**
     * How the `manual` adapter gets a signature: show `message` to the user (a
     * copy button and a paste field, say) and resolve with what they paste.
     * Reject, or resolve empty, to cancel. Without it, `manual` falls back to
     * `window.prompt`, which is deprecated and will be removed.
     */
    onManualSign?: (message: string) => Promise<string>;
    /**
     * Prompt text for the deprecated `window.prompt` fallback of the `manual`
     * adapter. Ignored when `onManualSign` is given.
     */
    manualPrompt?: string;
}
