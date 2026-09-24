// OpenTimestamps proof format: parse, walk, serialize, merge.
//
// Follows python-opentimestamps (core/timestamp.py, core/op.py,
// core/notary.py). Two encodings are accepted:
//
//   - a bare timestamp rooted at the digest (what an OTS calendar returns from
//     POST /digest, and what OC Stamp envelopes carry in `ots.proof`);
//   - a detached `.ots` file (magic header + file-hash op + digest + timestamp).

import { ripemd160, sha1 } from '@noble/hashes/legacy';
import { sha256 } from '@noble/hashes/sha2';
import { keccak_256 } from '@noble/hashes/sha3';

import { hexEncode } from './base64.js';

const HEADER_MAGIC = new Uint8Array([
    0x00, 0x4f, 0x70, 0x65, 0x6e, 0x54, 0x69, 0x6d, 0x65, 0x73, 0x74, 0x61, 0x6d, 0x70, 0x73, 0x00,
    0x00, 0x50, 0x72, 0x6f, 0x6f, 0x66, 0x00, 0xbf, 0x89, 0xe2, 0xe8, 0x84, 0xe8, 0x92, 0x94,
]);

const TAG_BITCOIN = '0588960d73d71901';
const TAG_PENDING = '83dfe30d2ef90c8e';

const MAX_DEPTH = 256;
const MAX_MSG = 4096;

export type OtsOp =
    | { kind: 'sha256' | 'ripemd160' | 'sha1' | 'keccak256' | 'reverse' | 'hexlify' }
    | { kind: 'append' | 'prepend'; arg: Uint8Array };

export type OtsAttestation =
    | { kind: 'bitcoin'; height: number }
    | { kind: 'pending'; uri: string }
    | { kind: 'unknown'; tag: string; payload: Uint8Array };

export interface OtsTimestamp {
    /** The message at this node: the digest after every op on the path to it. */
    msg: Uint8Array;
    attestations: OtsAttestation[];
    ops: { op: OtsOp; child: OtsTimestamp }[];
}

class Reader {
    private pos = 0;
    constructor(private readonly buf: Uint8Array) {}
    byte(): number {
        if (this.pos >= this.buf.length) throw new Error('ots: unexpected end of proof');
        return this.buf[this.pos++]!;
    }
    bytes(n: number): Uint8Array {
        if (n < 0 || this.pos + n > this.buf.length) throw new Error('ots: unexpected end of proof');
        const out = this.buf.subarray(this.pos, this.pos + n);
        this.pos += n;
        return out;
    }
    varuint(): number {
        let value = 0;
        let shift = 0;
        for (;;) {
            const b = this.byte();
            value += (b & 0x7f) * 2 ** shift;
            if (!(b & 0x80)) return value;
            shift += 7;
            if (shift > 49) throw new Error('ots: varuint too large');
        }
    }
    varbytes(max: number): Uint8Array {
        const n = this.varuint();
        if (n > max) throw new Error('ots: varbytes too long');
        return this.bytes(n);
    }
    get done(): boolean {
        return this.pos === this.buf.length;
    }
}

const UNARY: Record<number, OtsOp['kind']> = {
    0x02: 'sha1',
    0x03: 'ripemd160',
    0x08: 'sha256',
    0x67: 'keccak256',
    0xf2: 'reverse',
    0xf3: 'hexlify',
};

export function applyOp(op: OtsOp, msg: Uint8Array): Uint8Array {
    switch (op.kind) {
        case 'sha256':
            return sha256(msg);
        case 'ripemd160':
            return ripemd160(msg);
        case 'sha1':
            return sha1(msg);
        case 'keccak256':
            return keccak_256(msg);
        case 'reverse':
            return new Uint8Array(msg).reverse();
        case 'hexlify':
            return new TextEncoder().encode(hexEncode(msg));
        case 'append':
            return concat(msg, op.arg);
        case 'prepend':
            return concat(op.arg, msg);
    }
}

function readOp(r: Reader, tag: number): OtsOp {
    const unary = UNARY[tag];
    if (unary) return { kind: unary } as OtsOp;
    if (tag === 0xf0) return { kind: 'append', arg: r.varbytes(MAX_MSG) };
    if (tag === 0xf1) return { kind: 'prepend', arg: r.varbytes(MAX_MSG) };
    throw new Error(`ots: unknown op tag 0x${tag.toString(16)}`);
}

function readAttestation(r: Reader): OtsAttestation {
    const tag = hexEncode(r.bytes(8));
    const payload = r.varbytes(8192);
    const p = new Reader(payload);
    if (tag === TAG_BITCOIN) return { kind: 'bitcoin', height: p.varuint() };
    if (tag === TAG_PENDING) return { kind: 'pending', uri: new TextDecoder().decode(p.varbytes(1000)) };
    return { kind: 'unknown', tag, payload };
}

function readTimestamp(r: Reader, msg: Uint8Array, depth: number): OtsTimestamp {
    if (depth > MAX_DEPTH) throw new Error('ots: proof too deep');
    const node: OtsTimestamp = { msg, attestations: [], ops: [] };
    const item = (tag: number) => {
        if (tag === 0x00) {
            node.attestations.push(readAttestation(r));
            return;
        }
        const op = readOp(r, tag);
        const next = applyOp(op, msg);
        if (next.length > MAX_MSG) throw new Error('ots: message too long');
        node.ops.push({ op, child: readTimestamp(r, next, depth + 1) });
    };
    let tag = r.byte();
    while (tag === 0xff) {
        item(r.byte());
        tag = r.byte();
    }
    item(tag);
    return node;
}

/** Parse a bare timestamp whose root message is `digest`. */
export function parseTimestamp(bytes: Uint8Array, digest: Uint8Array): OtsTimestamp {
    const r = new Reader(bytes);
    const ts = readTimestamp(r, digest, 0);
    if (!r.done) throw new Error('ots: trailing bytes after timestamp');
    return ts;
}

export function isDetached(bytes: Uint8Array): boolean {
    return bytes.length > HEADER_MAGIC.length && bytesEqual(bytes.subarray(0, HEADER_MAGIC.length), HEADER_MAGIC);
}

/** Parse a detached `.ots` file. Only sha256 file digests are accepted. */
export function parseDetached(bytes: Uint8Array): { digest: Uint8Array; timestamp: OtsTimestamp } {
    if (!isDetached(bytes)) throw new Error('ots: missing detached-file header');
    const r = new Reader(bytes.subarray(HEADER_MAGIC.length));
    const major = r.varuint();
    if (major !== 1) throw new Error(`ots: unsupported file version ${major}`);
    if (r.byte() !== 0x08) throw new Error('ots: only sha256 file digests are supported');
    const digest = new Uint8Array(r.bytes(32));
    const timestamp = readTimestamp(r, digest, 0);
    if (!r.done) throw new Error('ots: trailing bytes after timestamp');
    return { digest, timestamp };
}

/**
 * Parse either encoding and require that it commits to `digest`. A detached
 * file for some other digest is rejected rather than walked.
 */
export function parseProof(bytes: Uint8Array, digest: Uint8Array): OtsTimestamp {
    if (!isDetached(bytes)) return parseTimestamp(bytes, digest);
    const d = parseDetached(bytes);
    if (!bytesEqual(d.digest, digest)) throw new Error('ots: proof commits to a different digest');
    return d.timestamp;
}

/** Every attestation in the tree with the message it attests to. */
export function attestations(ts: OtsTimestamp): { msg: Uint8Array; attestation: OtsAttestation }[] {
    const out: { msg: Uint8Array; attestation: OtsAttestation }[] = [];
    const walk = (n: OtsTimestamp) => {
        for (const a of n.attestations) out.push({ msg: n.msg, attestation: a });
        for (const { child } of n.ops) walk(child);
    };
    walk(ts);
    return out;
}

/**
 * Bitcoin attestations, lowest height first. `merkleRoot` is the message at
 * the attestation, which equals the block header's Merkle root in header
 * byte order.
 */
export function bitcoinAnchors(ts: OtsTimestamp): { blockHeight: number; merkleRoot: Uint8Array }[] {
    return attestations(ts)
        .flatMap(({ msg, attestation }) =>
            attestation.kind === 'bitcoin' ? [{ blockHeight: attestation.height, merkleRoot: msg }] : []
        )
        .sort((a, b) => a.blockHeight - b.blockHeight);
}

/** Pending calendar attestations: where to ask, and the commitment to ask for. */
export function pendingCommitments(ts: OtsTimestamp): { uri: string; commitment: Uint8Array }[] {
    return attestations(ts).flatMap(({ msg, attestation }) =>
        attestation.kind === 'pending' ? [{ uri: attestation.uri, commitment: msg }] : []
    );
}

/**
 * Graft `upgrade` (a timestamp rooted at some node's message) onto the node
 * with that message, as python-opentimestamps' Timestamp.merge does. Returns
 * false when no node carries that message.
 */
export function mergeAt(ts: OtsTimestamp, upgrade: OtsTimestamp): boolean {
    if (bytesEqual(ts.msg, upgrade.msg)) {
        for (const a of upgrade.attestations) {
            if (!ts.attestations.some((b) => attestationKey(b) === attestationKey(a))) ts.attestations.push(a);
        }
        for (const { op, child } of upgrade.ops) {
            const same = ts.ops.find((o) => opKey(o.op) === opKey(op));
            if (same) mergeAt(same.child, child);
            else ts.ops.push({ op, child });
        }
        return true;
    }
    return ts.ops.some(({ child }) => mergeAt(child, upgrade));
}

function writeVaruint(out: number[], n: number) {
    do {
        let b = n % 128;
        n = Math.floor(n / 128);
        if (n > 0) b |= 0x80;
        out.push(b);
    } while (n > 0);
}

function writeVarbytes(out: number[], bytes: Uint8Array) {
    writeVaruint(out, bytes.length);
    out.push(...bytes);
}

const OP_TAG: Record<OtsOp['kind'], number> = {
    sha1: 0x02,
    ripemd160: 0x03,
    sha256: 0x08,
    keccak256: 0x67,
    append: 0xf0,
    prepend: 0xf1,
    reverse: 0xf2,
    hexlify: 0xf3,
};

function writeAttestation(out: number[], a: OtsAttestation) {
    const payload: number[] = [];
    let tag: string;
    if (a.kind === 'bitcoin') {
        tag = TAG_BITCOIN;
        writeVaruint(payload, a.height);
    } else if (a.kind === 'pending') {
        tag = TAG_PENDING;
        writeVarbytes(payload, new TextEncoder().encode(a.uri));
    } else {
        tag = a.tag;
        payload.push(...a.payload);
    }
    out.push(0x00);
    for (let i = 0; i < 16; i += 2) out.push(parseInt(tag.slice(i, i + 2), 16));
    writeVarbytes(out, new Uint8Array(payload));
}

function writeTimestamp(out: number[], ts: OtsTimestamp) {
    const items: (() => void)[] = [
        ...ts.attestations.map((a) => () => writeAttestation(out, a)),
        ...ts.ops.map(({ op, child }) => () => {
            out.push(OP_TAG[op.kind]);
            if (op.kind === 'append' || op.kind === 'prepend') writeVarbytes(out, op.arg);
            writeTimestamp(out, child);
        }),
    ];
    if (items.length === 0) throw new Error('ots: cannot serialize an empty timestamp node');
    items.forEach((write, i) => {
        if (i < items.length - 1) out.push(0xff);
        write();
    });
}

/** Serialize as a bare timestamp (the encoding carried in `ots.proof`). */
export function serializeTimestamp(ts: OtsTimestamp): Uint8Array {
    const out: number[] = [];
    writeTimestamp(out, ts);
    return new Uint8Array(out);
}

function attestationKey(a: OtsAttestation): string {
    if (a.kind === 'bitcoin') return `b:${a.height}`;
    if (a.kind === 'pending') return `p:${a.uri}`;
    return `u:${a.tag}:${hexEncode(a.payload)}`;
}

function opKey(op: OtsOp): string {
    return 'arg' in op ? `${op.kind}:${hexEncode(op.arg)}` : op.kind;
}

function concat(a: Uint8Array, b: Uint8Array): Uint8Array {
    const out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
}

export function bytesEqual(a: Uint8Array, b: Uint8Array): boolean {
    if (a.byteLength !== b.byteLength) return false;
    for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
    return true;
}
