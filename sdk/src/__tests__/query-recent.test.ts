import { createHash } from 'crypto';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { queryRecent } from '../nostr';

type Filter = { kinds?: number[]; limit?: number } & Record<string, unknown>;
type Ev = { id: string; kind: number; tags: string[][]; content: string; created_at: number };

/** A relay that answers a REQ the way NIP-01 relays do: filter, newest first, cut at `limit`. */
function fakeRelay(store: Ev[]) {
    return class FakeWebSocket {
        onopen: (() => void) | null = null;
        onmessage: ((m: { data: string }) => void) | null = null;
        onerror: ((e: unknown) => void) | null = null;
        constructor(_url: string) {
            queueMicrotask(() => this.onopen?.());
        }
        send(raw: string) {
            const [, sub, filter] = JSON.parse(raw) as [string, string, Filter];
            const matches = store
                .filter((e) => !filter.kinds || filter.kinds.includes(e.kind))
                .filter((e) =>
                    Object.entries(filter).every(([k, v]) => {
                        if (!k.startsWith('#') || !Array.isArray(v)) return true;
                        const wanted = v as string[];
                        return e.tags.some((t) => t[0] === k.slice(1) && wanted.includes(t[1]!));
                    })
                )
                .sort((a, b) => b.created_at - a.created_at)
                .slice(0, filter.limit ?? Infinity);
            queueMicrotask(() => {
                for (const e of matches)
                    this.onmessage?.({ data: JSON.stringify(['EVENT', sub, e]) });
                this.onmessage?.({ data: JSON.stringify(['EOSE', sub]) });
            });
        }
        close() {}
    };
}

function attestation(n: number, created_at: number, message?: string): Ev {
    const msg = `orangecheck\naddress: bc1qaddr${n}\nnonce: ${n}`;
    const id = createHash('sha256').update(msg).digest('hex');
    const envelope = {
        attestation_id: id,
        scheme: 'bip322',
        address: `bc1qaddr${n}`,
        identities: [],
        message: message ?? msg,
        signature: 'sig',
        issued_at: new Date(created_at * 1000).toISOString(),
    };
    return {
        id: `oc${n}`,
        kind: 30078,
        created_at,
        content: JSON.stringify(envelope),
        tags: [
            ['d', id],
            ['t', envelope.address],
            ['t', 'oc-attest'],
            ['scheme', 'bip322'],
        ],
    };
}

function foreignAppData(n: number, created_at: number): Ev {
    return {
        id: `app${n}`,
        kind: 30078,
        created_at,
        content: '{}',
        tags: [['d', `some-other-app:settings:${n}`]],
    };
}

describe('queryRecent', () => {
    beforeEach(() => {
        const store = [
            attestation(1, 1_000),
            attestation(2, 2_000),
            // Envelope whose id is not the hash of its message.
            attestation(3, 3_000, 'orangecheck\naddress: bc1qother'),
            // Newer NIP-78 data from other apps fills any unfiltered window.
            ...Array.from({ length: 50 }, (_, i) => foreignAppData(i, 10_000 + i)),
        ];
        vi.stubGlobal('WebSocket', fakeRelay(store));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('finds attestations even when other NIP-78 apps publish more recent kind-30078 events', async () => {
        const envelopes = await queryRecent(['wss://relay.test'], 20);
        expect(envelopes.map((e) => e.address).sort()).toEqual(['bc1qaddr1', 'bc1qaddr2']);
    });

    it('drops envelopes whose attestation_id is not the hash of their message', async () => {
        const envelopes = await queryRecent(['wss://relay.test'], 20);
        expect(envelopes.some((e) => e.address === 'bc1qaddr3')).toBe(false);
    });

    it('returns one envelope per attestation_id when several relays serve it', async () => {
        const envelopes = await queryRecent(['wss://a.test', 'wss://b.test'], 20);
        expect(envelopes.map((e) => e.address).sort()).toEqual(['bc1qaddr1', 'bc1qaddr2']);
    });

    it('asks relays for the oc-attest family marker', async () => {
        const sent: string[] = [];
        const Base = fakeRelay([]);
        vi.stubGlobal(
            'WebSocket',
            class extends Base {
                send(raw: string) {
                    sent.push(raw);
                    super.send(raw);
                }
            }
        );
        await queryRecent(['wss://relay.test'], 7);
        expect(JSON.parse(sent[0]!)[2]).toEqual({ kinds: [30078], '#t': ['oc-attest'], limit: 7 });
    });
});
