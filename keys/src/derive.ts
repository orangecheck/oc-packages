// What each of an account's two secrets yields (README §2). Both are 32 random
// bytes read as BIP-39 entropy with an empty passphrase, so standard tools
// rebuild every key here from the 24 words.
import { addressFromPrivateKey } from '@orangecheck/bip322';
import { schnorr } from '@noble/curves/secp256k1';
import { hmac } from '@noble/hashes/hmac';
import { ripemd160 } from '@noble/hashes/legacy';
import { sha256, sha512 } from '@noble/hashes/sha2';
import { bech32 } from '@scure/base';
import { HDKey } from '@scure/bip32';
import { entropyToMnemonic, mnemonicToEntropy, mnemonicToSeedSync, validateMnemonic } from '@scure/bip39';
import { wordlist } from '@scure/bip39/wordlists/english';

import { concat, fromHex, toHex, utf8 } from './bytes';

/** The identity address: BIP-84, first receive address, always mainnet. */
export const IDENTITY_PATH = "m/84'/0'/0'/0/0";
/** The Nostr key: NIP-06, account 0. */
export const NOSTR_PATH = "m/44'/1237'/0'/0/0";
/** The wallet's on-chain account: BIP-84, coin 0 on mainnet, coin 1 on every test network. */
export const WALLET_ACCOUNT_PATH = { mainnet: "m/84'/0'/0'", testnet: "m/84'/1'/0'" } as const;
export type WalletNetwork = keyof typeof WALLET_ACCOUNT_PATH;

const BIP32_VERSIONS = {
    mainnet: { private: 0x0488ade4, public: 0x0488b21e },
    testnet: { private: 0x04358394, public: 0x043587cf },
} as const;
const HRP = { mainnet: 'bc', testnet: 'tb' } as const;

function secret32(s: Uint8Array, what: string): Uint8Array {
    if (!(s instanceof Uint8Array) || s.length !== 32) throw new TypeError(`${what} must be 32 bytes`);
    return s;
}

/** The 24 English words of a 32-byte secret. */
export function secretToMnemonic(secret: Uint8Array): string {
    return entropyToMnemonic(secret32(secret, 'secret'), wordlist);
}

/** The 32-byte secret behind 24 words, or null for anything else (a bad word, checksum or count). */
export function mnemonicToSecret(mnemonic: string): Uint8Array | null {
    if (typeof mnemonic !== 'string' || !validateMnemonic(mnemonic, wordlist)) return null;
    const e = mnemonicToEntropy(mnemonic, wordlist);
    return e.length === 32 ? e : null;
}

function seedOf(secret: Uint8Array): Uint8Array {
    return mnemonicToSeedSync(secretToMnemonic(secret), '');
}

function childPrivateKey(root: HDKey, path: string): Uint8Array {
    const key = root.derive(path).privateKey;
    if (!key) throw new Error(`no private key at ${path}`);
    return key;
}

/** The P2WPKH address of a 33-byte compressed public key. */
export function p2wpkhAddress(publicKey: Uint8Array, network: WalletNetwork = 'mainnet'): string {
    return bech32.encode(HRP[network], [0, ...bech32.toWords(ripemd160(sha256(publicKey)))]);
}

export interface Identity {
    /** P2WPKH, mainnet, at IDENTITY_PATH. */
    address: string;
    /** The Nostr public key: 32-byte x-only, lowercase hex. */
    nostr: string;
    npub: string;
}

export interface IdentityKeys extends Identity {
    /** The private key of `address`. */
    addressKey: Uint8Array;
    /** The Nostr private key. */
    nostrKey: Uint8Array;
}

/** Every key of the identity secret I, private ones included. */
export function identityKeys(identitySecret: Uint8Array): IdentityKeys {
    return identityKeysFromMnemonic(secretToMnemonic(secret32(identitySecret, 'identity secret')));
}

/** identityKeys for any BIP-39 phrase; for checking the paths against published vectors. */
export function identityKeysFromMnemonic(mnemonic: string): IdentityKeys {
    const root = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic, ''));
    const addressKey = childPrivateKey(root, IDENTITY_PATH);
    const nostrKey = childPrivateKey(root, NOSTR_PATH);
    const nostrPub = schnorr.getPublicKey(nostrKey);
    return {
        address: addressFromPrivateKey(addressKey, 'p2wpkh', 'mainnet'),
        nostr: toHex(nostrPub),
        npub: bech32.encode('npub', bech32.toWords(nostrPub)),
        addressKey,
        nostrKey,
    };
}

/** The public half of identityKeys. */
export function deriveIdentity(identitySecret: Uint8Array): Identity {
    const { address, nostr, npub } = identityKeys(identitySecret);
    return { address, nostr, npub };
}

export interface Wallet {
    network: WalletNetwork;
    /** The recovery phrase: W's 24 words. */
    mnemonic: string;
    accountPath: string;
    /** The master key's fingerprint, 8 hex digits. */
    fingerprint: string;
    /** The account's extended public key (xpub on mainnet, tpub on test networks). */
    accountXpub: string;
    /** The P2WPKH address at accountPath/chain/index; chain 0 receives, 1 is change. */
    address(chain: 0 | 1, index: number): string;
}

/** The standard on-chain wallet of the wallet secret W. */
export function deriveWallet(walletSecret: Uint8Array, network: WalletNetwork = 'mainnet'): Wallet {
    return walletFromMnemonic(secretToMnemonic(secret32(walletSecret, 'wallet secret')), network);
}

/** deriveWallet for any BIP-39 phrase; for checking the paths against published vectors. */
export function walletFromMnemonic(mnemonic: string, network: WalletNetwork = 'mainnet'): Wallet {
    const root = HDKey.fromMasterSeed(mnemonicToSeedSync(mnemonic, ''), BIP32_VERSIONS[network]);
    const accountPath = WALLET_ACCOUNT_PATH[network];
    const account = root.derive(accountPath);
    return {
        network,
        mnemonic,
        accountPath,
        fingerprint: root.fingerprint.toString(16).padStart(8, '0'),
        accountXpub: account.publicExtendedKey,
        address(chain, index) {
            if ((chain !== 0 && chain !== 1) || !Number.isInteger(index) || index < 0 || index >= 2 ** 31) {
                throw new RangeError('chain is 0 or 1 and index is a non-hardened child number');
            }
            const pub = account.deriveChild(chain).deriveChild(index).publicKey;
            if (!pub) throw new Error('no public key');
            return p2wpkhAddress(pub, network);
        },
    };
}

/** A mainnet receive address of W (chain 0) and its private key: what signs a wallet link (README §6). */
export function walletKey(walletSecret: Uint8Array, index = 0): { address: string; addressKey: Uint8Array } {
    if (!Number.isInteger(index) || index < 0 || index >= 2 ** 31) throw new RangeError('index is a non-hardened child number');
    const root = HDKey.fromMasterSeed(seedOf(secret32(walletSecret, 'wallet secret')), BIP32_VERSIONS.mainnet);
    const addressKey = childPrivateKey(root, `${WALLET_ACCOUNT_PATH.mainnet}/0/${index}`);
    return { address: addressFromPrivateKey(addressKey, 'p2wpkh', 'mainnet'), addressKey };
}

// Fedimint's client root (fedimint v0.13.0): Bip39RootSecretStrategy::to_root_secret
// is DerivableSecret::new_root(seed, b"Fedimint Client Salt"), an HKDF-SHA512
// extract whose 64-byte PRK is the secret. Child keys are HKDF-expand blocks.
const FEDIMINT_CLIENT_SALT = utf8('Fedimint Client Salt');
const CHILD_TAG = utf8('childkey');

function be64(n: number): Uint8Array {
    const out = new Uint8Array(8);
    new DataView(out.buffer).setBigUint64(0, BigInt(n));
    return out;
}

/** DerivableSecret::derive_hmac(info): HMAC-SHA512(prk, info || 0x01), a new PRK. */
function expandPrk(prk: Uint8Array, info: Uint8Array): Uint8Array {
    return hmac(sha512, prk, concat(info, Uint8Array.of(1)));
}

function childKey(prk: Uint8Array, child: number): Uint8Array {
    return expandPrk(prk, concat(CHILD_TAG, be64(child)));
}

function federationKey(prk: Uint8Array, federationId: Uint8Array): Uint8Array {
    return expandPrk(prk, concat(federationId.slice(0, 8), be64(0)));
}

/** The PRK of Fedimint's global root secret for W's phrase (Bip39RootSecretStrategy::to_root_secret). */
export function fedimintRootSecret(walletSecret: Uint8Array): Uint8Array {
    return hmac(sha512, FEDIMINT_CLIENT_SALT, seedOf(secret32(walletSecret, 'wallet secret')));
}

/**
 * The PRK the client is opened with for one federation when given
 * RootSecret::StandardDoubleDerive of the global root:
 * root/child(0)/federation_key(id)/child(0)/child(0) (get_default_client_secret).
 * `federationId` is the 64 hex digits Fedimint displays.
 */
export function fedimintClientSecret(walletSecret: Uint8Array, federationId: string): Uint8Array {
    const id = fromHex(federationId);
    if (!id || id.length !== 32) throw new TypeError('federation id must be 64 lowercase hex digits');
    const perFederation = childKey(fedimintRootSecret(walletSecret), 0);
    return childKey(childKey(federationKey(perFederation, id), 0), 0);
}
