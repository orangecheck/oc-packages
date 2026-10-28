import { verifyNostrEvent, type NostrEvent } from '@orangecheck/lock-device';

export type { NostrEvent };
export { verifyNostrEvent };

/** NIP-01 holds and the event is signed by `pubkey`. */
export function signedBy(ev: NostrEvent, pubkey: string): boolean {
    return ev.pubkey === pubkey && verifyNostrEvent(ev);
}
