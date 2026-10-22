import { normalizeAddress } from '@orangecheck/bip322';

/**
 * What an address field holds after an edit: a whole address in the one
 * spelling that verifies (a QR code's capitals lowercased, BIP-173), otherwise
 * the text as typed, so partial input stays editable. A challenge fetched for
 * the field then names the address the account is keyed by.
 */
export function addressInputValue(raw: string): string {
    return normalizeAddress(raw) ?? raw;
}
