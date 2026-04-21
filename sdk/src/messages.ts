import type { StatusCode } from './types';

export type Severity = 'success' | 'info' | 'warn' | 'error';

export interface StatusMeta {
    label: string;
    detail?: string;
    severity: Severity;
}

export const STATUS_META: Record<StatusCode, StatusMeta> = {
    sig_ok_bip322: {
        label: 'Signature verified',
        detail: 'Your BIP-322 signature is valid and proves ownership of this address.',
        severity: 'success',
    },
    sig_ok_legacy: {
        label: 'Signature verified (legacy)',
        detail: 'Your legacy signature is valid and proves ownership of this address.',
        severity: 'success',
    },
    sig_invalid: {
        label: 'Signature verification failed',
        detail: 'The signature does not match the message and address. Common issues: (1) Message not copied exactly from Step 2, (2) Wrong wallet/address used, (3) Wallet does not support BIP-322 (Electrum does NOT support BIP-322 for SegWit addresses - use Sparrow Wallet instead). For testnet, ensure your wallet is in testnet mode.',
        severity: 'error',
    },
    sig_unsupported_script: {
        label: 'Wallet does not support BIP-322',
        detail: 'Your wallet generated a legacy signature, but your SegWit address (bc1/tb1) requires BIP-322 message signing. Please use a wallet that supports BIP-322 (like Sparrow Wallet or Bitcoin Core), or switch to a P2PKH address (starting with "1" for mainnet or "m"/"n" for testnet) if your wallet only supports legacy signing.',
        severity: 'error',
    },
    bond_confirmed: {
        label: 'Bitcoin bond confirmed',
        detail: 'Found confirmed UTXOs on the blockchain for reputation scoring.',
        severity: 'success',
    },
    bond_zero: {
        label: 'No confirmed bitcoin found',
        detail: 'This address has no confirmed UTXOs. Send some bitcoin to this address and wait for confirmation to establish a reputation score.',
        severity: 'warn',
    },
    bond_pending: {
        label: 'Pending transactions detected',
        detail: 'This address has unconfirmed transactions. Wait for confirmations before they count toward your reputation score.',
        severity: 'info',
    },
    bond_insufficient: {
        label: 'Insufficient bond amount',
        detail: 'The confirmed balance is less than the declared bond amount. The bond extension requires the address to hold at least the specified amount in confirmed UTXOs.',
        severity: 'error',
    },
    aud_mismatch: {
        label: 'Audience mismatch',
        detail: 'The message was signed for a different audience than expected. This may be intentional or indicate the signature is being used in the wrong context.',
        severity: 'warn',
    },
    expired: {
        label: 'Message expired',
        detail: 'This signature has passed its expiration date. Generate a new signature with a fresh message.',
        severity: 'error',
    },
    network_testmode: {
        label: 'Test network detected',
        detail: 'This signature uses testnet or signet. Test networks are for development only and cannot be verified in production mode.',
        severity: 'warn',
    },
    bad_request: {
        label: 'Verification error',
        detail: 'Unable to verify the signature due to invalid or inconsistent data. Please ensure the address in the message matches the address you entered, and try again.',
        severity: 'error',
    },
    decode_error: {
        label: 'Message format error',
        detail: 'The message could not be parsed. Ensure you copied the complete canonical message from Step 2 without modifications.',
        severity: 'error',
    },
    invalid_scheme: {
        label: 'Unsupported signing method',
        detail: 'The signing scheme is not supported. Please use BIP-322 or legacy Bitcoin message signing.',
        severity: 'error',
    },
    invalid_attestation_id: {
        label: 'Invalid attestation ID',
        detail: 'The attestation ID does not match the message hash. The attestation may have been tampered with.',
        severity: 'error',
    },
};
