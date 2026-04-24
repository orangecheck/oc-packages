// poll_id / ballot_id / reveal_id per SPEC §7.1–§7.3.
//
// Each id is SHA-256(canonical bytes of the object with sig.value set to the empty string).
// The id is then committed to by the BIP-322 signature in sig.value.

import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex } from '@noble/hashes/utils';

import { canonicalBytes } from './canonical.js';
import type { Ballot, Poll, Reveal } from './types.js';

function sha256Hex(utf8: string): string {
    return bytesToHex(sha256(new TextEncoder().encode(utf8)));
}

export function pollId(poll: Poll): string {
    const clone = deepClone(poll);
    clone.sig.value = '';
    return sha256Hex(canonicalBytes(clone));
}

export function ballotId(ballot: Ballot): string {
    const clone = deepClone(ballot);
    clone.sig.value = '';
    return sha256Hex(canonicalBytes(clone));
}

export function revealId(reveal: Reveal): string {
    const clone = deepClone(reveal);
    clone.sig.value = '';
    return sha256Hex(canonicalBytes(clone));
}

function deepClone<T>(v: T): T {
    // structuredClone is available everywhere we ship (Node 18+, all modern browsers).
    return structuredClone(v);
}
