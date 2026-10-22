import type { Scheme } from '../types';

import { Buffer } from 'buffer';

/** A signature as base64: hex input is converted, anything else passes through. */
export function toBase64Maybe(sig: string): string {
    if (/^[0-9a-fA-F]+$/.test(sig) && sig.length % 2 === 0) {
        return Buffer.from(sig, 'hex').toString('base64');
    }
    return sig;
}

/**
 * The scheme a signature's bytes say it is, the same rule @orangecheck/bip322
 * verifies by: 65 bytes is a BIP-137 compact signature, whatever the address,
 * and anything else is BIP-322 simple. `null` for a BIP-322 full or
 * proof-of-funds signature, which is not supported.
 */
export function signatureScheme(sigBase64: string): Scheme | null {
    if (/^(ful|pof)/.test(sigBase64)) return null;
    if (sigBase64.startsWith('smp')) return 'bip322';
    return Buffer.from(sigBase64, 'base64').length === 65 ? 'legacy' : 'bip322';
}
