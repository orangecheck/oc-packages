/**
 * check() resolves its subject from the signed message (SPEC §2) and holds
 * one bond to one identity per protocol (SECURITY.md §3).
 *
 * An in-memory relay serves real REQ filters (#d, #t, #i); signature and chain
 * checks are stubbed so each case isolates discovery and binding.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCanonicalMessage, createAttestationEnvelope } from '../canonical';
import { check } from '../check';
import { createAttestationEvent } from '../nostr';
import { nostrIdentifierForms } from '../nostr-pubkey';
import type { IdentityBinding, NostrEvent } from '../types';

vi.mock('../verify', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../verify')>();
    return {
        ...actual,
        verify: vi.fn(async ({ addr }: { addr: string }) => ({
            ok: true,
            codes: ['sig_ok_bip322', 'bond_confirmed'],
            network: 'mainnet',
            metrics: { sats_bonded: addr === RICH ? 5_000_000 : 1_000, days_unspent: 400, score: 90 },
        })),
    };
});

const RICH = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const POOR = 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l';

// Two real 32-byte keys; forms[0] is the npub, forms[1] the hex.
const KEY_A = nostrIdentifierForms('7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e');
const KEY_B = nostrIdentifierForms('3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d');

let store: NostrEvent[] = [];

function matches(ev: NostrEvent, f: Record<string, unknown>): boolean {
    for (const [k, v] of Object.entries(f)) {
        if (!k.startsWith('#')) continue;
        const want = v as string[];
        if (!ev.tags.some((t) => t[0] === k.slice(1) && want.includes(t[1] ?? ''))) return false;
    }
    return true;
}

class FakeRelay {
    onopen: (() => void) | null = null;
    onmessage: ((m: { data: string }) => void) | null = null;
    onerror: ((e: unknown) => void) | null = null;
    onclose: (() => void) | null = null;
    readyState = 0;
    constructor(public url: string) {
        queueMicrotask(() => {
            this.readyState = 1;
            this.onopen?.();
        });
    }
    send(raw: string): void {
        const [type, sub, filter] = JSON.parse(raw);
        if (type !== 'REQ') return;
        for (const ev of store.filter((e) => matches(e, filter))) {
            this.onmessage?.({ data: JSON.stringify(['EVENT', sub, ev]) });
        }
        this.onmessage?.({ data: JSON.stringify(['EOSE', sub]) });
    }
    close(): void {
        this.readyState = 3;
    }
}

async function attest(address: string, identities: IdentityBinding[], issuedAt: string) {
    const message = buildCanonicalMessage({ address, identities }, {}, { issuedAt });
    const env = await createAttestationEnvelope(message, 'sig', 'bip322', address, identities);
    const ev = { ...createAttestationEvent(env, 'ab'.repeat(32)), id: 'cd'.repeat(32), sig: 'ef'.repeat(64) };
    return { env, ev: ev as NostrEvent };
}

const RELAYS = ['wss://fake.example'];
let realWs: typeof globalThis.WebSocket;

beforeEach(() => {
    store = [];
    realWs = globalThis.WebSocket;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.WebSocket = FakeRelay as any;
});
afterEach(() => {
    globalThis.WebSocket = realWs;
});

describe('check() subject resolution', () => {
    it('finds an npub binding when queried by hex pubkey', async () => {
        const { ev } = await attest(RICH, [{ protocol: 'nostr', identifier: KEY_A[0]! }], '2026-01-01T00:00:00Z');
        store.push(ev);
        const r = await check({ identity: { protocol: 'nostr', identifier: KEY_A[1]! }, relays: RELAYS });
        expect(r.ok).toBe(true);
        expect(r.sats).toBe(5_000_000);
    });

    it('requires the signed identities to include the queried key', async () => {
        const { ev } = await attest(RICH, [{ protocol: 'nostr', identifier: KEY_A[0]! }], '2026-01-01T00:00:00Z');
        const retagged = { ...ev, tags: [...ev.tags, ['i', `nostr:${KEY_B[1]}`]] };
        store.push(retagged);
        const r = await check({ identity: { protocol: 'nostr', identifier: KEY_B[1]! }, relays: RELAYS });
        expect(r.ok).toBe(false);
        expect(r.reasons).toEqual(['not_found']);
    });

    it('requires the signed address to equal the queried address', async () => {
        const { ev } = await attest(RICH, [], '2026-01-01T00:00:00Z');
        store.push({ ...ev, tags: [...ev.tags, ['t', POOR]] });
        const r = await check({ addr: POOR, relays: RELAYS });
        expect(r.reasons).toEqual(['not_found']);
    });

    it('requires the envelope id to equal the queried id', async () => {
        const { env: wanted } = await attest(POOR, [], '2026-01-01T00:00:00Z');
        const { ev: other } = await attest(RICH, [], '2026-02-01T00:00:00Z');
        store.push({ ...other, tags: other.tags.map((t) => (t[0] === 'd' ? ['d', wanted.attestation_id] : t)) });
        const r = await check({ id: wanted.attestation_id, relays: RELAYS });
        expect(r.reasons).toEqual(['not_found']);
    });

    it('one bond, one Nostr key: within one attestation', async () => {
        const { ev } = await attest(
            RICH,
            [
                { protocol: 'nostr', identifier: KEY_A[0]! },
                { protocol: 'nostr', identifier: KEY_B[0]! },
            ],
            '2026-01-01T00:00:00Z'
        );
        store.push(ev);
        const r = await check({ identity: { protocol: 'nostr', identifier: KEY_B[1]! }, relays: RELAYS });
        expect(r.ok).toBe(false);
        expect(r.reasons).toContain('stake_shared');
    });

    it('one bond, one Nostr key: across attestations from one address', async () => {
        store.push((await attest(RICH, [{ protocol: 'nostr', identifier: KEY_A[0]! }], '2026-01-01T00:00:00Z')).ev);
        store.push((await attest(RICH, [{ protocol: 'nostr', identifier: KEY_B[0]! }], '2026-02-01T00:00:00Z')).ev);
        const r = await check({ identity: { protocol: 'nostr', identifier: KEY_A[1]! }, relays: RELAYS });
        expect(r.ok).toBe(false);
        expect(r.reasons).toContain('stake_shared');
    });

    it('counts npub and hex as one key, and other protocols separately', async () => {
        const { ev } = await attest(
            RICH,
            [
                { protocol: 'nostr', identifier: KEY_A[0]! },
                { protocol: 'github', identifier: 'alice' },
            ],
            '2026-01-01T00:00:00Z'
        );
        store.push(ev);
        store.push((await attest(RICH, [{ protocol: 'nostr', identifier: KEY_A[1]! }], '2026-02-01T00:00:00Z')).ev);
        const r = await check({ identity: { protocol: 'nostr', identifier: KEY_A[0]! }, relays: RELAYS });
        expect(r.ok).toBe(true);
        expect(r.reasons).toBeUndefined();
    });
});
