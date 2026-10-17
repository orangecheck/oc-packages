/**
 * OC Attest bonds (oc-attest-protocol BOND.md): one unspent coin, pledged by
 * its holder to back one subject. The coin never moves and nobody holds it;
 * spending it ends the bond. An audience sees only floors and a per-audience
 * nullifier, never the coin.
 */
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import { decodeAddress, verifySignature } from '@orangecheck/bip322';

const HEADER = 'orangecheck-bond';
const ACK = 'I pledge this coin to back this subject. It stays in my wallet.';
const FIELDS = ['address', 'outpoint', 'subject', 'nonce', 'issued_at', 'expires_at'] as const;

/** Value floors a bond claim reports, in sats (BOND.md §5). */
export const BOND_SATS_FLOORS = [1_000, 10_000, 100_000, 1_000_000, 10_000_000] as const;
/** Age floors a bond claim reports, in days of 144 blocks (BOND.md §5). */
export const BOND_DAYS_FLOORS = [7, 30, 90, 365] as const;
/** Confirmations a verifier requires by default (BOND.md §3.5). */
export const BOND_MIN_CONFIRMATIONS = 6;

export interface BondFields {
    address: string;
    /** `<txid>:<vout>`, txid in display order. */
    outpoint: string;
    subject: string;
    nonce: string;
    issued_at: string;
    expires_at: string;
}

export type BondReason =
    | 'bond_malformed'
    | 'bond_subject_mismatch'
    | 'bond_expired'
    | 'bond_not_yet_valid'
    | 'sig_invalid'
    | 'coin_not_found'
    | 'coin_address_mismatch'
    | 'coin_unconfirmed'
    | 'coin_too_recent'
    | 'coin_spent'
    | 'chain_unavailable';

export interface BondCoin {
    /** Output value in sats. */
    sats: number;
    /** scriptPubKey of the output, lowercase hex. */
    scriptPubKey: string;
    /** Height of the block that confirmed it, or null while unconfirmed. */
    confirmedHeight: number | null;
    spent: boolean;
}

export interface ChainTip {
    height: number;
    hash: string;
}

/** Where a verifier reads chain state. `esploraSource` is the stock one. */
export interface BondChainSource {
    tip(): Promise<ChainTip>;
    /** The output at `outpoint`, or null when there is none. */
    coin(outpoint: string): Promise<BondCoin | null>;
}

export interface VerifiedBond {
    bond_id: string;
    subject: string;
    address: string;
    outpoint: string;
    sats: number;
    confirmed_height: number;
    tip: ChainTip;
}

export type BondResult = { ok: true; bond: VerifiedBond } | { ok: false; reason: BondReason };

const OUTPOINT_RE = /^[0-9a-f]{64}:(0|[1-9][0-9]{0,9})$/;
const NONCE_RE = /^[0-9a-f]{32}$/;
const TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/;
const SUBJECT_RE = /^[\x21-\x7e]{1,256}$/;

function iso(d: Date): string {
    return d.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

function randomNonce(): string {
    const b = new Uint8Array(16);
    globalThis.crypto.getRandomValues(b);
    return bytesToHex(b);
}

function wellFormed(f: BondFields): boolean {
    return (
        decodeAddress(f.address) !== null &&
        OUTPOINT_RE.test(f.outpoint) &&
        SUBJECT_RE.test(f.subject) &&
        NONCE_RE.test(f.nonce) &&
        TIME_RE.test(f.issued_at) &&
        TIME_RE.test(f.expires_at) &&
        Date.parse(f.expires_at) > Date.parse(f.issued_at)
    );
}

/** The exact text the holder signs (BOND.md §2). */
export function buildBondMessage(fields: BondFields): string {
    if (!wellFormed(fields)) throw new Error('bond fields are malformed');
    return [HEADER, ...FIELDS.map((k) => `${k}: ${fields[k]}`), `ack: ${ACK}`].join('\n') + '\n';
}

/** A fresh bond message with a random nonce and a short signing window. */
export function issueBondMessage(opts: {
    address: string;
    outpoint: string;
    subject: string;
    /** Signing window in seconds. Default 600. */
    ttlSeconds?: number;
    now?: Date;
}): { message: string; nonce: string; expiresAt: number } {
    const now = opts.now ?? new Date();
    const expires = new Date(now.getTime() + (opts.ttlSeconds ?? 600) * 1000);
    const nonce = randomNonce();
    const message = buildBondMessage({
        address: opts.address,
        outpoint: opts.outpoint,
        subject: opts.subject,
        nonce,
        issued_at: iso(now),
        expires_at: iso(expires),
    });
    return { message, nonce, expiresAt: expires.getTime() };
}

/** The fields of a well-formed bond message, or null. Strict: §2 or nothing. */
export function parseBondMessage(message: string): BondFields | null {
    if (!message.endsWith('\n') || message.includes('\r')) return null;
    const lines = message.slice(0, -1).split('\n');
    if (lines.length !== FIELDS.length + 2 || lines[0] !== HEADER) return null;
    if (lines[lines.length - 1] !== `ack: ${ACK}`) return null;
    const out: Record<string, string> = {};
    for (const [i, key] of FIELDS.entries()) {
        const line = lines[i + 1]!;
        const prefix = `${key}: `;
        if (!line.startsWith(prefix)) return null;
        out[key] = line.slice(prefix.length);
    }
    const fields = out as unknown as BondFields;
    return wellFormed(fields) && buildBondMessage(fields) === message ? fields : null;
}

/** `bond_id`: SHA-256 of the message bytes, lowercase hex (BOND.md §2). */
export function bondId(message: string): string {
    return bytesToHex(sha256(utf8ToBytes(message)));
}

/** The per-audience nullifier for a coin (BOND.md §6). */
export function bondNullifier(audience: string, outpoint: string): string {
    return bytesToHex(sha256(utf8ToBytes(`orangecheck-bond-nullifier\n${audience}\n${outpoint}`)));
}

/** The largest floor each value meets, 0 when it meets none (BOND.md §5). */
export function bondFloors(sats: number, ageBlocks: number): { sats_floor: number; days_floor: number } {
    const days = Math.floor(ageBlocks / 144);
    const floor = (ladder: readonly number[], v: number) =>
        ladder.filter((f) => v >= f).reduce((a, b) => Math.max(a, b), 0);
    return { sats_floor: floor(BOND_SATS_FLOORS, sats), days_floor: floor(BOND_DAYS_FLOORS, days) };
}

/**
 * Check a signed bond message: shape, subject, signing window and signature.
 * No chain access. `checkBondCoin` does the rest.
 */
export function verifyBondSignature(opts: {
    message: string;
    signature: string;
    subject?: string;
    now?: Date;
    /** Tolerated clock skew in seconds. Default 60. */
    skewSeconds?: number;
}): { ok: true; fields: BondFields; bond_id: string } | { ok: false; reason: BondReason } {
    const fields = parseBondMessage(opts.message);
    if (!fields) return { ok: false, reason: 'bond_malformed' };
    if (opts.subject !== undefined && fields.subject !== opts.subject) {
        return { ok: false, reason: 'bond_subject_mismatch' };
    }
    const now = (opts.now ?? new Date()).getTime();
    const skew = (opts.skewSeconds ?? 60) * 1000;
    if (Date.parse(fields.issued_at) - skew > now) return { ok: false, reason: 'bond_not_yet_valid' };
    if (Date.parse(fields.expires_at) + skew < now) return { ok: false, reason: 'bond_expired' };
    if (!verifySignature(fields.address, opts.message, opts.signature)) {
        return { ok: false, reason: 'sig_invalid' };
    }
    return { ok: true, fields, bond_id: bondId(opts.message) };
}

/**
 * Is the coin at `outpoint` an unspent, confirmed output of `address` at the
 * current tip? The re-check a registry runs before vouching again (§3.6).
 */
export async function checkBondCoin(opts: {
    address: string;
    outpoint: string;
    source: BondChainSource;
    minConfirmations?: number;
}): Promise<
    | { ok: true; sats: number; confirmed_height: number; tip: ChainTip }
    | { ok: false; reason: BondReason }
> {
    const decoded = decodeAddress(opts.address);
    if (!decoded || !OUTPOINT_RE.test(opts.outpoint)) return { ok: false, reason: 'bond_malformed' };
    let coin: BondCoin | null;
    let tip: ChainTip;
    try {
        [coin, tip] = await Promise.all([opts.source.coin(opts.outpoint), opts.source.tip()]);
    } catch {
        return { ok: false, reason: 'chain_unavailable' };
    }
    if (!coin) return { ok: false, reason: 'coin_not_found' };
    if (coin.scriptPubKey !== bytesToHex(decoded.scriptPubKey)) {
        return { ok: false, reason: 'coin_address_mismatch' };
    }
    if (coin.confirmedHeight === null) return { ok: false, reason: 'coin_unconfirmed' };
    if (coin.spent) return { ok: false, reason: 'coin_spent' };
    const confirmations = tip.height - coin.confirmedHeight + 1;
    if (confirmations < (opts.minConfirmations ?? BOND_MIN_CONFIRMATIONS)) {
        return { ok: false, reason: 'coin_too_recent' };
    }
    return { ok: true, sats: coin.sats, confirmed_height: coin.confirmedHeight, tip };
}

/** Full verification at registration: the signature, then the coin (BOND.md §3). */
export async function verifyBond(opts: {
    message: string;
    signature: string;
    source: BondChainSource;
    subject?: string;
    now?: Date;
    minConfirmations?: number;
}): Promise<BondResult> {
    const sig = verifyBondSignature(opts);
    if (!sig.ok) return sig;
    const coin = await checkBondCoin({
        address: sig.fields.address,
        outpoint: sig.fields.outpoint,
        source: opts.source,
        minConfirmations: opts.minConfirmations,
    });
    if (!coin.ok) return coin;
    return {
        ok: true,
        bond: {
            bond_id: sig.bond_id,
            subject: sig.fields.subject,
            address: sig.fields.address,
            outpoint: sig.fields.outpoint,
            sats: coin.sats,
            confirmed_height: coin.confirmed_height,
            tip: coin.tip,
        },
    };
}

/**
 * Chain state from one Esplora-compatible API (mempool.space by default).
 * One base, no silent fallback: a verifier names the source it trusts.
 */
export function esploraSource(
    base = 'https://mempool.space/api',
    opts: { timeoutMs?: number; fetch?: typeof fetch } = {}
): BondChainSource {
    const get = async (path: string): Promise<Response> => {
        const r = await (opts.fetch ?? fetch)(`${base}${path}`, {
            signal: AbortSignal.timeout(opts.timeoutMs ?? 5000),
        });
        if (!r.ok && r.status !== 404) throw new Error(`esplora ${path}: HTTP ${r.status}`);
        return r;
    };
    return {
        async tip() {
            const [h, hash] = await Promise.all([get('/blocks/tip/height'), get('/blocks/tip/hash')]);
            return { height: Number(await h.text()), hash: (await hash.text()).trim() };
        },
        async coin(outpoint) {
            const [txid, voutStr] = outpoint.split(':');
            const vout = Number(voutStr);
            const txr = await get(`/tx/${txid}`);
            if (txr.status === 404) return null;
            const tx = (await txr.json()) as {
                vout: { value: number; scriptpubkey: string }[];
                status: { confirmed: boolean; block_height?: number };
            };
            const out = tx.vout[vout];
            if (!out) return null;
            const spend = (await (await get(`/tx/${txid}/outspend/${vout}`)).json()) as {
                spent: boolean;
            };
            return {
                sats: out.value,
                scriptPubKey: out.scriptpubkey.toLowerCase(),
                confirmedHeight: tx.status.confirmed ? (tx.status.block_height ?? null) : null,
                spent: spend.spent,
            };
        },
    };
}
