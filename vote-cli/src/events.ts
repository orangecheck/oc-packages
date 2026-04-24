// Build NIP-01 events for oc-vote kinds 30080/30081/30082.
// Mirror of oc-vote-web/src/lib/vote/events.ts but node-safe (uses @noble only).

import { schnorr } from '@noble/curves/secp256k1';
import { sha256 } from '@noble/hashes/sha256';
import { bytesToHex, hexToBytes, randomBytes } from '@noble/hashes/utils';

import { canonicalBytes, ballotId, pollId, revealId } from '@orangecheck/vote-core';
import type { Ballot, Poll, Reveal } from '@orangecheck/vote-core';

import type { NostrEvent } from './nostr.js';

function nip01Id(pubkey: string, created_at: number, kind: number, tags: string[][], content: string): string {
    const serialized = JSON.stringify([0, pubkey, created_at, kind, tags, content]);
    return bytesToHex(sha256(new TextEncoder().encode(serialized)));
}

function sign(kind: number, tags: string[][], content: string): NostrEvent {
    const sk = randomBytes(32);
    const pubkey = bytesToHex(schnorr.getPublicKey(sk));
    const created_at = Math.floor(Date.now() / 1000);
    const id = nip01Id(pubkey, created_at, kind, tags, content);
    const sig = bytesToHex(schnorr.sign(hexToBytes(id), sk));
    return { id, pubkey, created_at, kind, tags, content, sig };
}

export function buildPollEvent(poll: Poll): NostrEvent {
    const pid = pollId(poll);
    const content = canonicalBytes(poll).trimEnd();
    const snapshot =
        typeof poll.snapshot_block === 'number' ? String(poll.snapshot_block) : poll.snapshot_block;
    return sign(30080, [
        ['d', `oc-vote:poll:${pid}`],
        ['poll_id', pid],
        ['creator', poll.creator],
        ['deadline', poll.deadline],
        ['snapshot', snapshot],
        ['mode', poll.mode],
    ], content);
}

export function buildBallotEvent(ballot: Ballot): NostrEvent {
    const bid = ballotId(ballot);
    const content = canonicalBytes(ballot).trimEnd();
    return sign(30081, [
        ['d', `oc-vote:ballot:${ballot.poll_id}:${ballot.voter}`],
        ['poll_id', ballot.poll_id],
        ['voter', ballot.voter],
        ['ballot_id', bid],
    ], content);
}

export function buildRevealEvent(reveal: Reveal): NostrEvent {
    const rid = revealId(reveal);
    const content = canonicalBytes(reveal).trimEnd();
    return sign(30082, [
        ['d', `oc-vote:reveal:${reveal.poll_id}`],
        ['poll_id', reveal.poll_id],
        ['reveal_id', rid],
    ], content);
}
