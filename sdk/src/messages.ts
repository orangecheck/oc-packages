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
        detail: 'The signature does not match the message and address. Common issues: (1) the message was not copied exactly, (2) a different address signed it, (3) the wallet signed on another network.',
        severity: 'error',
    },
    sig_unsupported_script: {
        label: 'Signature form not supported',
        detail: 'Your wallet made a BIP-322 full or proof-of-funds signature. Sign with a BIP-322 simple signature, or with legacy message signing, which every address type here accepts.',
        severity: 'error',
    },
    bond_confirmed: {
        label: 'Bitcoin bond confirmed',
        detail: 'Found confirmed UTXOs on the blockchain for reputation scoring.',
        severity: 'success',
    },
    bond_zero: {
        label: 'No confirmed bitcoin found',
        detail: 'This address has no confirmed UTXOs. Send some bitcoin to this address and wait for confirmation to establish a stake.',
        severity: 'warn',
    },
    bond_pending: {
        label: 'Pending transactions detected',
        detail: 'This address has unconfirmed transactions. Wait for confirmations before they count toward your stake.',
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
    not_yet_valid: {
        label: 'Not valid yet',
        detail: 'The message is dated ahead of this clock. It counts once that time arrives, or once a clock that is wrong is set right.',
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
