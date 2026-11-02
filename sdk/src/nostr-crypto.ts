/**
 * Nostr Cryptographic Functions
 * Implements NIP-01 event ID computation and signature verification
 */

import type { NostrEvent } from './types';

import { schnorr } from '@noble/curves/secp256k1.js';
import { sha256 } from '@noble/hashes/sha2.js';

import { createLogger } from './utils/logger';

type Nip07Window = {
    nostr?: {
        getPublicKey: () => Promise<string>;
        signEvent: (event: Omit<NostrEvent, 'id' | 'sig'>) => Promise<NostrEvent>;
        _metadata?: { name?: string; version?: string };
    };
};

const log = createLogger('ocp/nostr-crypto');

/**
 * Compute Nostr event ID according to NIP-01
 * Event ID is the SHA-256 hash of the serialized event
 * Serialization: [0, pubkey, created_at, kind, tags, content]
 */
export async function computeNostrEventId(event: Omit<NostrEvent, 'id' | 'sig'>): Promise<string> {
    // Serialize event according to NIP-01
    const serialized = JSON.stringify([
        0, // Reserved for future use
        event.pubkey,
        event.created_at,
        event.kind,
        event.tags,
        event.content,
    ]);

    log.debug({ serialized }, 'Computing event ID');

    // Compute SHA-256 hash
    const encoder = new TextEncoder();
    const data = encoder.encode(serialized);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // Convert to lowercase hex
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');

    log.debug({ eventId: hashHex }, 'Computed event ID');

    return hashHex;
}

/**
 * Verify Nostr event ID
 * Recomputes the ID and checks if it matches
 */
export async function verifyNostrEventId(event: NostrEvent): Promise<boolean> {
    const computedId = await computeNostrEventId(event);
    return computedId === event.id;
}

/**
 * Check if NIP-07 extension is available
 * NIP-07 provides window.nostr for signing events
 */
export function isNip07Available(): boolean {
    if (typeof window === 'undefined') {
        return false;
    }

    return !!(window as unknown as { nostr?: Nip07Window['nostr'] }).nostr!;
}

/**
 * Get Nostr public key from NIP-07 extension
 * Returns null if extension not available or user denies
 */
export async function getNostrPublicKey(): Promise<string | null> {
    if (!isNip07Available()) {
        log.warn('NIP-07 extension not available');
        return null;
    }

    try {
        const nostr = (window as unknown as { nostr?: Nip07Window['nostr'] }).nostr!;
        const pubkey = await nostr.getPublicKey();
        log.info({ pubkey }, 'Got Nostr public key from NIP-07');
        return pubkey;
    } catch (err) {
        log.error({ error: err }, 'Failed to get Nostr public key');
        return null;
    }
}

/**
 * Sign Nostr event using NIP-07 extension
 * Returns signed event with id and sig fields
 */
export async function signNostrEvent(
    event: Omit<NostrEvent, 'id' | 'sig'>
): Promise<NostrEvent | null> {
    if (!isNip07Available()) {
        log.warn('NIP-07 extension not available');
        return null;
    }

    try {
        const nostr = (window as unknown as { nostr?: Nip07Window['nostr'] }).nostr!;

        // NIP-07 signEvent expects the event without id and sig
        const signedEvent = await nostr.signEvent(event);

        log.info({ eventId: signedEvent.id }, 'Signed Nostr event with NIP-07');

        return signedEvent as NostrEvent;
    } catch (err) {
        log.error({ error: err }, 'Failed to sign Nostr event');
        return null;
    }
}

// Previously this file exported `generateEphemeralKeypair()` and
// `signEventWithEphemeralKey()` for demo purposes. Both produced non-schnorr
// values that Nostr relays would silently reject — creating the false
// impression that publishing had succeeded. They have been removed. All Nostr
// signing now flows through `signNostrEvent()` / `window.nostr` (NIP-07).

/**
 * Validate Nostr event structure
 */
export function validateNostrEvent(event: unknown): event is NostrEvent {
    if (typeof event !== 'object' || event === null) return false;
    const e = event as Record<string, unknown>;

    if (typeof e.id !== 'string' || (e.id as string).length !== 64) return false;
    if (typeof e.pubkey !== 'string' || (e.pubkey as string).length !== 64) return false;
    if (typeof e.created_at !== 'number') return false;
    if (typeof e.kind !== 'number') return false;
    if (!Array.isArray(e.tags)) return false;
    if (typeof e.content !== 'string') return false;
    if (typeof e.sig !== 'string' || (e.sig as string).length !== 128) return false;

    return true;
}

/**
 * Get NIP-07 extension info
 */
export function getNip07Info(): {
    available: boolean;
    name?: string;
    version?: string;
} {
    if (!isNip07Available()) {
        return { available: false };
    }

    const nostr = (window as unknown as { nostr?: Nip07Window['nostr'] }).nostr!;

    return {
        available: true,
        name: nostr._metadata?.name,
        version: nostr._metadata?.version,
    };
}

const HEX_64_RE = /^[0-9a-f]{64}$/;

function toHex(bytes: Uint8Array): string {
    let out = '';
    for (const b of bytes) out += b.toString(16).padStart(2, '0');
    return out;
}

function fromHex(hex: string): Uint8Array {
    if (hex.length % 2 !== 0) throw new Error('odd-length hex');
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) {
        out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    }
    return out;
}

/**
 * Whether a Nostr event is what it claims under NIP-01: its id is the SHA-256 of
 * its serialized fields and its schnorr signature verifies for its pubkey.
 *
 *   id    = sha256(JSON.stringify([0, pubkey, created_at, kind, tags, content]))
 *   check = schnorr_verify(id, pubkey, sig)
 *
 * Fails closed on any shape problem, decoding error, or mismatch. A true
 * return proves the event came from its own `pubkey`, nothing more.
 */
export function nostrEventSignatureValid(event: NostrEvent): boolean {
    try {
        if (
            !event.id ||
            !event.sig ||
            !event.pubkey ||
            typeof event.id !== 'string' ||
            typeof event.sig !== 'string' ||
            typeof event.pubkey !== 'string' ||
            event.sig.length !== 128 ||
            !HEX_64_RE.test(event.id) ||
            !HEX_64_RE.test(event.pubkey)
        ) {
            return false;
        }

        // Recompute the event id from the canonical NIP-01 preimage. If the
        // relay (or an attacker) altered any field since signing, id won't
        // match and we reject.
        const preimage = JSON.stringify([
            0,
            event.pubkey,
            event.created_at,
            event.kind,
            event.tags ?? [],
            event.content ?? '',
        ]);
        const computedId = toHex(sha256(new TextEncoder().encode(preimage)));
        if (computedId !== event.id.toLowerCase()) {
            log.warn(
                { eventId: event.id, computedId },
                'nostr event id does not match its content'
            );
            return false;
        }

        return schnorr.verify(fromHex(event.sig), fromHex(event.id), fromHex(event.pubkey));
    } catch (err) {
        log.warn({ err }, 'schnorr verify threw');
        return false;
    }
}
