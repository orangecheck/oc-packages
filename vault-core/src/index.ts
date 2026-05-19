/**
 * `@orangecheck/vault-core` — the conformance-pinned crypto, entry model,
 * `ocv://` secret-reference resolver, and transport-agnostic API client for
 * OC Vault (vault.ochk.io).
 *
 * Zero-knowledge by construction: the vault key is derived in-process from
 * the passphrase and never transmitted. See VAULT-DEVELOPER-PLATFORM.md.
 */

export {
    WrongPassphrase,
    decryptFields,
    encryptFields,
    generateEntryId,
    isLiveEntry,
    packEntryForCloud,
    toSummary,
    unpackEntryFromCloud,
    unwrapVaultKey,
    type VaultEntry,
    type VaultEntryFields,
    type VaultEntrySummary,
    type VaultEntryType,
    type WrappedKey,
} from './crypto';

export {
    PRIMARY_FIELD,
    fieldValue,
    type ApiKeyFields,
    type CardFields,
    type CustomField,
    type EnvFields,
    type FileFields,
    type IdentityFields,
    type KvFields,
    type NoteFields,
    type PasswordFields,
    type PasswordHistoryItem,
    type SeedPhraseFields,
    type TotpFields,
} from './fields';

export {
    entryMatchesPage,
    matchEntryToPage,
    originOf,
    registrableDomain,
    type OriginMatch,
} from './origin';

export { base32Decode, totp, type TotpOptions } from './totp';

export {
    OCV_SCHEME,
    SecretRefError,
    isSecretRef,
    parseSecretRef,
    resolveSecretRef,
    type SecretRef,
} from './refs';

export {
    EXPORT_FORMAT,
    EXPORT_VERSION,
    buildExport,
    parseExport,
    type VaultExport,
} from './export';

export {
    NotSignedIn,
    SyncNotPaid,
    VaultClient,
    type BlobRef,
    type FetchedBlob,
    type VaultClientOptions,
} from './sync';

export { OcVault, type DecryptedEntry } from './vault';
