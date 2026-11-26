// Builds test-vectors/keys-v1.json from fixed inputs with the reference
// implementation. Every input is derived from a published label, so every key
// here is a disclosed burn key: it guards nothing and must never hold funds.
// BIP-322 P2WPKH signatures (RFC 6979), BIP-340 with fixed aux bytes and
// AES-GCM under fixed nonces are deterministic, so a rebuild is byte-identical.
import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { gcm } from '@noble/ciphers/aes';
import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha2';

import { concat, toB64url, toHex, utf8 } from '../src/bytes';
import {
    deriveIdentity,
    deriveWallet,
    fedimintClientSecret,
    fedimintRootSecret,
    identityKeys,
    secretToMnemonic,
    walletKey,
} from '../src/derive';
import { lockAad, lockWithPasskey, lockWithPhrase, passkeyKek, PRF_SALT, phraseKek } from '../src/lock';
import {
    bindingRecord,
    CUSTODIAL_TRUST,
    identitySign,
    issuerRecord,
    possessionSign,
    publicationTags,
    recordId,
    retireRecord,
    rotationSign,
    takeoverRecord,
    walletLinkRecord,
    walletLinkSign,
    walletUnlinkRecord,
    walletUnlinkSign,
    type AddressKey,
    type SignedIssuerRecord,
    type SignedRecord,
    type SignedWalletRecord,
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
// Two keys of one stranger's own, which sign hand-overs between themselves.
const JUNK_X_KEY = label('junk issuer x');
const JUNK_X = addressFromPrivateKey(JUNK_X_KEY, 'p2wpkh');
const JUNK_Y_KEY = label('junk issuer y');
const JUNK_Y = addressFromPrivateKey(JUNK_Y_KEY, 'p2wpkh');

// A: custodial first, then taken over. B: passkey first. C: custodial, then
// retired. D: custodial, bound by the old issuer. E: no record at all.
const DID_A = 'did:oc:0123456789abcdef0123456789abcdef';
const DID_B = 'did:oc:fedcba9876543210fedcba9876543210';
const DID_C = 'did:oc:00112233445566778899aabbccddeeff';
const DID_D = 'did:oc:0f1e2d3c4b5a69788796a5b4c3d2e1f0';
const DID_E = 'did:oc:e0e1e2e3e4e5e6e7e8e9eaebecedeeef';
const I_A = label('identity A');
const W_A = label('wallet A');
const I_B = label('identity B');
const W_B = label('wallet B');
const I_C = label('identity C');
const I_D = label('identity D');
const I_E = label('identity E');
const KEYS_A = identityKeys(I_A);
const KEYS_B = identityKeys(I_B);
const KEYS_C = identityKeys(I_C);
const KEYS_D = identityKeys(I_D);
const KEYS_E = identityKeys(I_E);
// The first receive address of each wallet secret, which a wallet link names.
const WALLET_A = walletKey(W_A);
const WALLET_B = walletKey(W_B);

const PRF_1 = label('prf passkey 1');
const PRF_2 = label('prf passkey 2');
const CRED_1 = label('credential 1').slice(0, 16);
const CRED_2 = label('credential 2').slice(0, 16);
const nonce = (s: string) => label(`nonce ${s}`).slice(0, 12);

/** The issuer's signature, and the identity's two where given: possessionSign at mint, identitySign in the browser. */
function signed(record: string, issuerKey = ISSUER_KEY, identity?: typeof KEYS_A): SignedRecord {
    const env: SignedRecord = { record, issuer_sig: issuerSignAs(record, issuerKey) };
    if (identity) {
        const custodial = record.includes('\nkey_holder: orangecheck\n');
        Object.assign(env, (custodial ? possessionSign : identitySign)(record, identity, AUX));
    }
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
        reason: 'own_wallet',
    });
    // D was bound by the issuer before the current one, before that issuer handed over.
    const bindingD = bind(idD, DID_D, 'orangecheck', at(977000), OLD_ISSUER);

    // Every binding carries its key's proof of possession; a retire, the issuer's signature alone.
    const envBindingA = signed(bindingA, ISSUER_KEY, KEYS_A);
    const envTakeoverA = signed(takeoverA, ISSUER_KEY, KEYS_A);
    const envBindingB = signed(bindingB, ISSUER_KEY, KEYS_B);
    const envBindingC = signed(bindingC, ISSUER_KEY, KEYS_C);
    const envRetireC = signed(retireC);
    const envBindingD = signed(bindingD, OLD_ISSUER_KEY, KEYS_D);

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
    // A's binding without its proof of possession, or with a signature by another key.
    const { address_sig: _noAddress, ...bindingNoAddressSig } = envBindingA;
    const { nostr_sig: _noNostr, ...bindingNoNostrSig } = envBindingA;
    const bindingOtherAddressSig: SignedRecord = { ...envBindingA, address_sig: signMessage(idB.address, bindingA, KEYS_B.addressKey) };
    const bindingOtherNostrSig: SignedRecord = { ...envBindingA, nostr_sig: envBindingB.nostr_sig! };
    // A's mint-time signatures, presented beside records other than the binding they sign.
    const mint = { address_sig: envBindingA.address_sig!, nostr_sig: envBindingA.nostr_sig! };
    const bindA2 = bind(idA, DID_B, 'orangecheck', at(977000));
    // Signatures by a key over a record its signers refuse to sign: what a custodial key must never make.
    const identitySignAny = (record: string, keys: typeof KEYS_A) => ({
        address_sig: signMessage(keys.address, record, keys.addressKey),
        nostr_sig: toHex(schnorr.sign(sha256(utf8(record)), keys.nostrKey, AUX)),
    });
    // The issuer alone, binding addresses whose keys it does not hold: B's wallet, and E's.
    const walletBBinding = bindingRecord({
        didOc: DID_C,
        address: WALLET_B.address,
        nostr: idE.nostr,
        keyHolder: 'orangecheck',
        issuer: ISSUER,
        since: at(977100),
    });
    const envWalletBBinding = signed(walletBBinding);
    const envWalletBBindingIssuerKey: SignedRecord = {
        ...envWalletBBinding,
        address_sig: issuerSignAs(walletBBinding, ISSUER_KEY),
        nostr_sig: identitySignAny(walletBBinding, KEYS_C).nostr_sig,
    };
    // Records the issuer alone can make, aimed at addresses it does not hold.
    const retireOfNothing = retireRecord({
        didOc: DID_C,
        address: idE.address,
        binding: recordId(walletBBinding),
        issuer: ISSUER,
        since: at(977100),
        reason: 'deleted',
    });
    const retireOfUserB = retireRecord({
        didOc: DID_B,
        address: idB.address,
        binding: recordId(bindingB),
        issuer: ISSUER,
        since: at(977100),
        reason: 'deleted',
    });
    const retireOtherDidA = retireRecord({
        didOc: DID_B,
        address: idA.address,
        binding: recordId(bindingA),
        issuer: ISSUER,
        since: at(977200),
        reason: 'merged',
    });
    const retireOtherBindingA = retireRecord({
        didOc: DID_A,
        address: idA.address,
        binding: recordId(bindA2),
        issuer: ISSUER,
        since: at(977200),
        reason: 'withdrawn',
    });
    const retireOffChainUserB = retireRecord({
        didOc: DID_B,
        address: idB.address,
        binding: recordId(bindingB),
        issuer: ISSUER,
        since: { height: 977100, block: HEADERS['977200']! },
        reason: 'deleted',
    });
    const retireOffChainA = retireRecord({
        didOc: DID_A,
        address: idA.address,
        binding: recordId(bindingA),
        issuer: ISSUER,
        since: { height: 977100, block: HEADERS['977200']! },
        reason: 'withdrawn',
    });
    const strangerBinding = bind(idA, DID_A, 'orangecheck', at(977000), STRANGER);
    const envStrangerBinding = signed(strangerBinding, STRANGER_KEY);
    const forgedIssuerSig: SignedRecord = { ...envBindingA, issuer_sig: signMessage(STRANGER, bindingA, STRANGER_KEY) };
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
    const retireEarlyLateA = retireRecord({
        didOc: DID_A,
        address: idA.address,
        binding: recordId(bindingLateA),
        issuer: ISSUER,
        since: at(977100),
        reason: 'withdrawn',
    });
    const takeoverAtBindingA = takeOver(idA, DID_A, recordId(bindingA), at(977000));
    const takeoverOtherNostrA = takeoverRecord({
        didOc: DID_A,
        address: idA.address,
        nostr: idB.nostr,
        binding: recordId(bindingA),
        issuer: ISSUER,
        since: at(977100),
    });
    const takeoverOtherDidA = takeOver(idA, DID_B, recordId(bindingA), at(977100));
    // Bindings the address's own key signed, under an issuer the verifier does not hold.
    // E's owner signs a custodial binding for E's plain address, with an issuer part no trusted issuer made.
    const ownerBindingE = (issuer: string) => bind(idE, DID_E, 'orangecheck', at(977100), issuer);
    const envStrangerUserBindingB = signed(bind(idB, DID_B, 'user', at(977000), STRANGER), STRANGER_KEY, KEYS_B);
    const strangerTakeoverA = takeoverRecord({
        didOc: DID_A,
        address: idA.address,
        nostr: idA.nostr,
        binding: recordId(bindingA),
        issuer: STRANGER,
        since: at(977100),
    });
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
    const junk = (since: Since) => {
        const record = issuerRecord({ old: JUNK_X, new: JUNK_Y, since });
        return { record, ...rotationSign(record, JUNK_X_KEY, JUNK_Y_KEY) };
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

    // A read of the issuer tag.
    const read = (records: { envelope: unknown; anchoredAt?: number }[], complete = true) => ({ complete, records });
    const found = (records: [unknown, number?][], complete = true) => ({
        complete,
        records: records.map(([envelope, anchoredAt]) => (anchoredAt === undefined ? { envelope } : { envelope, anchoredAt })),
    });
    const A_SET = found([
        [envBindingA, ANCHOR.bindingA],
        [envTakeoverA, ANCHOR.takeoverA],
    ]);
    const B_SET = found([[envBindingB, ANCHOR.bindingB]]);
    const A_HELD = found([[envBindingA, ANCHOR.bindingA]]);

    // ── wallet links ──
    const link = (id: { address: string }, didOc: string, wallet: string, binding: string, since: Since) =>
        walletLinkRecord({ didOc, address: id.address, wallet, binding, since });
    const linked = (record: string, identity: AddressKey, wallet: AddressKey): SignedWalletRecord => ({
        record,
        ...walletLinkSign(record, identity, wallet),
    });
    const unlinked = (record: string, key: AddressKey): SignedWalletRecord => ({ record, ...walletUnlinkSign(record, key) });

    // A links its wallet after the takeover; B, passkey first, links its own.
    const linkA = link(idA, DID_A, WALLET_A.address, recordId(bindingA), at(977200));
    const envLinkA = linked(linkA, KEYS_A, WALLET_A);
    const linkB = link(idB, DID_B, WALLET_B.address, recordId(bindingB), at(977000));
    const envLinkB = linked(linkB, KEYS_B, WALLET_B);
    // A's wallet linked to B too.
    const linkAWalletToB = link(idB, DID_B, WALLET_A.address, recordId(bindingB), at(977200));
    const envLinkAWalletToB = linked(linkAWalletToB, KEYS_B, WALLET_A);
    // Ending A's link, by the wallet or by the identity.
    const unlinkA = walletUnlinkRecord({
        didOc: DID_A,
        address: idA.address,
        wallet: WALLET_A.address,
        link: recordId(linkA),
        since: at(977200),
    });
    const envUnlinkByWallet = unlinked(unlinkA, WALLET_A);
    const envUnlinkByIdentity = unlinked(unlinkA, KEYS_A);
    // B's own unlink naming A's link: not B's to end.
    const strangerUnlink = walletUnlinkRecord({
        didOc: DID_B,
        address: idB.address,
        wallet: WALLET_A.address,
        link: recordId(linkA),
        since: at(977200),
    });
    const envStrangerUnlink = unlinked(strangerUnlink, KEYS_B);
    // A link whose since block is before the takeover's; one made in the window; one naming C's binding.
    const linkEarlyA = link(idA, DID_A, WALLET_A.address, recordId(bindingA), at(977000));
    const linkWindowA = link(idA, DID_A, WALLET_A.address, recordId(bindingA), at(977100));
    const linkWrongBinding = link(idA, DID_A, WALLET_A.address, recordId(bindingC), at(977200));
    // C's address as the wallet: a key orangecheck holds.
    const linkToHeld = link(idA, DID_A, idC.address, recordId(bindingA), at(977200));
    const envLinkToHeld = linked(linkToHeld, KEYS_A, KEYS_C);
    const linkOffChain = link(idA, DID_A, WALLET_A.address, recordId(bindingA), {
        height: 977200,
        block: HEADERS['977100']!,
    });
    const LINK_ANCHOR = { linkA: 977203, unlinkA: 977204, linkAWalletToB: 977205, linkB: 977010 };
    const walletCase = (
        address: string,
        addressRecords: ReturnType<typeof found>,
        walletRecords: ReturnType<typeof found>,
        expected: unknown,
        extra: { name?: string; at?: number; wallet?: string } = {}
    ) => ({
        ...(extra.name ? { name: extra.name } : {}),
        input: {
            address,
            wallet: extra.wallet ?? WALLET_A.address,
            address_records: addressRecords,
            wallet_records: walletRecords,
            ...(extra.at !== undefined ? { at: extra.at } : {}),
        },
        expected,
    });
    const linkedTo = (id: { address: string }, record: string, anchoredAt: number) => ({
        status: 'linked',
        address: id.address,
        link: recordId(record),
        anchored_at: anchoredAt,
    });
    const accept = { accept: true, reason: 'linked' };
    const refusedAs = (reason: string) => ({ accept: false, reason });

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
            note: 'A placeholder for the issuer address the spec names. Every record and key-holder vector is checked against the terms this name and this complete read resolve to (ki01).',
            named: ISSUER,
            lookup: read([{ envelope: envRotation, anchoredAt: ROTATION_ANCHOR }]),
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
                    {
                        name: 'a valid 12-word phrase',
                        input: { copy: phraseA, phrase: `${'abandon '.repeat(11)}about` },
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
                description: 'custodial binding: the issuer, and the key orangecheck made, which signs only this binding, once, at mint',
                input: { envelope: envBindingA, anchoredAt: ANCHOR.bindingA },
                expected: { ok: true, id: recordId(bindingA), type: 'binding', signed: { issuer: true, address: true } },
            },
            {
                id: 'kr02',
                category: 'record',
                description: 'user binding (passkey first): issuer, identity address and Nostr key',
                input: { envelope: envBindingB },
                expected: { ok: true, id: recordId(bindingB), type: 'binding', signed: { issuer: true, address: true } },
            },
            {
                id: 'kr03',
                category: 'record',
                description: "takeover of A's custodial binding",
                input: { envelope: envTakeoverA, anchoredAt: ANCHOR.takeoverA },
                expected: { ok: true, id: recordId(takeoverA), type: 'takeover', signed: { issuer: true, address: true } },
            },
            {
                id: 'kr04',
                category: 'record',
                description: "retire of C's custodial binding: the issuer's signature alone",
                input: { envelope: envRetireC },
                expected: { ok: true, id: recordId(retireC), type: 'retire', signed: { issuer: true, address: false } },
            },
            {
                id: 'kr05',
                category: 'record',
                description: "signature by the wrong address: the takeover's address_sig is B's",
                input: { envelope: takeoverWrongAddressSig },
                expected: { ok: false, reason: 'address_sig_invalid', signed: { issuer: true, address: false } },
            },
            {
                id: 'kr06',
                category: 'record',
                description: "a custodial binding without its key's proof of possession: refused, so an issuer binds only a key it holds",
                cases: [
                    {
                        name: 'no address_sig',
                        input: { envelope: bindingNoAddressSig },
                        expected: { ok: false, reason: 'address_sig_missing', signed: { issuer: true, address: false } },
                    },
                    {
                        name: 'no nostr_sig',
                        input: { envelope: bindingNoNostrSig },
                        expected: { ok: false, reason: 'nostr_sig_missing', signed: { issuer: true, address: true } },
                    },
                    {
                        name: "address_sig by B's address",
                        input: { envelope: bindingOtherAddressSig },
                        expected: { ok: false, reason: 'address_sig_invalid', signed: { issuer: true, address: false } },
                    },
                    {
                        name: "nostr_sig by B's Nostr key",
                        input: { envelope: bindingOtherNostrSig },
                        expected: { ok: false, reason: 'nostr_sig_invalid', signed: { issuer: true, address: true } },
                    },
                ],
            },
            {
                id: 'kr07',
                category: 'record',
                description: 'issued and signed by an issuer the verifier does not trust',
                input: { envelope: envStrangerBinding },
                expected: { ok: false, reason: 'issuer_unknown', signed: { issuer: false, address: false } },
            },
            {
                id: 'kr08',
                category: 'record',
                description: "names the trusted issuer, but the issuer signature is another key's",
                input: { envelope: forgedIssuerSig },
                expected: { ok: false, reason: 'issuer_sig_invalid', signed: { issuer: false, address: true } },
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
                    ['a wallet link as an address record', linkA],
                ].map(([name, record]) => ({
                    name,
                    input: { envelope: { record, issuer_sig: issuerSignAs(record!, ISSUER_KEY) } },
                    expected: { ok: false, reason: 'not_canonical', signed: { issuer: false, address: false } },
                })),
            },
            {
                id: 'kr10',
                category: 'record',
                description: "since: the named block must be the verifier's block at that height",
                cases: [
                    {
                        name: "977100's hash at height 977000",
                        input: { envelope: signed(offChain, ISSUER_KEY, KEYS_A) },
                        expected: { ok: false, reason: 'since_not_on_chain', signed: { issuer: true, address: true } },
                    },
                    {
                        name: 'a height the verifier has no header for',
                        input: { envelope: signed(unknownHeight, ISSUER_KEY, KEYS_A) },
                        expected: { ok: false, reason: 'since_unverified', signed: { issuer: true, address: true } },
                    },
                ],
            },
            {
                id: 'kr11',
                category: 'record',
                description: "the takeover's nostr_sig is by B's Nostr key",
                input: { envelope: nostrWrongKey },
                expected: { ok: false, reason: 'nostr_sig_invalid', signed: { issuer: true, address: true } },
            },
            {
                id: 'kr12',
                category: 'record',
                description: 'a user binding with no identity signature',
                input: { envelope: userMissingAddressSig },
                expected: { ok: false, reason: 'address_sig_missing', signed: { issuer: true, address: false } },
            },
            {
                id: 'kr13',
                category: 'record',
                description: `issuer terms: the old issuer's record counts only where its anchor is at or below the hand-over's (${ROTATION_ANCHOR}); the current issuer's only from the hand-over's since block`,
                cases: [
                    {
                        name: 'old issuer, anchored before the hand-over was',
                        input: { envelope: envBindingD, anchoredAt: 977001 },
                        expected: { ok: true, id: recordId(bindingD), type: 'binding', signed: { issuer: true, address: true } },
                    },
                    {
                        name: 'old issuer, anchored at the same block',
                        input: { envelope: envBindingD, anchoredAt: ROTATION_ANCHOR },
                        expected: { ok: true, id: recordId(bindingD), type: 'binding', signed: { issuer: true, address: true } },
                    },
                    {
                        name: 'old issuer, anchored after',
                        input: { envelope: envBindingD, anchoredAt: 977010 },
                        expected: { ok: false, reason: 'issuer_retired', signed: { issuer: false, address: true } },
                    },
                    {
                        name: 'old issuer, no anchor',
                        input: { envelope: envBindingD },
                        expected: { ok: false, reason: 'issuer_retired', signed: { issuer: false, address: true } },
                    },
                    {
                        name: 'current issuer, a since block before its term',
                        input: { envelope: signed(tooEarly, ISSUER_KEY, KEYS_A) },
                        expected: { ok: false, reason: 'issuer_not_yet', signed: { issuer: false, address: true } },
                    },
                ],
            },
            {
                id: 'kr14',
                category: 'record',
                description: 'an anchor at or below the since block cannot be',
                input: { envelope: envBindingA, anchoredAt: 977000 },
                expected: { ok: false, reason: 'bad_anchor', signed: { issuer: true, address: true } },
            },
            {
                id: 'kr15',
                category: 'record',
                description: "a custodial key's mint-time signatures, over its binding, prove nothing beside any other record",
                cases: [
                    {
                        name: "A's binding signatures on A's takeover",
                        input: { envelope: { ...envTakeoverA, ...mint } },
                        expected: { ok: false, reason: 'address_sig_invalid', signed: { issuer: true, address: false } },
                    },
                    {
                        name: "A's binding nostr_sig on A's takeover",
                        input: { envelope: { ...envTakeoverA, nostr_sig: mint.nostr_sig } },
                        expected: { ok: false, reason: 'nostr_sig_invalid', signed: { issuer: true, address: true } },
                    },
                    {
                        name: "A's binding signatures on a binding of A's address to another did:oc",
                        input: { envelope: { ...signed(bindA2), ...mint } },
                        expected: { ok: false, reason: 'address_sig_invalid', signed: { issuer: true, address: false } },
                    },
                    {
                        name: "A's binding signatures on a user binding of A's address",
                        input: { envelope: { ...signed(flipA), ...mint } },
                        expected: { ok: false, reason: 'address_sig_invalid', signed: { issuer: true, address: false } },
                    },
                    {
                        name: "A's binding signatures on a retire of A's binding",
                        input: { envelope: { ...signed(retireA), ...mint } },
                        expected: { ok: false, reason: 'custodial_key_signed', signed: { issuer: true, address: false } },
                    },
                    {
                        name: "a retire of C's binding signed by C's own key",
                        input: { envelope: { ...envRetireC, ...identitySignAny(retireC, KEYS_C) } },
                        expected: { ok: false, reason: 'custodial_key_signed', signed: { issuer: true, address: true } },
                    },
                ],
            },

            {
                id: 'ki01',
                category: 'issuers',
                description: 'the named issuer and three copies of its hand-over record with different proofs: the old issuer before it, until the earliest anchor',
                input: {
                    named: ISSUER,
                    lookup: read([
                        { envelope: envRotation, anchoredAt: ROTATION_ANCHOR + 2 },
                        { envelope: envRotation, anchoredAt: ROTATION_ANCHOR },
                        { envelope: envRotation, anchoredAt: ROTATION_ANCHOR + 3 },
                    ]),
                },
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
                input: { named: OLD_ISSUER, lookup: read([{ envelope: envRotation, anchoredAt: ROTATION_ANCHOR }]) },
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
                input: { named: ISSUER, lookup: read([{ envelope: envForgedRotation, anchoredAt: ROTATION_ANCHOR }]) },
                expected: { ok: true, terms: [{ address: ISSUER, from: 0 }] },
            },
            {
                id: 'ki04',
                category: 'issuers',
                description: 'two hand-overs to the same issuer: refused',
                input: {
                    named: ISSUER,
                    lookup: read([{ envelope: envRotation, anchoredAt: ROTATION_ANCHOR }, { envelope: envStrangerRotation }]),
                },
                expected: { ok: false, reason: 'conflicting_issuer_records' },
            },
            {
                id: 'ki05',
                category: 'issuers',
                description: 'a hand-over and one back: refused',
                input: { named: ISSUER, lookup: read([{ envelope: envRotation }, { envelope: envBackRotation }]) },
                expected: { ok: false, reason: 'issuer_loop' },
            },
            {
                id: 'ki06',
                category: 'issuers',
                description: 'a hand-over signed by both whose since block is not on the chain: refused, not ignored',
                cases: [
                    {
                        name: 'a verifier that names the new issuer',
                        input: { named: ISSUER, lookup: read([{ envelope: envOffChainRotation }]) },
                        expected: { ok: false, reason: 'issuer_record_unverified' },
                    },
                    {
                        name: 'a verifier that names the old issuer',
                        input: { named: OLD_ISSUER, lookup: read([{ envelope: envOffChainRotation }]) },
                        expected: { ok: false, reason: 'issuer_record_unverified' },
                    },
                ],
            },
            {
                id: 'ki07',
                category: 'issuers',
                description: 'a hand-over between two keys off the walk from the named issuer is ignored, whatever is wrong with it: anyone with two keys can sign one',
                cases: (
                    [
                        ['its since block is not on the chain', { envelope: junk({ height: 977000, block: HEADERS['977100']! }) }],
                        ['its since height is past the tip', { envelope: junk({ height: 977300, block: HEADERS['977200']! }) }],
                        ['anchored at its own since block', { envelope: junk(at(977000)), anchoredAt: 977000 }],
                    ] as const
                ).map(([name, record]) => ({
                    name,
                    input: { named: ISSUER, lookup: read([{ envelope: envRotation, anchoredAt: ROTATION_ANCHOR }, record]) },
                    expected: {
                        ok: true,
                        terms: [
                            { address: OLD_ISSUER, from: 0, until: { since: 977000, anchoredAt: ROTATION_ANCHOR } },
                            { address: ISSUER, from: 977000 },
                        ],
                    },
                })),
            },
            {
                id: 'ki08',
                category: 'issuers',
                description: 'a copy of the hand-over anchored at its since block, beside a good copy: refused, in any order',
                cases: [
                    {
                        name: 'the bad copy first',
                        input: {
                            named: ISSUER,
                            lookup: read([
                                { envelope: envRotation, anchoredAt: 977000 },
                                { envelope: envRotation, anchoredAt: ROTATION_ANCHOR },
                            ]),
                        },
                        expected: { ok: false, reason: 'bad_anchor' },
                    },
                    {
                        name: 'the bad copy last',
                        input: {
                            named: ISSUER,
                            lookup: read([
                                { envelope: envRotation, anchoredAt: ROTATION_ANCHOR },
                                { envelope: envRotation, anchoredAt: 977000 },
                            ]),
                        },
                        expected: { ok: false, reason: 'bad_anchor' },
                    },
                    {
                        name: 'a verifier that names the old issuer',
                        input: {
                            named: OLD_ISSUER,
                            lookup: read([
                                { envelope: envRotation, anchoredAt: ROTATION_ANCHOR },
                                { envelope: envRotation, anchoredAt: 977000 },
                            ]),
                        },
                        expected: { ok: false, reason: 'bad_anchor' },
                    },
                ],
            },
            {
                id: 'ki09',
                category: 'issuers',
                description:
                    "a read of the issuer tag short of the floor resolves nothing, whatever it found: a hand-over it missed would leave a term's bindings unknown",
                cases: [
                    {
                        name: 'nothing found',
                        input: { named: ISSUER, lookup: read([], false) },
                        expected: { ok: false, reason: 'unavailable' },
                    },
                    {
                        name: 'the hand-over found',
                        input: { named: ISSUER, lookup: read([{ envelope: envRotation, anchoredAt: ROTATION_ANCHOR }], false) },
                        expected: { ok: false, reason: 'unavailable' },
                    },
                    {
                        name: 'a verifier that names the old issuer, nothing found',
                        input: { named: OLD_ISSUER, lookup: read([], false) },
                        expected: { ok: false, reason: 'unavailable' },
                    },
                ],
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
                    retire_reason: 'own_wallet',
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
                        name: 'a read short of the floor that found the binding and its takeover: a record it missed could refuse them',
                        input: {
                            address: idA.address,
                            lookup: found(
                                [
                                    [envBindingA, ANCHOR.bindingA],
                                    [envTakeoverA, ANCHOR.takeoverA],
                                ],
                                false
                            ),
                        },
                        expected: { status: 'refused', reason: 'unavailable' },
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
                description: "a record the issuer and the address's key signed, no copy of which verifies here: refused, not read as absent",
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
                        input: { address: idA.address, lookup: found([[signed(unknownHeight, ISSUER_KEY, KEYS_A)]]) },
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
                        input: { address: idA.address, lookup: found([[envStrangerBinding]]) },
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
                    {
                        name: "a retire anchored at the takeover's since block: refused",
                        input: {
                            address: idA.address,
                            lookup: found([[envBindingA], [envTakeoverA, ANCHOR.takeoverA], [signed(retireEarlyA), 977100]]),
                        },
                        expected: { status: 'refused', reason: 'takeover_after_retire' },
                    },
                ],
            },
            {
                id: 'kh13',
                category: 'key_holder',
                description: 'a takeover or a retire whose since block is below its binding’s: refused; one at it counts',
                cases: [
                    {
                        name: 'a takeover below',
                        input: {
                            address: idA.address,
                            lookup: found([[signed(bindingLateA, ISSUER_KEY, KEYS_A)], [signed(takeoverEarlyA, ISSUER_KEY, KEYS_A)]]),
                        },
                        expected: { status: 'refused', reason: 'takeover_before_binding' },
                    },
                    {
                        name: 'a takeover at the same block',
                        input: {
                            address: idA.address,
                            lookup: found([
                                [envBindingA, ANCHOR.bindingA],
                                [signed(takeoverAtBindingA, ISSUER_KEY, KEYS_A), 977050],
                            ]),
                        },
                        expected: {
                            status: 'bound',
                            born: 'orangecheck',
                            holder: 'user',
                            binding: recordId(bindingA),
                            takeover: recordId(takeoverAtBindingA),
                            takeover_since: 977000,
                            takeover_anchored_at: 977050,
                        },
                    },
                    {
                        name: 'a retire below',
                        input: {
                            address: idA.address,
                            lookup: found([[signed(bindingLateA, ISSUER_KEY, KEYS_A)], [signed(retireEarlyLateA)]]),
                        },
                        expected: { status: 'refused', reason: 'retire_before_binding' },
                    },
                ],
            },
            {
                id: 'kh14',
                category: 'key_holder',
                description:
                    "the old issuer's binding: counted when anchored before the hand-over; refused when not, never plain Bitcoin, since its own key signed it",
                cases: [
                    {
                        name: 'anchored before',
                        input: { address: idD.address, lookup: found([[envBindingD, 977001]]) },
                        expected: { status: 'bound', born: 'orangecheck', holder: 'orangecheck', binding: recordId(bindingD) },
                    },
                    {
                        name: 'anchored after',
                        input: { address: idD.address, lookup: found([[envBindingD, 977010]]) },
                        expected: { status: 'refused', reason: 'record_unverified' },
                    },
                    {
                        name: 'no anchor: a verifier without OpenTimestamps',
                        input: { address: idD.address, lookup: found([[envBindingD]]) },
                        expected: { status: 'refused', reason: 'record_unverified' },
                    },
                ],
            },

            {
                id: 'kh15',
                category: 'key_holder',
                description: 'three copies of the takeover with different proofs, the earliest between the others: the earliest anchor counts',
                input: {
                    address: idA.address,
                    lookup: found([
                        [envBindingA, ANCHOR.bindingA],
                        [envTakeoverA, 977110],
                        [envTakeoverA, ANCHOR.takeoverA],
                        [envTakeoverA, 977120],
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
                id: 'kh16',
                category: 'key_holder',
                description: "the issuer alone binds nothing: a binding without the address's own signature is ignored, whoever signed it",
                cases: [
                    {
                        name: "the issuer's binding of B's wallet, which it never held: plain Bitcoin",
                        input: { address: WALLET_B.address, lookup: found([[envWalletBBinding, 977103]]) },
                        expected: { status: 'unbound' },
                    },
                    {
                        name: 'the same, carrying signatures by keys that are not the address\'s',
                        input: { address: WALLET_B.address, lookup: found([[envWalletBBindingIssuerKey, 977103]]) },
                        expected: { status: 'unbound' },
                    },
                    {
                        name: "A's binding stripped of its proof, alone: plain Bitcoin",
                        input: { address: idA.address, lookup: found([[bindingNoAddressSig, ANCHOR.bindingA]]) },
                        expected: { status: 'unbound' },
                    },
                    {
                        name: "an issuer-only binding of A's address to another did:oc, beside A's: ignored, not conflicting",
                        input: { address: idA.address, lookup: found([[envBindingA, ANCHOR.bindingA], [signed(bindA2)]]) },
                        expected: { status: 'bound', born: 'orangecheck', holder: 'orangecheck', binding: recordId(bindingA) },
                    },
                    {
                        name: "an issuer-only takeover of B's user binding: ignored",
                        input: { address: idB.address, lookup: found([[envBindingB], [signed(takeoverOfUser)]]) },
                        expected: { status: 'bound', born: 'user', holder: 'user', binding: recordId(bindingB) },
                    },
                ],
            },
            {
                id: 'kh17',
                category: 'key_holder',
                description: 'a retire, which the issuer alone signs, counts only against the custodial binding it names, before any takeover',
                cases: [
                    {
                        name: 'a retire of an address with no binding: plain Bitcoin',
                        input: { address: idE.address, lookup: found([[signed(retireOfNothing), 977104]]) },
                        expected: { status: 'unbound' },
                    },
                    {
                        name: "a retire of B's user binding: no effect",
                        input: { address: idB.address, lookup: found([[envBindingB], [signed(retireOfUserB), 977104]]) },
                        expected: { status: 'bound', born: 'user', holder: 'user', binding: recordId(bindingB) },
                    },
                    {
                        name: "a retire of A's address naming another binding than A's: no effect",
                        input: { address: idA.address, lookup: found([[envBindingA, ANCHOR.bindingA], [signed(retireOtherBindingA), 977205]]) },
                        expected: { status: 'bound', born: 'orangecheck', holder: 'orangecheck', binding: recordId(bindingA) },
                    },
                    {
                        name: "a retire of B's user binding whose since block is not on the chain: no effect",
                        input: { address: idB.address, lookup: found([[envBindingB], [signed(retireOffChainUserB)]]) },
                        expected: { status: 'bound', born: 'user', holder: 'user', binding: recordId(bindingB) },
                    },
                    {
                        name: "after A's takeover, a retire naming another did:oc: no effect",
                        input: {
                            address: idA.address,
                            lookup: found([
                                [envBindingA, ANCHOR.bindingA],
                                [envTakeoverA, ANCHOR.takeoverA],
                                [signed(retireOtherDidA), 977205],
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
                        name: "after A's takeover, two retires: no effect",
                        input: {
                            address: idA.address,
                            lookup: found([
                                [envBindingA, ANCHOR.bindingA],
                                [envTakeoverA, ANCHOR.takeoverA],
                                [signed(retireA), 977205],
                                [signed(retireOtherDidA), 977206],
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
                        name: "a retire of A's custodial binding whose since block is not on the chain: refused, A's own record",
                        input: { address: idA.address, lookup: found([[envBindingA, ANCHOR.bindingA], [signed(retireOffChainA)]]) },
                        expected: { status: 'refused', reason: 'record_unverified' },
                    },
                    {
                        name: "a retire of A's custodial binding naming another did:oc, with no takeover: refused",
                        input: { address: idA.address, lookup: found([[envBindingA, ANCHOR.bindingA], [signed(retireOtherDidA), 977205]]) },
                        expected: { status: 'refused', reason: 'retire_mismatch' },
                    },
                ],
            },
            {
                id: 'kh18',
                category: 'key_holder',
                description:
                    "a custodial binding the address's own key signed: held where a trusted issuer signed it and only the term check fails, so the address is refused; noise where no trusted issuer did, since the owner of any plain address can make one",
                cases: [
                    {
                        name: "naming a block before its issuer's term: refused",
                        input: { address: idA.address, lookup: found([[signed(tooEarly, ISSUER_KEY, KEYS_A)]]) },
                        expected: { status: 'refused', reason: 'record_unverified' },
                    },
                    {
                        name: "E's owner, with an issuer signature by E's own key naming the issuer: plain Bitcoin",
                        input: { address: idE.address, lookup: found([[signed(ownerBindingE(ISSUER), KEYS_E.addressKey, KEYS_E)]]) },
                        expected: { status: 'unbound' },
                    },
                    {
                        name: "E's owner, naming the old issuer: plain Bitcoin",
                        input: { address: idE.address, lookup: found([[signed(ownerBindingE(OLD_ISSUER), KEYS_E.addressKey, KEYS_E)]]) },
                        expected: { status: 'unbound' },
                    },
                    {
                        name: "E's owner, with a second key of its own as the issuer: plain Bitcoin",
                        input: { address: idE.address, lookup: found([[signed(ownerBindingE(JUNK_X), JUNK_X_KEY, KEYS_E)]]) },
                        expected: { status: 'unbound' },
                    },
                    {
                        name: "A's binding with an issuer signature by another key, alone: noise",
                        input: { address: idA.address, lookup: found([[forgedIssuerSig]]) },
                        expected: { status: 'unbound' },
                    },
                    {
                        name: "a user binding naming a block before its issuer's term: noise, since the user's key signed it",
                        input: {
                            address: idB.address,
                            lookup: found([[signed(bind(idB, DID_B, 'user', at(976900)), ISSUER_KEY, KEYS_B)]]),
                        },
                        expected: { status: 'unbound' },
                    },
                    {
                        name: 'a user binding under an issuer the verifier does not hold: ignored',
                        input: { address: idB.address, lookup: found([[envStrangerUserBindingB]]) },
                        expected: { status: 'unbound' },
                    },
                    {
                        name: "a takeover under an issuer the verifier does not hold, beside A's binding: ignored",
                        input: {
                            address: idA.address,
                            lookup: found([
                                [envBindingA, ANCHOR.bindingA],
                                [signed(strangerTakeoverA, STRANGER_KEY, KEYS_A), ANCHOR.takeoverA],
                            ]),
                        },
                        expected: { status: 'bound', born: 'orangecheck', holder: 'orangecheck', binding: recordId(bindingA) },
                    },
                ],
            },
            {
                id: 'kh19',
                category: 'key_holder',
                description: "a takeover naming another did:oc or Nostr key than its binding's: refused",
                cases: [
                    {
                        name: 'another Nostr key',
                        input: {
                            address: idA.address,
                            lookup: found([
                                [envBindingA, ANCHOR.bindingA],
                                [signed(takeoverOtherNostrA, ISSUER_KEY, { ...KEYS_A, nostrKey: KEYS_B.nostrKey }), ANCHOR.takeoverA],
                            ]),
                        },
                        expected: { status: 'refused', reason: 'takeover_mismatch' },
                    },
                    {
                        name: 'another did:oc',
                        input: {
                            address: idA.address,
                            lookup: found([
                                [envBindingA, ANCHOR.bindingA],
                                [signed(takeoverOtherDidA, ISSUER_KEY, KEYS_A), ANCHOR.takeoverA],
                            ]),
                        },
                        expected: { status: 'refused', reason: 'takeover_mismatch' },
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
                id: 'kw01',
                category: 'wallet_record',
                description: 'a wallet link: signed by the identity address and the wallet address, no issuer',
                input: { envelope: envLinkA, anchoredAt: LINK_ANCHOR.linkA },
                expected: { ok: true, id: recordId(linkA), type: 'wallet-link', signed: { address: true, wallet: true } },
            },
            {
                id: 'kw02',
                category: 'wallet_record',
                description: 'a wallet unlink: either address alone signs it',
                cases: [
                    {
                        name: 'by the wallet',
                        input: { envelope: envUnlinkByWallet, anchoredAt: LINK_ANCHOR.unlinkA },
                        expected: { ok: true, id: recordId(unlinkA), type: 'wallet-unlink', signed: { address: false, wallet: true } },
                    },
                    {
                        name: 'by the identity',
                        input: { envelope: envUnlinkByIdentity },
                        expected: { ok: true, id: recordId(unlinkA), type: 'wallet-unlink', signed: { address: true, wallet: false } },
                    },
                ],
            },
            {
                id: 'kw03',
                category: 'wallet_record',
                description: 'a link needs both signatures: the wallet alone (a did:oc with no identity key) links nothing',
                cases: [
                    {
                        name: 'no identity signature',
                        input: { envelope: { record: linkA, wallet_sig: envLinkA.wallet_sig } },
                        expected: { ok: false, reason: 'address_sig_missing', signed: { address: false, wallet: true } },
                    },
                    {
                        name: 'no wallet signature',
                        input: { envelope: { record: linkA, address_sig: envLinkA.address_sig } },
                        expected: { ok: false, reason: 'wallet_sig_missing', signed: { address: true, wallet: false } },
                    },
                    {
                        name: "the wallet signature is B's wallet's",
                        input: { envelope: { ...envLinkA, wallet_sig: signMessage(WALLET_B.address, linkA, WALLET_B.addressKey) } },
                        expected: { ok: false, reason: 'wallet_sig_invalid', signed: { address: true, wallet: false } },
                    },
                    {
                        name: 'an unlink with neither',
                        input: { envelope: { record: unlinkA } },
                        expected: { ok: false, reason: 'unsigned', signed: { address: false, wallet: false } },
                    },
                ],
            },
            {
                id: 'kw04',
                category: 'wallet_record',
                description: 'not canonical text',
                cases: [
                    ['the wallet is the identity address', linkA.split(WALLET_A.address).join(idA.address)],
                    ['no ack line', linkA.replace(/ack: .*\n/, '')],
                    ['a changed ack line', linkA.replace('until either key', 'until the identity')],
                    ['an issuer field', linkA.replace('binding:', `issuer: ${ISSUER}\nbinding:`)],
                    ['a binding that is not an id', linkA.replace(recordId(bindingA), 'x'.repeat(64))],
                    ['an address record as a wallet record', bindingA],
                ].map(([name, record]) => ({
                    name,
                    input: { envelope: { record, address_sig: signMessage(idA.address, record!, KEYS_A.addressKey) } },
                    expected: { ok: false, reason: 'not_canonical', signed: { address: false, wallet: false } },
                })),
            },
            {
                id: 'kw05',
                category: 'wallet_record',
                description: "the since block and the anchor, as for every record",
                cases: [
                    {
                        name: "977100's hash at height 977200",
                        input: { envelope: linked(linkOffChain, KEYS_A, WALLET_A) },
                        expected: { ok: false, reason: 'since_not_on_chain', signed: { address: true, wallet: true } },
                    },
                    {
                        name: 'anchored at its since block',
                        input: { envelope: envLinkA, anchoredAt: 977200 },
                        expected: { ok: false, reason: 'bad_anchor', signed: { address: true, wallet: true } },
                    },
                ],
            },
            {
                id: 'kw06',
                category: 'wallet_record',
                description: "A's mint-time address_sig, over its binding, as a wallet link's or unlink's: refused",
                cases: [
                    {
                        name: 'on a link',
                        input: { envelope: { ...envLinkA, address_sig: mint.address_sig } },
                        expected: { ok: false, reason: 'address_sig_invalid', signed: { address: false, wallet: true } },
                    },
                    {
                        name: 'on an unlink',
                        input: { envelope: { record: unlinkA, address_sig: mint.address_sig } },
                        expected: { ok: false, reason: 'address_sig_invalid', signed: { address: false, wallet: false } },
                    },
                ],
            },

            {
                id: 'kb01',
                category: 'wallet_link',
                description: "A links its wallet after the takeover: the wallet's coins count for A",
                ...walletCase(idA.address, A_SET, found([[envLinkA, LINK_ANCHOR.linkA]]), {
                    link: linkedTo(idA, linkA, LINK_ANCHOR.linkA),
                    verdict: accept,
                }),
            },
            {
                id: 'kb02',
                category: 'wallet_link',
                description: 'B, passkey first, links its own wallet',
                ...walletCase(
                    idB.address,
                    B_SET,
                    found([[envLinkB, LINK_ANCHOR.linkB]]),
                    { link: linkedTo(idB, linkB, LINK_ANCHOR.linkB), verdict: accept },
                    { wallet: WALLET_B.address }
                ),
            },
            {
                id: 'kb03',
                category: 'wallet_link',
                description: 'a link signed while orangecheck holds the identity key: refused, since that key signs nothing',
                ...walletCase(idA.address, A_HELD, found([[envLinkA, LINK_ANCHOR.linkA]]), {
                    link: linkedTo(idA, linkA, LINK_ANCHOR.linkA),
                    verdict: refusedAs('orangecheck_held'),
                }),
            },
            {
                id: 'kb04',
                category: 'wallet_link',
                description: 'a link from before the takeover: refused',
                cases: [
                    walletCase(
                        idA.address,
                        A_SET,
                        found([[linked(linkEarlyA, KEYS_A, WALLET_A), 977050]]),
                        { link: linkedTo(idA, linkEarlyA, 977050), verdict: refusedAs('before_takeover') },
                        { name: 'anchored before the takeover was made' }
                    ),
                    walletCase(
                        idA.address,
                        A_SET,
                        found([[linked(linkEarlyA, KEYS_A, WALLET_A), 977150]]),
                        { link: linkedTo(idA, linkEarlyA, 977150), verdict: refusedAs('before_takeover') },
                        { name: "anchored after, but naming a since block below the takeover's" }
                    ),
                ],
            },
            {
                id: 'kb05',
                category: 'wallet_link',
                description: 'a link made in the window between the takeover and its anchor: accepted, since orangecheck never held the wallet key',
                ...walletCase(idA.address, A_SET, found([[linked(linkWindowA, KEYS_A, WALLET_A), 977104]]), {
                    link: linkedTo(idA, linkWindowA, 977104),
                    verdict: accept,
                }),
            },
            {
                id: 'kb06',
                category: 'wallet_link',
                description: 'no link: the coins count only for the wallet address itself, as today',
                ...walletCase(idA.address, A_SET, found([]), { link: { status: 'none' }, verdict: refusedAs('not_linked') }),
            },
            {
                id: 'kb07',
                category: 'wallet_link',
                description: 'a read of the wallet that did not reach the floor: refused, since a missed link or unlink could only make another count wrongly',
                ...walletCase(idA.address, A_SET, found([[envLinkA, LINK_ANCHOR.linkA]], false), {
                    link: { status: 'refused', reason: 'unavailable' },
                    verdict: refusedAs('unresolved'),
                }),
            },
            {
                id: 'kb08',
                category: 'wallet_link',
                description: 'the identity whose records cannot be read: refused',
                cases: [
                    walletCase(
                        idA.address,
                        found([], false),
                        found([[envLinkA, LINK_ANCHOR.linkA]]),
                        { link: linkedTo(idA, linkA, LINK_ANCHOR.linkA), verdict: refusedAs('unresolved') },
                        { name: 'not read' }
                    ),
                    walletCase(
                        idA.address,
                        found([]),
                        found([[envLinkA, LINK_ANCHOR.linkA]]),
                        { link: linkedTo(idA, linkA, LINK_ANCHOR.linkA), verdict: refusedAs('unresolved') },
                        { name: 'read in full with no binding, though the link names one: not plain Bitcoin' }
                    ),
                ],
            },
            {
                id: 'kb09',
                category: 'wallet_link',
                description: 'one wallet, two identities: the first link anchored counts, the later one never does',
                cases: [
                    walletCase(
                        idA.address,
                        A_SET,
                        found([
                            [envLinkA, LINK_ANCHOR.linkA],
                            [envLinkAWalletToB, LINK_ANCHOR.linkAWalletToB],
                        ]),
                        { link: linkedTo(idA, linkA, LINK_ANCHOR.linkA), verdict: accept },
                        { name: 'for A' }
                    ),
                    walletCase(
                        idB.address,
                        B_SET,
                        found([
                            [envLinkA, LINK_ANCHOR.linkA],
                            [envLinkAWalletToB, LINK_ANCHOR.linkAWalletToB],
                        ]),
                        { link: linkedTo(idA, linkA, LINK_ANCHOR.linkA), verdict: refusedAs('linked_elsewhere') },
                        { name: 'for B' }
                    ),
                ],
            },
            {
                id: 'kb10',
                category: 'wallet_link',
                description: `unlinked at ${LINK_ANCHOR.unlinkA}, then linked to B at ${LINK_ANCHOR.linkAWalletToB}: each identity in its own span, asked now or at a height`,
                cases: [
                    ['now, for B', idB.address, B_SET, undefined, linkedTo(idB, linkAWalletToB, LINK_ANCHOR.linkAWalletToB), accept],
                    [
                        'now, for A',
                        idA.address,
                        A_SET,
                        undefined,
                        linkedTo(idB, linkAWalletToB, LINK_ANCHOR.linkAWalletToB),
                        refusedAs('linked_elsewhere'),
                    ],
                    ['at 977203, for A', idA.address, A_SET, 977203, linkedTo(idA, linkA, LINK_ANCHOR.linkA), accept],
                    ['at 977204, for A: the unlink is anchored', idA.address, A_SET, 977204, { status: 'none' }, refusedAs('not_linked')],
                ].map(([name, address, records, height, state, verdict]) =>
                    walletCase(
                        address as string,
                        records as ReturnType<typeof found>,
                        found([
                            [envLinkA, LINK_ANCHOR.linkA],
                            [envUnlinkByWallet, LINK_ANCHOR.unlinkA],
                            [envLinkAWalletToB, LINK_ANCHOR.linkAWalletToB],
                        ]),
                        { link: state, verdict },
                        { name: name as string, ...(height !== undefined ? { at: height as number } : {}) }
                    )
                ),
            },
            {
                id: 'kb11',
                category: 'wallet_link',
                description: 'an unlink by the identity, not yet anchored: it ends the link now, but not at a height already past',
                cases: [
                    walletCase(
                        idA.address,
                        A_SET,
                        found([[envLinkA, LINK_ANCHOR.linkA], [envUnlinkByIdentity]]),
                        { link: { status: 'none' }, verdict: refusedAs('not_linked') },
                        { name: 'now' }
                    ),
                    walletCase(
                        idA.address,
                        A_SET,
                        found([[envLinkA, LINK_ANCHOR.linkA], [envUnlinkByIdentity]]),
                        { link: linkedTo(idA, linkA, LINK_ANCHOR.linkA), verdict: accept },
                        { name: 'at 977210', at: 977210 }
                    ),
                    walletCase(
                        idA.address,
                        A_SET,
                        found([
                            [envLinkA, LINK_ANCHOR.linkA],
                            [envUnlinkByIdentity, 977206],
                            [envUnlinkByIdentity, 977204],
                            [envUnlinkByIdentity, 977207],
                        ]),
                        { link: { status: 'none' }, verdict: refusedAs('not_linked') },
                        { name: 'copies anchored at 977206, 977204 and 977207, asked at 977205: ended at the earliest', at: 977205 }
                    ),
                ],
            },
            {
                id: 'kb12',
                category: 'wallet_link',
                description: 'two links anchored in one block: neither counts',
                ...walletCase(
                    idA.address,
                    A_SET,
                    found([
                        [envLinkA, LINK_ANCHOR.linkA],
                        [envLinkAWalletToB, LINK_ANCHOR.linkA],
                    ]),
                    { link: { status: 'none' }, verdict: refusedAs('not_linked') }
                ),
            },
            {
                id: 'kb13',
                category: 'wallet_link',
                description: 'unlinks of a link the read does not hold',
                cases: [
                    walletCase(
                        idA.address,
                        A_SET,
                        found([[envUnlinkByWallet, LINK_ANCHOR.unlinkA]]),
                        { link: { status: 'refused', reason: 'unlink_without_link' }, verdict: refusedAs('unresolved') },
                        { name: 'by the wallet: a link exists that the read missed, so refused' }
                    ),
                    walletCase(
                        idA.address,
                        A_SET,
                        found([[envUnlinkByIdentity, LINK_ANCHOR.unlinkA]]),
                        { link: { status: 'none' }, verdict: refusedAs('not_linked') },
                        { name: 'by an identity alone: ignored, since anyone can sign for their own address' }
                    ),
                    ...[
                        ["two copies, the wallet's first: the wallet signed it, so refused", envUnlinkByWallet, envUnlinkByIdentity],
                        ["two copies, the identity's first: the same", envUnlinkByIdentity, envUnlinkByWallet],
                    ].map(([name, first, second]) =>
                        walletCase(
                            idA.address,
                            A_SET,
                            found([
                                [first as SignedWalletRecord, LINK_ANCHOR.unlinkA],
                                [second as SignedWalletRecord, LINK_ANCHOR.unlinkA],
                            ]),
                            { link: { status: 'refused', reason: 'unlink_without_link' }, verdict: refusedAs('unresolved') },
                            { name: name as string }
                        )
                    ),
                ],
            },
            {
                id: 'kb14',
                category: 'wallet_link',
                description: 'the wallet is an address orangecheck holds: refused',
                ...walletCase(
                    idA.address,
                    A_SET,
                    found([
                        [envBindingC, ANCHOR.bindingC],
                        [envLinkToHeld, LINK_ANCHOR.linkA],
                    ]),
                    { link: linkedTo(idA, linkToHeld, LINK_ANCHOR.linkA), verdict: refusedAs('wallet_key_refused') },
                    { wallet: idC.address }
                ),
            },
            {
                id: 'kb15',
                category: 'wallet_link',
                description: 'a link counts from its earliest anchor, and not before it is anchored',
                cases: [
                    walletCase(idA.address, A_SET, found([[envLinkA]]), { link: { status: 'none' }, verdict: refusedAs('not_linked') }, { name: 'not yet anchored' }),
                    walletCase(
                        idA.address,
                        A_SET,
                        found([
                            [envLinkA, 977206],
                            [envLinkA, LINK_ANCHOR.linkA],
                            [envLinkA, 977207],
                        ]),
                        { link: linkedTo(idA, linkA, LINK_ANCHOR.linkA), verdict: accept },
                        { name: `copies anchored at 977206, ${LINK_ANCHOR.linkA} and 977207, asked at 977204: linked since ${LINK_ANCHOR.linkA}`, at: 977204 }
                    ),
                ],
            },
            {
                id: 'kb16',
                category: 'wallet_link',
                description: "a link naming another binding than the identity's: refused",
                ...walletCase(idA.address, A_SET, found([[linked(linkWrongBinding, KEYS_A, WALLET_A), LINK_ANCHOR.linkA]]), {
                    link: linkedTo(idA, linkWrongBinding, LINK_ANCHOR.linkA),
                    verdict: refusedAs('link_mismatch'),
                }),
            },

            {
                id: 'kc01',
                category: 'wallet_link_copies',
                description: "a link copy whose wallet signature is another key's: noise, ignored",
                cases: [
                    walletCase(
                        idA.address,
                        A_SET,
                        found([[{ ...envLinkA, wallet_sig: signMessage(WALLET_B.address, linkA, WALLET_B.addressKey) }, LINK_ANCHOR.linkA]]),
                        { link: { status: 'none' }, verdict: refusedAs('not_linked') },
                        { name: 'alone' }
                    ),
                    walletCase(
                        idA.address,
                        A_SET,
                        found([
                            [{ ...envLinkA, wallet_sig: signMessage(WALLET_B.address, linkA, WALLET_B.addressKey) }, LINK_ANCHOR.linkA],
                            [envLinkA, LINK_ANCHOR.linkA],
                        ]),
                        { link: linkedTo(idA, linkA, LINK_ANCHOR.linkA), verdict: accept },
                        { name: 'beside a good copy' }
                    ),
                ],
            },
            {
                id: 'kc02',
                category: 'wallet_link_copies',
                description: 'the wallet signature alone: no link',
                ...walletCase(idA.address, A_SET, found([[{ record: linkA, wallet_sig: envLinkA.wallet_sig }, LINK_ANCHOR.linkA]]), {
                    link: { status: 'none' },
                    verdict: refusedAs('not_linked'),
                }),
            },
            {
                id: 'kc03',
                category: 'wallet_link_copies',
                description: 'a link both keys signed whose since block is not on the chain: refused, not ignored',
                ...walletCase(idA.address, A_SET, found([[linked(linkOffChain, KEYS_A, WALLET_A), LINK_ANCHOR.linkA]]), {
                    link: { status: 'refused', reason: 'record_unverified' },
                    verdict: refusedAs('unresolved'),
                }),
            },
            {
                id: 'kc04',
                category: 'wallet_link_copies',
                description: 'a copy with an anchor at its since block',
                cases: [
                    walletCase(
                        idA.address,
                        A_SET,
                        found([[envLinkA, 977200]]),
                        { link: { status: 'refused', reason: 'bad_anchor' }, verdict: refusedAs('unresolved') },
                        { name: 'alone' }
                    ),
                    walletCase(
                        idA.address,
                        A_SET,
                        found([
                            [envLinkA, 977200],
                            [envLinkA, LINK_ANCHOR.linkA],
                        ]),
                        { link: linkedTo(idA, linkA, LINK_ANCHOR.linkA), verdict: accept },
                        { name: 'beside a good copy' }
                    ),
                ],
            },
            {
                id: 'kc05',
                category: 'wallet_link_copies',
                description: "B's unlink naming A's link, signed by B: not B's to end, ignored",
                ...walletCase(
                    idA.address,
                    A_SET,
                    found([
                        [envLinkA, LINK_ANCHOR.linkA],
                        [envStrangerUnlink, LINK_ANCHOR.unlinkA],
                    ]),
                    { link: linkedTo(idA, linkA, LINK_ANCHOR.linkA), verdict: accept }
                ),
            },
            {
                id: 'kc06',
                category: 'wallet_link_copies',
                description: "another wallet's link served under this wallet's tag: ignored",
                ...walletCase(idB.address, B_SET, found([[envLinkB, LINK_ANCHOR.linkB]]), {
                    link: { status: 'none' },
                    verdict: refusedAs('not_linked'),
                }),
            },

            {
                id: 'kn01',
                category: 'publication',
                description:
                    'kind 30078 tags: a d tag per record, so none replaces another whoever publishes it, and a t tag oc-attest-key:<address> to read them by',
                cases: [
                    { name: 'binding', input: bindingA, expected: publicationTags(bindingA) },
                    { name: 'takeover', input: takeoverA, expected: publicationTags(takeoverA) },
                    { name: 'retire', input: retireC, expected: publicationTags(retireC) },
                    { name: 'issuer record', input: rotation, expected: publicationTags(rotation) },
                    { name: 'wallet link', input: linkA, expected: publicationTags(linkA) },
                    { name: 'wallet unlink', input: unlinkA, expected: publicationTags(unlinkA) },
                ],
            },
            {
                id: 'kn02',
                category: 'publication_no_bare_address',
                description:
                    "no published t tag is a bare address, so attest's address query (SPEC §6.2) returns attestations and never these records",
                cases: (
                    [
                        ['binding', bindingA],
                        ['takeover', takeoverA],
                        ['retire', retireC],
                        ['issuer record', rotation],
                        ['wallet link', linkA],
                        ['wallet unlink', unlinkA],
                    ] as const
                ).map(([name, input]) => ({ name, input, expected: { bare_address_tags: [] } })),
            },
        ],
    };
}
