// Builds test-vectors/keys-v1.json from fixed inputs with the reference
// implementation. Every input is derived from a published label, so every key
// here is a disclosed burn key: it guards nothing and must never hold funds.
// BIP-322 P2WPKH signatures (RFC 6979), BIP-340 with fixed aux bytes and
// AES-GCM under fixed nonces are deterministic, so a rebuild is byte-identical.
import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { gcm } from '@noble/ciphers/aes';
import { sha256 } from '@noble/hashes/sha2';

import { concat, toB64url, toHex, utf8 } from '../src/bytes';
import {
    deriveIdentity,
    deriveWallet,
    fedimintClientSecret,
    fedimintRootSecret,
    identityKeys,
    secretToMnemonic,
} from '../src/derive';
import { lockAad, lockWithPasskey, lockWithPhrase, passkeyKek, PRF_SALT, phraseKek } from '../src/lock';
import {
    bindingRecord,
    identitySign,
    recordId,
    retireRecord,
    takeoverRecord,
    type SignedRecord,
    type Since,
} from '../src/records';

const label = (s: string) => sha256(utf8(`oc-keys vector ${s}`));

/** Mainnet blocks (mempool.space and blockstream.info agree on each). */
export const HEADERS: Record<string, string> = {
    '977000': '00000000000000000001d9ed66ca43dc7765b3d6e9767304247fca17a4b085da',
    '977100': '00000000000000000000886598c890976f4cd4a493bb1c56d2021e8925525783',
    '977200': '000000000000000000016b62f76491f2263475ccb36871294632ace78c53a947',
};
const at = (h: number): Since => ({ height: h, block: HEADERS[String(h)]! });

const AUX = label('bip340 aux');
const FEDERATION_ID = toHex(label('federation id'));

const ISSUER_KEY = label('issuer');
const ISSUER = addressFromPrivateKey(ISSUER_KEY, 'p2wpkh');
const STRANGER_KEY = label('stranger issuer');
const STRANGER = addressFromPrivateKey(STRANGER_KEY, 'p2wpkh');

// A: custodial first, then taken over. B: passkey first. C: custodial, then retired.
const DID_A = 'did:oc:0123456789abcdef0123456789abcdef';
const DID_B = 'did:oc:fedcba9876543210fedcba9876543210';
const DID_C = 'did:oc:00112233445566778899aabbccddeeff';
const I_A = label('identity A');
const W_A = label('wallet A');
const I_B = label('identity B');
const W_B = label('wallet B');
const I_C = label('identity C');
const KEYS_A = identityKeys(I_A);
const KEYS_B = identityKeys(I_B);

const PRF_1 = label('prf passkey 1');
const PRF_2 = label('prf passkey 2');
const CRED_1 = label('credential 1').slice(0, 16);
const CRED_2 = label('credential 2').slice(0, 16);
const nonce = (s: string) => label(`nonce ${s}`).slice(0, 12);

function signed(record: string, issuerKey = ISSUER_KEY, identity?: typeof KEYS_A): SignedRecord {
    const env: SignedRecord = { record, issuer_sig: issuerSignAs(record, issuerKey) };
    if (identity) Object.assign(env, identitySign(record, identity, AUX));
    return env;
}

/** A BIP-322 signature by the given key's own P2WPKH address, whatever the record names. */
function issuerSignAs(record: string, key: Uint8Array): string {
    return signMessage(addressFromPrivateKey(key, 'p2wpkh'), record, key);
}

function flipBit(b64url: string): string {
    const bytes = Uint8Array.from(Buffer.from(b64url, 'base64url'));
    bytes[0]! ^= 0x01;
    return toB64url(bytes);
}

export function buildVectors(): unknown {
    const idA = deriveIdentity(I_A);
    const idB = deriveIdentity(I_B);
    const idC = deriveIdentity(I_C);

    // ── records ──
    const bindingA = bindingRecord({
        didOc: DID_A,
        address: idA.address,
        nostr: idA.nostr,
        custody: 'orangecheck',
        issuer: ISSUER,
        since: at(977000),
    });
    const takeoverA = takeoverRecord({
        didOc: DID_A,
        address: idA.address,
        nostr: idA.nostr,
        binding: recordId(bindingA),
        issuer: ISSUER,
        since: at(977100),
    });
    const bindingB = bindingRecord({
        didOc: DID_B,
        address: idB.address,
        nostr: idB.nostr,
        custody: 'self',
        issuer: ISSUER,
        since: at(977000),
    });
    const bindingC = bindingRecord({
        didOc: DID_C,
        address: idC.address,
        nostr: idC.nostr,
        custody: 'orangecheck',
        issuer: ISSUER,
        since: at(977000),
    });
    const retireC = retireRecord({
        didOc: DID_C,
        address: idC.address,
        binding: recordId(bindingC),
        issuer: ISSUER,
        since: at(977100),
        reason: 'wallet_linked',
    });

    const envBindingA = signed(bindingA);
    const envTakeoverA = signed(takeoverA, ISSUER_KEY, KEYS_A);
    const envBindingB = signed(bindingB, ISSUER_KEY, KEYS_B);
    const envBindingC = signed(bindingC);
    const envRetireC = signed(retireC);

    // ── negatives built from the positives ──
    const takeoverWrongAddressSig: SignedRecord = {
        ...envTakeoverA,
        address_sig: signMessage(idB.address, takeoverA, KEYS_B.addressKey),
    };
    const custodialSigned: SignedRecord = {
        ...envBindingA,
        address_sig: signMessage(idA.address, bindingA, KEYS_A.addressKey),
    };
    const strangerBinding = bindingRecord({
        didOc: DID_A,
        address: idA.address,
        nostr: idA.nostr,
        custody: 'orangecheck',
        issuer: STRANGER,
        since: at(977000),
    });
    const envStrangerBinding = signed(strangerBinding, STRANGER_KEY);
    const forgedIssuerSig: SignedRecord = {
        record: bindingA,
        issuer_sig: signMessage(STRANGER, bindingA, STRANGER_KEY),
    };
    const nostrWrongKey: SignedRecord = {
        ...envTakeoverA,
        nostr_sig: identitySign(
            takeoverRecord({
                didOc: DID_B,
                address: idB.address,
                nostr: idB.nostr,
                binding: recordId(bindingB),
                issuer: ISSUER,
                since: at(977100),
            }),
            KEYS_B,
            AUX
        ).nostr_sig,
    };
    const selfMissingAddressSig: SignedRecord = { record: bindingB, issuer_sig: envBindingB.issuer_sig };
    const offChain = bindingRecord({
        didOc: DID_A,
        address: idA.address,
        nostr: idA.nostr,
        custody: 'orangecheck',
        issuer: ISSUER,
        since: { height: 977000, block: HEADERS['977100']! },
    });
    const unknownHeight = bindingRecord({
        didOc: DID_A,
        address: idA.address,
        nostr: idA.nostr,
        custody: 'orangecheck',
        issuer: ISSUER,
        since: { height: 977300, block: HEADERS['977200']! },
    });
    // A self binding for A's address beside its custodial one, with no takeover.
    const flipA = bindingRecord({
        didOc: DID_A,
        address: idA.address,
        nostr: idA.nostr,
        custody: 'self',
        issuer: ISSUER,
        since: at(977100),
    });
    const takeoverWrongBinding = takeoverRecord({
        didOc: DID_A,
        address: idA.address,
        nostr: idA.nostr,
        binding: recordId(bindingC),
        issuer: ISSUER,
        since: at(977100),
    });
    const takeoverOfSelf = takeoverRecord({
        didOc: DID_B,
        address: idB.address,
        nostr: idB.nostr,
        binding: recordId(bindingB),
        issuer: ISSUER,
        since: at(977100),
    });
    const retireA = retireRecord({
        didOc: DID_A,
        address: idA.address,
        binding: recordId(bindingA),
        issuer: ISSUER,
        since: at(977200),
        reason: 'withdrawn',
    });
    const bindingLateA = bindingRecord({
        didOc: DID_A,
        address: idA.address,
        nostr: idA.nostr,
        custody: 'orangecheck',
        issuer: ISSUER,
        since: at(977200),
    });
    const takeoverEarlyA = takeoverRecord({
        didOc: DID_A,
        address: idA.address,
        nostr: idA.nostr,
        binding: recordId(bindingLateA),
        issuer: ISSUER,
        since: at(977100),
    });

    // ── locks ──
    const lockA1 = lockWithPasskey({
        identitySecret: I_A,
        walletSecret: W_A,
        prfOutput: PRF_1,
        credentialId: CRED_1,
        didOc: DID_A,
        nonce: nonce('A passkey 1'),
    });
    const lockA2 = lockWithPasskey({
        identitySecret: I_A,
        walletSecret: W_A,
        prfOutput: PRF_2,
        credentialId: CRED_2,
        didOc: DID_A,
        nonce: nonce('A passkey 2'),
    });
    const phraseA = lockWithPhrase({ identitySecret: I_A, walletSecret: W_A, didOc: DID_A, nonce: nonce('A phrase') });
    // Sealed correctly under passkey 1, but holding B's identity secret beside A's address.
    const mismatchHead = { method: 'passkey' as const, did_oc: DID_A, credential_id: toB64url(CRED_1), address: idA.address };
    const mismatchNonce = nonce('mismatch');
    const lockMismatch = {
        v: 1,
        ...mismatchHead,
        nonce: toB64url(mismatchNonce),
        ciphertext: toB64url(
            gcm(passkeyKek(PRF_1), mismatchNonce, lockAad(mismatchHead)).encrypt(concat(I_B, W_A))
        ),
    };

    // Sealed correctly under A's phrase, but holding B's identity secret beside A's address.
    const phraseHead = { method: 'phrase' as const, did_oc: DID_A, address: idA.address };
    const phraseMismatchNonce = nonce('phrase mismatch');
    const phraseMismatch = {
        v: 1,
        ...phraseHead,
        nonce: toB64url(phraseMismatchNonce),
        ciphertext: toB64url(gcm(phraseKek(W_A), phraseMismatchNonce, lockAad(phraseHead)).encrypt(I_B)),
    };

    const derivation = (id: string, I: Uint8Array, W: Uint8Array, description: string) => {
        const identity = deriveIdentity(I);
        const main = deriveWallet(W, 'mainnet');
        const test = deriveWallet(W, 'testnet');
        return {
            id,
            category: 'derivation',
            description,
            input: { identity_secret: toHex(I), wallet_secret: toHex(W), federation_id: FEDERATION_ID },
            expected: {
                identity: {
                    mnemonic: secretToMnemonic(I),
                    address: identity.address,
                    nostr: identity.nostr,
                    npub: identity.npub,
                },
                wallet: {
                    mnemonic: main.mnemonic,
                    fingerprint: main.fingerprint,
                    mainnet: {
                        account_path: main.accountPath,
                        account_xpub: main.accountXpub,
                        receive_0: main.address(0, 0),
                        change_0: main.address(1, 0),
                    },
                    testnet: {
                        account_path: test.accountPath,
                        account_xpub: test.accountXpub,
                        receive_0: test.address(0, 0),
                        change_0: test.address(1, 0),
                    },
                    fedimint_root_prk: toHex(fedimintRootSecret(W)),
                    fedimint_client_prk: toHex(fedimintClientSecret(W, FEDERATION_ID)),
                },
            },
        };
    };

    const resolved = (address: string, records: SignedRecord[]) => ({ address, records });

    return {
        version: 'oc-keys/v1',
        note: 'Every secret and private key here is a disclosed burn key, derived from a published label (keys/test/vectors.build.ts). None guards anything; never send funds to these addresses. Rebuild with `yarn vectors` in keys/.',
        constants: {
            prf_salt: toHex(PRF_SALT),
            passkey_kek_info: 'oc-keys/v1 passkey kek',
            phrase_kek_info: 'oc-keys/v1 phrase kek',
            identity_path: "m/84'/0'/0'/0/0",
            nostr_path: "m/44'/1237'/0'/0/0",
            fedimint_client_salt: 'Fedimint Client Salt',
        },
        chain: { headers: HEADERS },
        issuers: [ISSUER],
        burn_keys: {
            issuer: { private_key: toHex(ISSUER_KEY), address: ISSUER },
            stranger_issuer: { private_key: toHex(STRANGER_KEY), address: STRANGER },
            bip340_aux: toHex(AUX),
        },
        vectors: [
            derivation('kd01', I_A, W_A, 'account A: identity address, Nostr key, wallet and Fedimint root'),
            derivation('kd02', I_B, W_B, 'account B: the same derivations for another pair of secrets'),

            {
                id: 'kl01',
                category: 'lock',
                description: 'passkey 1 locks {I, W}; its PRF output opens it',
                input: {
                    identity_secret: toHex(I_A),
                    wallet_secret: toHex(W_A),
                    did_oc: DID_A,
                    credential_id: toB64url(CRED_1),
                    prf_output: toHex(PRF_1),
                    nonce: toB64url(nonce('A passkey 1')),
                },
                expected: {
                    kek: toHex(passkeyKek(PRF_1)),
                    aad: new TextDecoder().decode(lockAad(lockA1)),
                    copy: lockA1,
                    opens: { ok: true, identity_secret: toHex(I_A), wallet_secret: toHex(W_A) },
                },
            },
            {
                id: 'kl02',
                category: 'lock',
                description: 'a second passkey locks the same {I, W} and opens to the same secrets',
                input: {
                    identity_secret: toHex(I_A),
                    wallet_secret: toHex(W_A),
                    did_oc: DID_A,
                    credential_id: toB64url(CRED_2),
                    prf_output: toHex(PRF_2),
                    nonce: toB64url(nonce('A passkey 2')),
                },
                expected: {
                    kek: toHex(passkeyKek(PRF_2)),
                    aad: new TextDecoder().decode(lockAad(lockA2)),
                    copy: lockA2,
                    opens: { ok: true, identity_secret: toHex(I_A), wallet_secret: toHex(W_A) },
                },
            },
            {
                id: 'kl03',
                category: 'lock_phrase',
                description: "the recovery phrase is W's 24 words; it opens the copy of I locked under W",
                input: {
                    identity_secret: toHex(I_A),
                    wallet_secret: toHex(W_A),
                    did_oc: DID_A,
                    nonce: toB64url(nonce('A phrase')),
                },
                expected: {
                    phrase: secretToMnemonic(W_A),
                    kek: toHex(phraseKek(W_A)),
                    aad: new TextDecoder().decode(lockAad(phraseA)),
                    copy: phraseA,
                    opens: { ok: true, identity_secret: toHex(I_A), wallet_secret: toHex(W_A) },
                },
            },
            {
                id: 'kl04',
                category: 'open',
                description: "wrong credential: passkey 2's PRF output does not open passkey 1's copy",
                input: { copy: lockA1, prf_output: toHex(PRF_2) },
                expected: { ok: false, reason: 'lock_open_failed' },
            },
            {
                id: 'kl05',
                category: 'open',
                description: 'tampered ciphertext: one bit flipped',
                input: { copy: { ...lockA1, ciphertext: flipBit(lockA1.ciphertext) }, prf_output: toHex(PRF_1) },
                expected: { ok: false, reason: 'lock_open_failed' },
            },
            {
                id: 'kl06',
                category: 'open',
                description: 'wrong AAD: the copy is unchanged but a field it is bound to says something else',
                cases: [
                    {
                        name: 'another did:oc',
                        input: { copy: { ...lockA1, did_oc: DID_B }, prf_output: toHex(PRF_1) },
                        expected: { ok: false, reason: 'lock_open_failed' },
                    },
                    {
                        name: 'another identity address',
                        input: { copy: { ...lockA1, address: idB.address }, prf_output: toHex(PRF_1) },
                        expected: { ok: false, reason: 'lock_open_failed' },
                    },
                    {
                        name: "passkey 2's credential id",
                        input: { copy: { ...lockA1, credential_id: toB64url(CRED_2) }, prf_output: toHex(PRF_1) },
                        expected: { ok: false, reason: 'lock_open_failed' },
                    },
                ],
            },
            {
                id: 'kl07',
                category: 'open_phrase',
                description: 'the phrase copy opens only with W',
                cases: [
                    {
                        name: "B's valid phrase",
                        input: { copy: phraseA, phrase: secretToMnemonic(W_B) },
                        expected: { ok: false, reason: 'lock_open_failed' },
                    },
                    {
                        name: 'a bad checksum',
                        input: {
                            copy: phraseA,
                            phrase: secretToMnemonic(W_A).split(' ').reverse().join(' '),
                        },
                        expected: { ok: false, reason: 'phrase_invalid' },
                    },
                ],
            },
            {
                id: 'kl08',
                category: 'open',
                description: "sealed correctly, but the identity secret inside is not the copy's address",
                input: { copy: lockMismatch, prf_output: toHex(PRF_1) },
                expected: { ok: false, reason: 'bundle_address_mismatch' },
            },

            {
                id: 'kl09',
                category: 'open_phrase',
                description: "sealed correctly under A's phrase, but the identity secret inside is not the copy's address",
                cases: [
                    {
                        name: "B's identity secret",
                        input: { copy: phraseMismatch, phrase: secretToMnemonic(W_A) },
                        expected: { ok: false, reason: 'bundle_address_mismatch' },
                    },
                ],
            },

            {
                id: 'kr01',
                category: 'record',
                description: 'custodial binding: issuer-signed only, because a custodial key signs nothing',
                input: envBindingA,
                expected: { ok: true, id: recordId(bindingA), type: 'binding' },
            },
            {
                id: 'kr02',
                category: 'record',
                description: 'self binding (passkey first): issuer, identity address and Nostr key',
                input: envBindingB,
                expected: { ok: true, id: recordId(bindingB), type: 'binding' },
            },
            {
                id: 'kr03',
                category: 'record',
                description: "takeover of A's custodial binding",
                input: envTakeoverA,
                expected: { ok: true, id: recordId(takeoverA), type: 'takeover' },
            },
            {
                id: 'kr04',
                category: 'record',
                description: "retire of C's custodial binding",
                input: envRetireC,
                expected: { ok: true, id: recordId(retireC), type: 'retire' },
            },
            {
                id: 'kr05',
                category: 'record',
                description: "signature by the wrong address: the takeover's address_sig is B's",
                input: takeoverWrongAddressSig,
                expected: { ok: false, reason: 'address_sig_invalid' },
            },
            {
                id: 'kr06',
                category: 'record',
                description: 'a custodial binding carrying a signature by its own (custodial) key',
                input: custodialSigned,
                expected: { ok: false, reason: 'custodial_key_signed' },
            },
            {
                id: 'kr07',
                category: 'record',
                description: 'issued and signed by an issuer the verifier does not trust',
                input: envStrangerBinding,
                expected: { ok: false, reason: 'issuer_unknown' },
            },
            {
                id: 'kr08',
                category: 'record',
                description: "names the trusted issuer, but the issuer signature is another key's",
                input: forgedIssuerSig,
                expected: { ok: false, reason: 'issuer_sig_invalid' },
            },
            {
                id: 'kr09',
                category: 'record',
                description: 'not canonical text',
                cases: [
                    ['CRLF line ends', bindingA.replace(/\n/g, '\r\n')],
                    ['no final LF', bindingA.slice(0, -1)],
                    ['two final LFs', `${bindingA}\n`],
                    ['a padded value', bindingA.replace('custody: orangecheck', 'custody: orangecheck ')],
                    ['fields out of order', bindingA.replace(/(address: .*\n)(nostr: .*\n)/, '$2$1')],
                    ['capital custody', bindingA.replace('custody: orangecheck', 'custody: Orangecheck')],
                    ['height with a leading zero', bindingA.replace('since_height: 977000', 'since_height: 0977000')],
                    ['an unknown field', bindingA.replace('custody:', 'note: hi\ncustody:')],
                    ['uppercase address', bindingA.replace(idA.address, idA.address.toUpperCase())],
                    ['changed trust line', takeoverA.replace('cannot be proven', 'can be proven')],
                ].map(([name, record]) => ({
                    name,
                    input: { record, issuer_sig: issuerSignAs(record!, ISSUER_KEY) },
                    expected: { ok: false, reason: 'not_canonical' },
                })),
            },
            {
                id: 'kr10',
                category: 'record',
                description: "since: the named block must be the verifier's block at that height",
                cases: [
                    {
                        name: "977100's hash at height 977000",
                        input: signed(offChain),
                        expected: { ok: false, reason: 'since_not_on_chain' },
                    },
                    {
                        name: 'a height the verifier has no header for',
                        input: signed(unknownHeight),
                        expected: { ok: false, reason: 'since_unverified' },
                    },
                ],
            },
            {
                id: 'kr11',
                category: 'record',
                description: "the takeover's nostr_sig is by B's Nostr key",
                input: nostrWrongKey,
                expected: { ok: false, reason: 'nostr_sig_invalid' },
            },
            {
                id: 'kr12',
                category: 'record',
                description: 'a self binding with no identity signature',
                input: selfMissingAddressSig,
                expected: { ok: false, reason: 'address_sig_missing' },
            },

            {
                id: 'kc01',
                category: 'custody',
                description: 'a custodial binding alone: custodial',
                input: resolved(idA.address, [envBindingA]),
                expected: { ok: true, custody: 'orangecheck', born: 'orangecheck', binding: recordId(bindingA) },
            },
            {
                id: 'kc02',
                category: 'custody',
                description: 'a custodial binding and its takeover: self, since the takeover block',
                input: resolved(idA.address, [envTakeoverA, envBindingA]),
                expected: {
                    ok: true,
                    custody: 'self',
                    born: 'orangecheck',
                    binding: recordId(bindingA),
                    takeover: recordId(takeoverA),
                    takeover_since_height: 977100,
                },
            },
            {
                id: 'kc03',
                category: 'custody',
                description: 'a self binding alone: self from birth',
                input: resolved(idB.address, [envBindingB]),
                expected: { ok: true, custody: 'self', born: 'self', binding: recordId(bindingB) },
            },
            {
                id: 'kc04',
                category: 'custody',
                description: 'a custodial binding and its retire: retired',
                input: resolved(idC.address, [envBindingC, envRetireC]),
                expected: { ok: true, custody: 'retired', born: 'orangecheck', binding: recordId(bindingC) },
            },
            {
                id: 'kc05',
                category: 'custody',
                description: 'custody flip with no takeover: a self binding beside the custodial one',
                input: resolved(idA.address, [envBindingA, signed(flipA, ISSUER_KEY, KEYS_A)]),
                expected: { ok: false, reason: 'custody_flip_without_takeover' },
            },
            {
                id: 'kc06',
                category: 'custody',
                description: "a takeover naming another binding's id",
                input: resolved(idA.address, [envBindingA, signed(takeoverWrongBinding, ISSUER_KEY, KEYS_A)]),
                expected: { ok: false, reason: 'takeover_wrong_binding' },
            },
            {
                id: 'kc07',
                category: 'custody',
                description: 'a takeover of a binding that was never custodial',
                input: resolved(idB.address, [envBindingB, signed(takeoverOfSelf, ISSUER_KEY, KEYS_B)]),
                expected: { ok: false, reason: 'takeover_of_self_binding' },
            },
            {
                id: 'kc08',
                category: 'custody',
                description: 'a retire after a takeover: the key is the user’s, and orangecheck cannot retire it',
                input: resolved(idA.address, [envBindingA, envTakeoverA, signed(retireA)]),
                expected: { ok: false, reason: 'retire_after_takeover' },
            },
            {
                id: 'kc09',
                category: 'custody',
                description: 'a takeover whose since block is below its binding’s',
                input: resolved(idA.address, [signed(bindingLateA), signed(takeoverEarlyA, ISSUER_KEY, KEYS_A)]),
                expected: { ok: false, reason: 'takeover_before_binding' },
            },
            {
                id: 'kc10',
                category: 'custody',
                description: 'a record for another address in the set',
                input: resolved(idA.address, [envBindingA, envBindingB]),
                expected: { ok: false, reason: 'address_mismatch' },
            },

            {
                id: 'ks01',
                category: 'signature',
                description: 'custodial: every signature by the address is refused, anchored or not',
                input: { records: [envBindingA], address: idA.address },
                cases: [
                    { evidence: {}, expected: { accept: false, reason: 'custodial' } },
                    { evidence: { anchoredAt: 977200 }, expected: { accept: false, reason: 'custodial' } },
                ],
            },
            {
                id: 'ks02',
                category: 'signature',
                description:
                    "taken over at since 977100, the takeover anchored at 977110: before, after, or accepted on the takeover's trust",
                input: { records: [envBindingA, envTakeoverA], address: idA.address },
                cases: [
                    { evidence: { anchoredAt: 977000 }, expected: { accept: false, reason: 'before_takeover' } },
                    { evidence: { anchoredAt: 977100 }, expected: { accept: false, reason: 'before_takeover' } },
                    {
                        evidence: { madeAfter: 977110, takeoverAnchoredAt: 977110 },
                        expected: { accept: true, reason: 'after_takeover' },
                    },
                    {
                        evidence: { madeAfter: 977150, anchoredAt: 977160, takeoverAnchoredAt: 977110 },
                        expected: { accept: true, reason: 'after_takeover' },
                    },
                    {
                        evidence: { madeAfter: 977109, takeoverAnchoredAt: 977110 },
                        expected: { accept: true, reason: 'on_trust' },
                    },
                    { evidence: { anchoredAt: 977101 }, expected: { accept: true, reason: 'on_trust' } },
                    { evidence: { madeAfter: 977200 }, expected: { accept: true, reason: 'on_trust' } },
                    { evidence: {}, expected: { accept: true, reason: 'on_trust' } },
                ],
            },
            {
                id: 'ks03',
                category: 'signature',
                description: 'self from birth: accepted',
                input: { records: [envBindingB], address: idB.address },
                cases: [
                    { evidence: {}, expected: { accept: true, reason: 'self_born' } },
                    { evidence: { anchoredAt: 977000 }, expected: { accept: true, reason: 'self_born' } },
                ],
            },
            {
                id: 'ks04',
                category: 'signature',
                description: 'retired: refused',
                input: { records: [envBindingC, envRetireC], address: idC.address },
                cases: [{ evidence: {}, expected: { accept: false, reason: 'retired' } }],
            },
            {
                id: 'ks05',
                category: 'signature',
                description: 'evidence that cannot be true is refused, not ignored',
                input: { records: [envBindingA, envTakeoverA], address: idA.address },
                cases: [
                    {
                        evidence: { takeoverAnchoredAt: 977100 },
                        expected: { accept: false, reason: 'bad_evidence' },
                    },
                    {
                        evidence: { madeAfter: 977150, anchoredAt: 977150 },
                        expected: { accept: false, reason: 'bad_evidence' },
                    },
                    { evidence: { anchoredAt: -1 }, expected: { accept: false, reason: 'bad_evidence' } },
                ],
            },
        ],
    };
}
