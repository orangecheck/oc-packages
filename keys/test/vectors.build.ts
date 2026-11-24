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
    CUSTODIAL_TRUST,
    identitySign,
    issuerRecord,
    publicationTags,
    recordId,
    retireRecord,
    rotationSign,
    takeoverRecord,
    type SignedIssuerRecord,
    type SignedRecord,
    type Since,
} from '../src/records';

const label = (s: string) => sha256(utf8(`oc-keys vector ${s}`));

/** Mainnet blocks (mempool.space and blockstream.info agree on each). */
export const HEADERS: Record<string, string> = {
    '976900': '00000000000000000000c00783f0f06030c8d46616a43715335b7b30e5b7d8b1',
    '977000': '00000000000000000001d9ed66ca43dc7765b3d6e9767304247fca17a4b085da',
    '977100': '00000000000000000000886598c890976f4cd4a493bb1c56d2021e8925525783',
    '977200': '000000000000000000016b62f76491f2263475ccb36871294632ace78c53a947',
};
const at = (h: number): Since => ({ height: h, block: HEADERS[String(h)]! });

const AUX = label('bip340 aux');
const FEDERATION_ID = toHex(label('federation id'));

// The issuer here is a placeholder burn key: the spec names the real one, and
// OLD_ISSUER is the one it took over from.
const ISSUER_KEY = label('issuer');
const ISSUER = addressFromPrivateKey(ISSUER_KEY, 'p2wpkh');
const OLD_ISSUER_KEY = label('old issuer');
const OLD_ISSUER = addressFromPrivateKey(OLD_ISSUER_KEY, 'p2wpkh');
const STRANGER_KEY = label('stranger issuer');
const STRANGER = addressFromPrivateKey(STRANGER_KEY, 'p2wpkh');

// A: custodial first, then taken over. B: passkey first. C: custodial, then
// retired. D: custodial, bound by the old issuer. E: no record at all.
const DID_A = 'did:oc:0123456789abcdef0123456789abcdef';
const DID_B = 'did:oc:fedcba9876543210fedcba9876543210';
const DID_C = 'did:oc:00112233445566778899aabbccddeeff';
const DID_D = 'did:oc:0f1e2d3c4b5a69788796a5b4c3d2e1f0';
const I_A = label('identity A');
const W_A = label('wallet A');
const I_B = label('identity B');
const W_B = label('wallet B');
const I_C = label('identity C');
const I_D = label('identity D');
const I_E = label('identity E');
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
    const idD = deriveIdentity(I_D);
    const idE = deriveIdentity(I_E);

    // ── records ──
    const bind = (id: typeof idA, didOc: string, keyHolder: 'orangecheck' | 'user', since: Since, issuer = ISSUER) =>
        bindingRecord({ didOc, address: id.address, nostr: id.nostr, keyHolder, issuer, since });
    const takeOver = (id: typeof idA, didOc: string, binding: string, since: Since) =>
        takeoverRecord({ didOc, address: id.address, nostr: id.nostr, binding, issuer: ISSUER, since });

    const bindingA = bind(idA, DID_A, 'orangecheck', at(977000));
    const takeoverA = takeOver(idA, DID_A, recordId(bindingA), at(977100));
    const bindingB = bind(idB, DID_B, 'user', at(977000));
    const bindingC = bind(idC, DID_C, 'orangecheck', at(977000));
    const retireC = retireRecord({
        didOc: DID_C,
        address: idC.address,
        binding: recordId(bindingC),
        issuer: ISSUER,
        since: at(977100),
        reason: 'wallet_linked',
    });
    // D was bound by the issuer before the current one, before that issuer handed over.
    const bindingD = bind(idD, DID_D, 'orangecheck', at(977000), OLD_ISSUER);

    const envBindingA = signed(bindingA);
    const envTakeoverA = signed(takeoverA, ISSUER_KEY, KEYS_A);
    const envBindingB = signed(bindingB, ISSUER_KEY, KEYS_B);
    const envBindingC = signed(bindingC);
    const envRetireC = signed(retireC);
    const envBindingD = signed(bindingD, OLD_ISSUER_KEY);

    // The issuer record: the old issuer hands over to the current one.
    const rotation = issuerRecord({ old: OLD_ISSUER, new: ISSUER, since: at(977000) });
    const envRotation: SignedIssuerRecord = { record: rotation, ...rotationSign(rotation, OLD_ISSUER_KEY, ISSUER_KEY) };
    const ROTATION_ANCHOR = 977002;

    // The anchors the vectors' verifier checked (OpenTimestamps, against its own headers).
    const ANCHOR = { bindingA: 977003, takeoverA: 977105, bindingB: 977004, bindingC: 977003, retireC: 977104 };

    // ── negatives built from the positives ──
    const takeoverWrongAddressSig: SignedRecord = {
        ...envTakeoverA,
        address_sig: signMessage(idB.address, takeoverA, KEYS_B.addressKey),
    };
    const custodialSigned: SignedRecord = {
        ...envBindingA,
        address_sig: signMessage(idA.address, bindingA, KEYS_A.addressKey),
    };
    const strangerBinding = bind(idA, DID_A, 'orangecheck', at(977000), STRANGER);
    const envStrangerBinding = signed(strangerBinding, STRANGER_KEY);
    const forgedIssuerSig: SignedRecord = {
        record: bindingA,
        issuer_sig: signMessage(STRANGER, bindingA, STRANGER_KEY),
    };
    const nostrWrongKey: SignedRecord = {
        ...envTakeoverA,
        nostr_sig: identitySign(takeOver(idB, DID_B, recordId(bindingB), at(977100)), KEYS_B, AUX).nostr_sig,
    };
    const { nostr_sig: _dropped, ...takeoverStripped } = envTakeoverA;
    const userMissingAddressSig: SignedRecord = { record: bindingB, issuer_sig: envBindingB.issuer_sig };
    const offChain = bind(idA, DID_A, 'orangecheck', { height: 977000, block: HEADERS['977100']! });
    const unknownHeight = bind(idA, DID_A, 'orangecheck', { height: 977300, block: HEADERS['977200']! });
    // Signed by the current issuer, but naming a block from before its term began.
    const tooEarly = bind(idA, DID_A, 'orangecheck', at(976900));
    // A user binding for A's address beside its custodial one, with no takeover between.
    const flipA = bind(idA, DID_A, 'user', at(977100));
    const takeoverOfUser = takeOver(idB, DID_B, recordId(bindingB), at(977100));
    const takeoverOfMissing = takeOver(idA, DID_A, recordId(bindingC), at(977100));
    const retireA = retireRecord({
        didOc: DID_A,
        address: idA.address,
        binding: recordId(bindingA),
        issuer: ISSUER,
        since: at(977200),
        reason: 'withdrawn',
    });
    const retireEarlyA = retireRecord({
        didOc: DID_A,
        address: idA.address,
        binding: recordId(bindingA),
        issuer: ISSUER,
        since: at(977000),
        reason: 'withdrawn',
    });
    const bindingLateA = bind(idA, DID_A, 'orangecheck', at(977200));
    const takeoverEarlyA = takeOver(idA, DID_A, recordId(bindingLateA), at(977100));
    // Issuer records that must not be followed.
    const strangerRotation = issuerRecord({ old: STRANGER, new: ISSUER, since: at(977000) });
    const envStrangerRotation: SignedIssuerRecord = {
        record: strangerRotation,
        ...rotationSign(strangerRotation, STRANGER_KEY, ISSUER_KEY),
    };
    const backRotation = issuerRecord({ old: ISSUER, new: OLD_ISSUER, since: at(977100) });
    const envBackRotation: SignedIssuerRecord = {
        record: backRotation,
        ...rotationSign(backRotation, ISSUER_KEY, OLD_ISSUER_KEY),
    };
    const offChainRotation = issuerRecord({ old: OLD_ISSUER, new: ISSUER, since: { height: 977000, block: HEADERS['977100']! } });
    const envOffChainRotation: SignedIssuerRecord = {
        record: offChainRotation,
        ...rotationSign(offChainRotation, OLD_ISSUER_KEY, ISSUER_KEY),
    };
    const envForgedRotation: SignedIssuerRecord = {
        ...envRotation,
        new_sig: signMessage(STRANGER, rotation, STRANGER_KEY),
    };

    const found = (records: [unknown, number?][], complete = true) => ({
        complete,
        records: records.map(([envelope, anchoredAt]) => (anchoredAt === undefined ? { envelope } : { envelope, anchoredAt })),
    });
    const A_SET = found([
        [envBindingA, ANCHOR.bindingA],
        [envTakeoverA, ANCHOR.takeoverA],
    ]);

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
        issuer: {
            note: 'A placeholder for the issuer address the spec names. Every record and key-holder vector is checked against the terms this name and these records resolve to (ki01).',
            named: ISSUER,
            records: [{ envelope: envRotation, anchoredAt: ROTATION_ANCHOR }],
        },
        burn_keys: {
            issuer: { private_key: toHex(ISSUER_KEY), address: ISSUER },
            old_issuer: { private_key: toHex(OLD_ISSUER_KEY), address: OLD_ISSUER },
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
                description: 'custodial binding: issuer-signed only, because the key orangecheck holds signs nothing',
                input: { envelope: envBindingA, anchoredAt: ANCHOR.bindingA },
                expected: { ok: true, id: recordId(bindingA), type: 'binding' },
            },
            {
                id: 'kr02',
                category: 'record',
                description: 'user binding (passkey first): issuer, identity address and Nostr key',
                input: { envelope: envBindingB },
                expected: { ok: true, id: recordId(bindingB), type: 'binding' },
            },
            {
                id: 'kr03',
                category: 'record',
                description: "takeover of A's custodial binding",
                input: { envelope: envTakeoverA, anchoredAt: ANCHOR.takeoverA },
                expected: { ok: true, id: recordId(takeoverA), type: 'takeover' },
            },
            {
                id: 'kr04',
                category: 'record',
                description: "retire of C's custodial binding",
                input: { envelope: envRetireC },
                expected: { ok: true, id: recordId(retireC), type: 'retire' },
            },
            {
                id: 'kr05',
                category: 'record',
                description: "signature by the wrong address: the takeover's address_sig is B's",
                input: { envelope: takeoverWrongAddressSig },
                expected: { ok: false, reason: 'address_sig_invalid', issuerSigned: true },
            },
            {
                id: 'kr06',
                category: 'record',
                description: 'a custodial binding carrying a signature by the key orangecheck holds',
                input: { envelope: custodialSigned },
                expected: { ok: false, reason: 'custodial_key_signed', issuerSigned: true },
            },
            {
                id: 'kr07',
                category: 'record',
                description: 'issued and signed by an issuer the verifier does not trust',
                input: { envelope: envStrangerBinding },
                expected: { ok: false, reason: 'issuer_unknown', issuerSigned: false },
            },
            {
                id: 'kr08',
                category: 'record',
                description: "names the trusted issuer, but the issuer signature is another key's",
                input: { envelope: forgedIssuerSig },
                expected: { ok: false, reason: 'issuer_sig_invalid', issuerSigned: false },
            },
            {
                id: 'kr09',
                category: 'record',
                description: 'not canonical text',
                cases: [
                    ['CRLF line ends', bindingA.replace(/\n/g, '\r\n')],
                    ['no final LF', bindingA.slice(0, -1)],
                    ['two final LFs', `${bindingA}\n`],
                    ['a padded value', bindingA.replace('key_holder: orangecheck', 'key_holder: orangecheck ')],
                    ['fields out of order', bindingA.replace(/(address: .*\n)(nostr: .*\n)/, '$2$1')],
                    ['capital key holder', bindingA.replace('key_holder: orangecheck', 'key_holder: Orangecheck')],
                    ['the funds word in place of the key holder', bindingA.replace('key_holder: orangecheck', 'custody: orangecheck')],
                    ['height with a leading zero', bindingA.replace('since_height: 977000', 'since_height: 0977000')],
                    ['an unknown field', bindingA.replace('key_holder:', 'note: hi\nkey_holder:')],
                    ['uppercase address', bindingA.replace(idA.address, idA.address.toUpperCase())],
                    ['a custodial binding without its trust line', bindingA.replace(/trust: .*\n/, '')],
                    ['a user binding with the custodial trust line', `${bindingB}trust: ${CUSTODIAL_TRUST}\n`],
                    ['changed takeover trust line', takeoverA.replace('cannot be proven', 'can be proven')],
                    ['an issuer record as an address record', rotation],
                ].map(([name, record]) => ({
                    name,
                    input: { envelope: { record, issuer_sig: issuerSignAs(record!, ISSUER_KEY) } },
                    expected: { ok: false, reason: 'not_canonical', issuerSigned: false },
                })),
            },
            {
                id: 'kr10',
                category: 'record',
                description: "since: the named block must be the verifier's block at that height",
                cases: [
                    {
                        name: "977100's hash at height 977000",
                        input: { envelope: signed(offChain) },
                        expected: { ok: false, reason: 'since_not_on_chain', issuerSigned: true },
                    },
                    {
                        name: 'a height the verifier has no header for',
                        input: { envelope: signed(unknownHeight) },
                        expected: { ok: false, reason: 'since_unverified', issuerSigned: true },
                    },
                ],
            },
            {
                id: 'kr11',
                category: 'record',
                description: "the takeover's nostr_sig is by B's Nostr key",
                input: { envelope: nostrWrongKey },
                expected: { ok: false, reason: 'nostr_sig_invalid', issuerSigned: true },
            },
            {
                id: 'kr12',
                category: 'record',
                description: 'a user binding with no identity signature',
                input: { envelope: userMissingAddressSig },
                expected: { ok: false, reason: 'address_sig_missing', issuerSigned: true },
            },
            {
                id: 'kr13',
                category: 'record',
                description: `issuer terms: the old issuer's record counts only where its anchor is at or below the hand-over's (${ROTATION_ANCHOR}); the current issuer's only from the hand-over's since block`,
                cases: [
                    {
                        name: 'old issuer, anchored before the hand-over was',
                        input: { envelope: envBindingD, anchoredAt: 977001 },
                        expected: { ok: true, id: recordId(bindingD), type: 'binding' },
                    },
                    {
                        name: 'old issuer, anchored at the same block',
                        input: { envelope: envBindingD, anchoredAt: ROTATION_ANCHOR },
                        expected: { ok: true, id: recordId(bindingD), type: 'binding' },
                    },
                    {
                        name: 'old issuer, anchored after',
                        input: { envelope: envBindingD, anchoredAt: 977010 },
                        expected: { ok: false, reason: 'issuer_retired', issuerSigned: false },
                    },
                    {
                        name: 'old issuer, no anchor',
                        input: { envelope: envBindingD },
                        expected: { ok: false, reason: 'issuer_retired', issuerSigned: false },
                    },
                    {
                        name: 'current issuer, a since block before its term',
                        input: { envelope: signed(tooEarly) },
                        expected: { ok: false, reason: 'issuer_not_yet', issuerSigned: false },
                    },
                ],
            },
            {
                id: 'kr14',
                category: 'record',
                description: 'an anchor at or below the since block cannot be',
                input: { envelope: envBindingA, anchoredAt: 977000 },
                expected: { ok: false, reason: 'bad_anchor', issuerSigned: true },
            },

            {
                id: 'ki01',
                category: 'issuers',
                description: 'the named issuer and its hand-over record: the old issuer before it, until the hand-over',
                input: { named: ISSUER, records: [{ envelope: envRotation, anchoredAt: ROTATION_ANCHOR }] },
                expected: {
                    ok: true,
                    terms: [
                        { address: OLD_ISSUER, from: 0, until: { since: 977000, anchoredAt: ROTATION_ANCHOR } },
                        { address: ISSUER, from: 977000 },
                    ],
                },
            },
            {
                id: 'ki02',
                category: 'issuers',
                description: 'a verifier that still names the old issuer follows the hand-over to the current one',
                input: { named: OLD_ISSUER, records: [{ envelope: envRotation, anchoredAt: ROTATION_ANCHOR }] },
                expected: {
                    ok: true,
                    terms: [
                        { address: OLD_ISSUER, from: 0, until: { since: 977000, anchoredAt: ROTATION_ANCHOR } },
                        { address: ISSUER, from: 977000 },
                    ],
                },
            },
            {
                id: 'ki03',
                category: 'issuers',
                description: 'a record the new issuer did not sign is ignored',
                input: { named: ISSUER, records: [{ envelope: envForgedRotation, anchoredAt: ROTATION_ANCHOR }] },
                expected: { ok: true, terms: [{ address: ISSUER, from: 0 }] },
            },
            {
                id: 'ki04',
                category: 'issuers',
                description: 'two hand-overs to the same issuer: refused',
                input: {
                    named: ISSUER,
                    records: [{ envelope: envRotation, anchoredAt: ROTATION_ANCHOR }, { envelope: envStrangerRotation }],
                },
                expected: { ok: false, reason: 'conflicting_issuer_records' },
            },
            {
                id: 'ki05',
                category: 'issuers',
                description: 'a hand-over and one back: refused',
                input: { named: ISSUER, records: [{ envelope: envRotation }, { envelope: envBackRotation }] },
                expected: { ok: false, reason: 'issuer_loop' },
            },
            {
                id: 'ki06',
                category: 'issuers',
                description: 'a hand-over signed by both whose since block is not on the chain: refused, not ignored',
                input: { named: ISSUER, records: [{ envelope: envOffChainRotation }] },
                expected: { ok: false, reason: 'issuer_record_unverified' },
            },

            {
                id: 'kh01',
                category: 'key_holder',
                description: 'a custodial binding alone: orangecheck holds the key',
                input: { address: idA.address, lookup: found([[envBindingA, ANCHOR.bindingA]]) },
                expected: { status: 'bound', born: 'orangecheck', holder: 'orangecheck', binding: recordId(bindingA) },
            },
            {
                id: 'kh02',
                category: 'key_holder',
                description: 'a custodial binding and its takeover: the user holds the key, and orangecheck held it until the takeover',
                input: { address: idA.address, lookup: A_SET },
                expected: {
                    status: 'bound',
                    born: 'orangecheck',
                    holder: 'user',
                    binding: recordId(bindingA),
                    takeover: recordId(takeoverA),
                    takeover_since: 977100,
                    takeover_anchored_at: ANCHOR.takeoverA,
                },
            },
            {
                id: 'kh03',
                category: 'key_holder',
                description: 'a user binding alone: the user from the start',
                input: { address: idB.address, lookup: found([[envBindingB, ANCHOR.bindingB]]) },
                expected: { status: 'bound', born: 'user', holder: 'user', binding: recordId(bindingB) },
            },
            {
                id: 'kh04',
                category: 'key_holder',
                description: 'a custodial binding and its retire: retired',
                input: {
                    address: idC.address,
                    lookup: found([
                        [envBindingC, ANCHOR.bindingC],
                        [envRetireC, ANCHOR.retireC],
                    ]),
                },
                expected: {
                    status: 'bound',
                    born: 'orangecheck',
                    holder: 'retired',
                    binding: recordId(bindingC),
                    retire: recordId(retireC),
                    retire_reason: 'wallet_linked',
                },
            },
            {
                id: 'kh05',
                category: 'key_holder',
                description: 'no record, and the read reached the floor: plain Bitcoin',
                input: { address: idE.address, lookup: found([]) },
                expected: { status: 'unbound' },
            },
            {
                id: 'kh06',
                category: 'key_holder',
                description: 'a bound address whose record cannot be fetched: refused',
                cases: [
                    {
                        name: 'the read did not reach the floor',
                        input: { address: idA.address, lookup: found([], false) },
                        expected: { status: 'refused', reason: 'unavailable' },
                    },
                    {
                        name: "the account's did:oc names a binding no relay served",
                        input: { address: idA.address, lookup: found([]), namedBinding: recordId(bindingA) },
                        expected: { status: 'refused', reason: 'named_binding_missing' },
                    },
                    {
                        name: 'the did:oc names a binding other than the one served',
                        input: {
                            address: idA.address,
                            lookup: found([[envBindingA, ANCHOR.bindingA]]),
                            namedBinding: recordId(bindingC),
                        },
                        expected: { status: 'refused', reason: 'named_binding_missing' },
                    },
                    {
                        name: 'a read short of the floor that still found the binding',
                        input: { address: idA.address, lookup: found([[envBindingA, ANCHOR.bindingA]], false) },
                        expected: {
                            status: 'bound',
                            born: 'orangecheck',
                            holder: 'orangecheck',
                            binding: recordId(bindingA),
                        },
                    },
                ],
            },
            {
                id: 'kh07',
                category: 'key_holder',
                description: 'a takeover with no binding before it: refused',
                cases: [
                    {
                        name: 'a takeover alone',
                        input: { address: idA.address, lookup: found([[envTakeoverA, ANCHOR.takeoverA]]) },
                        expected: { status: 'refused', reason: 'takeover_without_binding' },
                    },
                    {
                        name: "a takeover naming a binding that is not this address's",
                        input: {
                            address: idA.address,
                            lookup: found([[envBindingA], [signed(takeoverOfMissing, ISSUER_KEY, KEYS_A)]]),
                        },
                        expected: { status: 'refused', reason: 'takeover_without_binding' },
                    },
                ],
            },
            {
                id: 'kh08',
                category: 'key_holder',
                description: 'a record the issuer signed but no copy of which verifies here: refused, not read as absent',
                cases: [
                    {
                        name: 'the only copy of the takeover lost its Nostr signature',
                        input: { address: idA.address, lookup: found([[envBindingA], [takeoverStripped]]) },
                        expected: { status: 'refused', reason: 'record_unverified' },
                    },
                    {
                        name: 'the same, beside a good copy: the good copy counts',
                        input: { address: idA.address, lookup: found([[envBindingA], [takeoverStripped], [envTakeoverA]]) },
                        expected: {
                            status: 'bound',
                            born: 'orangecheck',
                            holder: 'user',
                            binding: recordId(bindingA),
                            takeover: recordId(takeoverA),
                            takeover_since: 977100,
                        },
                    },
                    {
                        name: "a binding whose since block the verifier's chain does not have yet",
                        input: { address: idA.address, lookup: found([[signed(unknownHeight)]]) },
                        expected: { status: 'refused', reason: 'record_unverified' },
                    },
                ],
            },
            {
                id: 'kh09',
                category: 'key_holder',
                description: 'records no trusted issuer signed are ignored: anyone can publish one',
                cases: [
                    {
                        name: "a stranger's binding alone: plain Bitcoin",
                        input: { address: idA.address, lookup: found([[envStrangerBinding], [forgedIssuerSig]]) },
                        expected: { status: 'unbound' },
                    },
                    {
                        name: "a stranger's binding beside the real one",
                        input: { address: idA.address, lookup: found([[envStrangerBinding], [envBindingA]]) },
                        expected: { status: 'bound', born: 'orangecheck', holder: 'orangecheck', binding: recordId(bindingA) },
                    },
                    {
                        name: 'a record for another address in the set',
                        input: { address: idA.address, lookup: found([[envBindingA], [envBindingB]]) },
                        expected: { status: 'bound', born: 'orangecheck', holder: 'orangecheck', binding: recordId(bindingA) },
                    },
                ],
            },
            {
                id: 'kh10',
                category: 'key_holder',
                description: 'two bindings for one address, a user one beside the custodial one with no takeover: refused',
                input: { address: idA.address, lookup: found([[envBindingA], [signed(flipA, ISSUER_KEY, KEYS_A)]]) },
                expected: { status: 'refused', reason: 'conflicting_bindings' },
            },
            {
                id: 'kh11',
                category: 'key_holder',
                description: 'a takeover of a binding orangecheck never held',
                input: {
                    address: idB.address,
                    lookup: found([[envBindingB], [signed(takeoverOfUser, ISSUER_KEY, KEYS_B)]]),
                },
                expected: { status: 'refused', reason: 'takeover_of_user_binding' },
            },
            {
                id: 'kh12',
                category: 'key_holder',
                description: 'a retire and a takeover of one binding, ordered by their anchors',
                cases: [
                    {
                        name: 'a retire made after the takeover has no effect: the key is the user’s',
                        input: {
                            address: idA.address,
                            lookup: found([
                                [envBindingA, ANCHOR.bindingA],
                                [envTakeoverA, ANCHOR.takeoverA],
                                [signed(retireA), 977205],
                            ]),
                        },
                        expected: {
                            status: 'bound',
                            born: 'orangecheck',
                            holder: 'user',
                            binding: recordId(bindingA),
                            takeover: recordId(takeoverA),
                            takeover_since: 977100,
                            takeover_anchored_at: ANCHOR.takeoverA,
                        },
                    },
                    {
                        name: 'a retire with no anchor cannot be shown to come first: the takeover stands',
                        input: {
                            address: idA.address,
                            lookup: found([[envBindingA], [envTakeoverA, ANCHOR.takeoverA], [signed(retireEarlyA)]]),
                        },
                        expected: {
                            status: 'bound',
                            born: 'orangecheck',
                            holder: 'user',
                            binding: recordId(bindingA),
                            takeover: recordId(takeoverA),
                            takeover_since: 977100,
                            takeover_anchored_at: ANCHOR.takeoverA,
                        },
                    },
                    {
                        name: 'a retire anchored before the takeover was made: refused',
                        input: {
                            address: idA.address,
                            lookup: found([[envBindingA], [envTakeoverA, ANCHOR.takeoverA], [signed(retireEarlyA), 977050]]),
                        },
                        expected: { status: 'refused', reason: 'takeover_after_retire' },
                    },
                ],
            },
            {
                id: 'kh13',
                category: 'key_holder',
                description: 'a takeover whose since block is below its binding’s',
                input: {
                    address: idA.address,
                    lookup: found([[signed(bindingLateA)], [signed(takeoverEarlyA, ISSUER_KEY, KEYS_A)]]),
                },
                expected: { status: 'refused', reason: 'takeover_before_binding' },
            },
            {
                id: 'kh14',
                category: 'key_holder',
                description: "the old issuer's binding: counted when anchored before the hand-over, ignored when not",
                cases: [
                    {
                        name: 'anchored before',
                        input: { address: idD.address, lookup: found([[envBindingD, 977001]]) },
                        expected: { status: 'bound', born: 'orangecheck', holder: 'orangecheck', binding: recordId(bindingD) },
                    },
                    {
                        name: 'anchored after',
                        input: { address: idD.address, lookup: found([[envBindingD, 977010]]) },
                        expected: { status: 'unbound' },
                    },
                ],
            },

            {
                id: 'ks01',
                category: 'signature',
                description: 'orangecheck holds the key: every signature is refused, a live sign-in included',
                input: { address: idA.address, lookup: found([[envBindingA, ANCHOR.bindingA]]) },
                cases: [
                    { evidence: {}, expected: { accept: false, reason: 'orangecheck_held' } },
                    { evidence: { anchoredAt: 977200 }, expected: { accept: false, reason: 'orangecheck_held' } },
                    { evidence: { live: true }, expected: { accept: false, reason: 'orangecheck_held' } },
                ],
            },
            {
                id: 'ks02',
                category: 'signature',
                description: `taken over at since 977100, the takeover anchored at ${ANCHOR.takeoverA}: before it, after it, or in the window between`,
                input: { address: idA.address, lookup: A_SET },
                cases: [
                    { evidence: { anchoredAt: 977000 }, expected: { accept: false, reason: 'before_takeover' } },
                    { evidence: { anchoredAt: 977100 }, expected: { accept: false, reason: 'before_takeover' } },
                    { evidence: { madeAfter: ANCHOR.takeoverA }, expected: { accept: true, reason: 'after_takeover' } },
                    {
                        evidence: { madeAfter: 977150, anchoredAt: 977160 },
                        expected: { accept: true, reason: 'after_takeover' },
                    },
                    { evidence: { live: true }, expected: { accept: true, reason: 'after_takeover' } },
                    { evidence: { madeAfter: 977104 }, expected: { accept: true, reason: 'ambiguous_window' } },
                    { evidence: { anchoredAt: 977101 }, expected: { accept: true, reason: 'ambiguous_window' } },
                    { evidence: { anchoredAt: ANCHOR.takeoverA }, expected: { accept: true, reason: 'ambiguous_window' } },
                    { evidence: {}, expected: { accept: true, reason: 'ambiguous_window' } },
                ],
            },
            {
                id: 'ks03',
                category: 'signature',
                description: 'the user from the start: accepted',
                input: { address: idB.address, lookup: found([[envBindingB]]) },
                cases: [
                    { evidence: {}, expected: { accept: true, reason: 'user_born' } },
                    { evidence: { anchoredAt: 976990 }, expected: { accept: true, reason: 'user_born' } },
                ],
            },
            {
                id: 'ks04',
                category: 'signature',
                description: 'retired: refused',
                input: { address: idC.address, lookup: found([[envBindingC], [envRetireC]]) },
                cases: [
                    { evidence: {}, expected: { accept: false, reason: 'retired' } },
                    { evidence: { live: true }, expected: { accept: false, reason: 'retired' } },
                ],
            },
            {
                id: 'ks05',
                category: 'signature',
                description: 'evidence that cannot be true is refused, not ignored',
                input: { address: idA.address, lookup: A_SET },
                cases: [
                    {
                        evidence: { madeAfter: 977150, anchoredAt: 977150 },
                        expected: { accept: false, reason: 'bad_evidence' },
                    },
                    { evidence: { anchoredAt: -1 }, expected: { accept: false, reason: 'bad_evidence' } },
                ],
            },
            {
                id: 'ks06',
                category: 'signature',
                description: 'an address with no ochk.io record: plain Bitcoin, accepted as today',
                input: { address: idE.address, lookup: found([]) },
                cases: [
                    { evidence: {}, expected: { accept: true, reason: 'unbound' } },
                    { evidence: { live: true }, expected: { accept: true, reason: 'unbound' } },
                ],
            },
            {
                id: 'ks07',
                category: 'signature',
                description: 'a bound address whose record cannot be fetched: refused',
                input: { address: idA.address, lookup: found([], false) },
                cases: [
                    { evidence: {}, expected: { accept: false, reason: 'unresolved' } },
                    { evidence: { live: true }, expected: { accept: false, reason: 'unresolved' } },
                ],
            },

            {
                id: 'kn01',
                category: 'publication',
                description:
                    'kind 30078 tags: a d tag per record, so none replaces another whoever publishes it, and a t tag for attest’s address query',
                cases: [
                    { name: 'binding', input: bindingA, expected: publicationTags(bindingA) },
                    { name: 'takeover', input: takeoverA, expected: publicationTags(takeoverA) },
                    { name: 'retire', input: retireC, expected: publicationTags(retireC) },
                    { name: 'issuer record', input: rotation, expected: publicationTags(rotation) },
                ],
            },
        ],
    };
}
