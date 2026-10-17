/**
 * BIP-322 "simple" and legacy BIP-137 message-signature verification, on
 * audited primitives only (@noble/curves, @noble/hashes, @scure/base).
 *
 * BIP-322's to_spend and to_sign transactions are fixed-shape, so they are
 * serialized here directly rather than through a PSBT library: bip322-js did
 * that, and a bitcoinjs-lib patch release (6.1.9) that tightened PSBT
 * extraction made it reject every signature.
 */
import { schnorr, secp256k1 } from '@noble/curves/secp256k1';
import { ripemd160 } from '@noble/hashes/legacy';
import { sha256 } from '@noble/hashes/sha2';
import { bech32, bech32m, createBase58check } from '@scure/base';

export type AddressType = 'p2pkh' | 'p2sh' | 'p2wpkh' | 'p2wsh' | 'p2tr';

export interface DecodedAddress {
    type: AddressType;
    /** The pubkey hash, script hash, or (for p2tr) the x-only output key. */
    program: Uint8Array;
    scriptPubKey: Uint8Array;
}

const base58check = createBase58check(sha256);
const utf8 = new TextEncoder();

const BASE58_VERSIONS: Record<number, AddressType> = {
    0x00: 'p2pkh',
    0x05: 'p2sh',
    0x6f: 'p2pkh',
    0xc4: 'p2sh',
};

function concat(...parts: Uint8Array[]): Uint8Array {
    const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
    let at = 0;
    for (const p of parts) {
        out.set(p, at);
        at += p.length;
    }
    return out;
}

function equal(a: Uint8Array, b: Uint8Array): boolean {
    return a.length === b.length && a.every((x, i) => x === b[i]);
}

const sha256d = (b: Uint8Array) => sha256(sha256(b));
const hash160 = (b: Uint8Array) => ripemd160(sha256(b));

function taggedHash(tag: string, ...msgs: Uint8Array[]): Uint8Array {
    const t = sha256(utf8.encode(tag));
    return sha256(concat(t, t, ...msgs));
}

function compactSize(n: number): Uint8Array {
    if (n < 0xfd) return Uint8Array.of(n);
    if (n <= 0xffff) return Uint8Array.of(0xfd, n & 0xff, n >> 8);
    return Uint8Array.of(0xfe, n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff, n >>> 24);
}

const scriptFor: Record<AddressType, (p: Uint8Array) => Uint8Array> = {
    p2pkh: (h) => concat(Uint8Array.of(0x76, 0xa9, 0x14), h, Uint8Array.of(0x88, 0xac)),
    p2sh: (h) => concat(Uint8Array.of(0xa9, 0x14), h, Uint8Array.of(0x87)),
    p2wpkh: (h) => concat(Uint8Array.of(0x00, 0x14), h),
    p2wsh: (h) => concat(Uint8Array.of(0x00, 0x20), h),
    p2tr: (k) => concat(Uint8Array.of(0x51, 0x20), k),
};

/**
 * Decode a mainnet, testnet/signet or regtest address. Null for anything else,
 * including uppercase bech32 and witness versions other than 0 and 1.
 */
export function decodeAddress(address: string): DecodedAddress | null {
    const make = (type: AddressType, program: Uint8Array): DecodedAddress => ({
        type,
        program,
        scriptPubKey: scriptFor[type](program),
    });
    if (/^(bc|tb|bcrt)1/.test(address)) {
        const prefix = address.slice(0, address.lastIndexOf('1'));
        const segwit = (codec: typeof bech32) => {
            try {
                const { prefix: hrp, words } = codec.decode(address as `${string}1${string}`);
                return hrp === prefix && words.length > 0 ? words : null;
            } catch {
                return null;
            }
        };
        // fromWordsUnsafe: a checksum can be valid over words whose padding
        // isn't, and fromWords throws on those.
        const v0 = segwit(bech32);
        if (v0 && v0[0] === 0) {
            const program = bech32.fromWordsUnsafe(v0.slice(1));
            if (!program) return null;
            if (program.length === 20) return make('p2wpkh', program);
            if (program.length === 32) return make('p2wsh', program);
            return null;
        }
        const v1 = segwit(bech32m);
        if (v1 && v1[0] === 1) {
            const program = bech32m.fromWordsUnsafe(v1.slice(1));
            return program && program.length === 32 ? make('p2tr', program) : null;
        }
        return null;
    }
    try {
        const payload = base58check.decode(address);
        const type = BASE58_VERSIONS[payload[0]!];
        return type && payload.length === 21 ? make(type, payload.slice(1)) : null;
    } catch {
        return null;
    }
}

/** Base64, standard or URL-safe, padded or not. Empty on anything else. */
function decodeBase64(s: string): Uint8Array {
    const clean = s.replace(/\s+/g, '').replace(/-/g, '+').replace(/_/g, '/').replace(/=+$/, '');
    if (!/^[A-Za-z0-9+/]*$/.test(clean) || clean.length % 4 === 1) return new Uint8Array();
    const bin = atob(clean + '='.repeat((4 - (clean.length % 4)) % 4));
    return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}

/** A serialized witness stack, or null unless it parses exactly. */
function parseWitness(bytes: Uint8Array): Uint8Array[] | null {
    let at = 0;
    const readSize = (): number | null => {
        const first = bytes[at++];
        if (first === undefined) return null;
        if (first < 0xfd) return first;
        const width = first === 0xfd ? 2 : first === 0xfe ? 4 : 8;
        if (at + width > bytes.length) return null;
        let n = 0;
        for (let i = width - 1; i >= 0; i--) n = n * 256 + bytes[at + i]!;
        at += width;
        return n;
    };
    const count = readSize();
    if (count === null) return null;
    const stack: Uint8Array[] = [];
    for (let i = 0; i < count; i++) {
        const len = readSize();
        if (len === null || at + len > bytes.length) return null;
        stack.push(bytes.slice(at, at + len));
        at += len;
    }
    return at === bytes.length ? stack : null;
}

/** BIP-66 strict DER, as Bitcoin Core's IsValidSignatureEncoding, minus the hash-type byte. */
function parseStrictDer(sig: Uint8Array): { r: bigint; s: bigint } | null {
    if (sig.length < 8 || sig.length > 72 || sig[0] !== 0x30 || sig[1] !== sig.length - 2) {
        return null;
    }
    const rLen = sig[3]!;
    if (sig[2] !== 0x02 || rLen === 0 || 5 + rLen >= sig.length) return null;
    const sLen = sig[5 + rLen]!;
    if (sig[4 + rLen] !== 0x02 || sLen === 0 || rLen + sLen + 6 !== sig.length) return null;
    const r = sig.subarray(4, 4 + rLen);
    const s = sig.subarray(6 + rLen);
    const minimalPositive = (n: Uint8Array) =>
        (n[0]! & 0x80) === 0 && !(n.length > 1 && n[0] === 0 && (n[1]! & 0x80) === 0);
    if (!minimalPositive(r) || !minimalPositive(s)) return null;
    const toBig = (n: Uint8Array) => n.reduce((acc, b) => (acc << 8n) | BigInt(b), 0n);
    return { r: toBig(r), s: toBig(s) };
}

const ZERO4 = new Uint8Array(4);
const ZERO8 = new Uint8Array(8);
const OP_RETURN_OUTPUT = concat(ZERO8, Uint8Array.of(0x01, 0x6a));

/** The to_spend txid (internal byte order), BIP-322 §"Full". */
function toSpendTxid(message: string, scriptPubKey: Uint8Array): Uint8Array {
    const messageHash = taggedHash('BIP0322-signed-message', utf8.encode(message));
    return sha256d(
        concat(
            ZERO4, // nVersion 0
            Uint8Array.of(0x01),
            new Uint8Array(32),
            Uint8Array.of(0xff, 0xff, 0xff, 0xff),
            Uint8Array.of(0x22, 0x00, 0x20), // scriptSig: OP_0 PUSH32
            messageHash,
            ZERO4, // nSequence 0
            Uint8Array.of(0x01),
            ZERO8, // value 0
            compactSize(scriptPubKey.length),
            scriptPubKey,
            ZERO4 // nLockTime 0
        )
    );
}

/** BIP-143 sighash of to_sign's only input, SIGHASH_ALL, for a P2WPKH spend. */
function segwitV0Sighash(outpoint: Uint8Array, pubkeyHash: Uint8Array): Uint8Array {
    return sha256d(
        concat(
            ZERO4,
            sha256d(outpoint),
            sha256d(ZERO4),
            outpoint,
            Uint8Array.of(0x19),
            scriptFor.p2pkh(pubkeyHash),
            ZERO8,
            ZERO4,
            sha256d(OP_RETURN_OUTPUT),
            ZERO4,
            Uint8Array.of(0x01, 0x00, 0x00, 0x00)
        )
    );
}

/** BIP-341 key-path sighash of to_sign's only input. */
function taprootSighash(outpoint: Uint8Array, scriptPubKey: Uint8Array, hashType: number) {
    return taggedHash(
        'TapSighash',
        Uint8Array.of(0x00, hashType),
        ZERO4,
        ZERO4,
        sha256(outpoint),
        sha256(ZERO8),
        sha256(concat(compactSize(scriptPubKey.length), scriptPubKey)),
        sha256(ZERO4),
        sha256(OP_RETURN_OUTPUT),
        Uint8Array.of(0x00),
        ZERO4
    );
}

/** Run a noble check; a malformed point or scalar is an invalid signature. */
function attempt(check: () => boolean): boolean {
    try {
        return check();
    } catch {
        return false;
    }
}

function verifySimple(addr: DecodedAddress, message: string, witnessBytes: Uint8Array): boolean {
    const witness = parseWitness(witnessBytes);
    if (!witness) return false;
    const outpoint = concat(toSpendTxid(message, addr.scriptPubKey), ZERO4);

    const [sig, pubkey] = witness;
    if (witness.length === 2 && pubkey!.length === 33 && (pubkey![0] === 2 || pubkey![0] === 3)) {
        const pkh = hash160(pubkey!);
        const bound =
            addr.type === 'p2wpkh'
                ? equal(pkh, addr.program)
                : addr.type === 'p2sh' && equal(hash160(scriptFor.p2wpkh(pkh)), addr.program);
        // BIP-322: every signature uses SIGHASH_ALL.
        const der = sig!.length > 0 && sig![sig!.length - 1] === 0x01 ? parseStrictDer(sig!.subarray(0, -1)) : null;
        if (!bound || !der) return false;
        const hash = segwitV0Sighash(outpoint, pkh);
        return attempt(() =>
            secp256k1.verify(new secp256k1.Signature(der.r, der.s).toBytes('compact'), hash, pubkey!, {
                format: 'compact',
                lowS: false,
                prehash: false,
            })
        );
    }
    if (addr.type === 'p2tr' && witness.length === 1) {
        // 64 bytes is SIGHASH_DEFAULT; 65 must carry SIGHASH_ALL (BIP-341 rejects 0x00 there).
        const hashType = sig!.length === 64 ? 0x00 : sig!.length === 65 && sig![64] === 0x01 ? 0x01 : -1;
        if (hashType < 0) return false;
        const hash = taprootSighash(outpoint, addr.scriptPubKey, hashType);
        return attempt(() => schnorr.verify(sig!.subarray(0, 64), hash, addr.program));
    }
    return false;
}

/** The P2TR output key a single-key BIP-86 wallet derives from `pubkey`. */
function bip86OutputKey(pubkey: Uint8Array): Uint8Array {
    const x = pubkey.subarray(1, 33);
    const tweak = schnorr.utils.bytesToNumberBE(taggedHash('TapTweak', x));
    const P = schnorr.utils.lift_x(schnorr.utils.bytesToNumberBE(x));
    return P.add(secp256k1.Point.BASE.multiply(tweak)).toBytes(true).subarray(1);
}

/**
 * Legacy "signmessage" (BIP-137). Lenient about the header's address-type
 * flag, as bip322-js and most wallets are: the recovered key only has to
 * derive the claimed address in that address's own form.
 */
function verifyBip137(addr: DecodedAddress, message: string, sig: Uint8Array): boolean {
    if (sig.length !== 65) return false;
    const flag = sig[0]! - 27;
    if (flag < 0 || flag > 15) return false;
    const msg = utf8.encode(message);
    const hash = sha256d(
        concat(utf8.encode('\u0018Bitcoin Signed Message:\n'), compactSize(msg.length), msg)
    );
    return attempt(() => {
        const point = secp256k1.Signature.fromBytes(sig.subarray(1), 'compact')
            .addRecoveryBit(flag & 3)
            .recoverPublicKey(hash);
        const compressed = point.toBytes(true);
        switch (addr.type) {
            case 'p2pkh':
                return (
                    equal(hash160(compressed), addr.program) ||
                    equal(hash160(point.toBytes(false)), addr.program)
                );
            case 'p2sh':
                return equal(hash160(scriptFor.p2wpkh(hash160(compressed))), addr.program);
            case 'p2wpkh':
                return equal(hash160(compressed), addr.program);
            case 'p2tr':
                return equal(bip86OutputKey(compressed), addr.program);
            default:
                return false;
        }
    });
}

/**
 * Whether `signatureBase64` signs `message` for `address`: a BIP-322 simple
 * signature from a P2WPKH, P2SH-P2WPKH or single-key P2TR address, or a
 * legacy BIP-137 signature (always, for a P2PKH address). Never throws;
 * anything malformed is simply not a valid signature.
 */
export function verifySignature(address: string, message: string, signatureBase64: string): boolean {
    const addr = decodeAddress(address);
    if (!addr) return false;
    const sig = decodeBase64(signatureBase64);
    if (sig.length === 0) return false;
    // No valid witness serializes to 65 bytes, so a 65-byte blob is BIP-137.
    if (addr.type === 'p2pkh' || sig.length === 65) return verifyBip137(addr, message, sig);
    return verifySimple(addr, message, sig);
}

