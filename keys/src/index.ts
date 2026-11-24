// @orangecheck/keys: an account's two secrets, the lock, and the custody
// records. The reference implementation of README.md; unreleased.
export { fromB64url, fromHex, randomSecret, toB64url, toHex } from './bytes';
export {
    IDENTITY_PATH,
    NOSTR_PATH,
    WALLET_ACCOUNT_PATH,
    deriveIdentity,
    deriveWallet,
    fedimintClientSecret,
    fedimintRootSecret,
    identityKeys,
    mnemonicToSecret,
    p2wpkhAddress,
    secretToMnemonic,
} from './derive';
export type { Identity, IdentityKeys, Wallet, WalletNetwork } from './derive';
export {
    PRF_SALT,
    lockAad,
    lockWithPasskey,
    lockWithPhrase,
    openWithPasskey,
    openWithPhrase,
    passkeyKek,
    phraseKek,
} from './lock';
export type { LockMethod, LockedCopy, OpenFailure } from './lock';
export {
    RETIRE_REASONS,
    TAKEOVER_TRUST,
    bindingRecord,
    identitySign,
    identitySigns,
    isDidOc,
    isMainnetP2wpkh,
    issuerSign,
    judgeSignature,
    parseRecord,
    recordId,
    recordText,
    resolveCustody,
    retireRecord,
    takeoverRecord,
    verifyRecord,
} from './records';
export type {
    BindingFields,
    Custody,
    CustodyFailure,
    CustodyState,
    ParsedRecord,
    RecordFailure,
    RecordType,
    RetireFields,
    RetireReason,
    SignatureEvidence,
    SignatureVerdict,
    SignedRecord,
    Since,
    TakeoverFields,
    VerifiedRecord,
    VerifyContext,
} from './records';
