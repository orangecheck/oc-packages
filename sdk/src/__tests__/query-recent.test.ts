import { createHash } from 'crypto';

import { schnorr } from '@noble/curves/secp256k1.js';
import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCanonicalMessage } from '../canonical';
import { queryRecent } from '../nostr';

type Filter = { kinds?: number[]; limit?: number } & Record<string, unknown>;
type Ev = {
    id: string;
    kind: number;
    pubkey: string;
    tags: string[][];
    content: string;
    created_at: number;
    sig: string;
};

const sha256Hex = (s: string) => createHash('sha256').update(s).digest('hex');
const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
const NOSTR_KEY = schnorr.utils.randomSecretKey();

/** A Nostr event signed under NIP-01 by a real key, as relays hold them. */
function nostrEvent(e: Omit<Ev, 'id' | 'pubkey' | 'sig'>): Ev {
    const pubkey = hex(schnorr.getPublicKey(NOSTR_KEY));
    const id = sha256Hex(JSON.stringify([0, pubkey, e.created_at, e.kind, e.tags, e.content]));
    return { ...e, pubkey, id, sig: hex(schnorr.sign(Buffer.from(id, 'hex'), NOSTR_KEY)) };
}

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

/** Attestation `n`'s key and address: a real BIP-322 signer per n. */
const keyOf = (n: number) => (0x10 + n).toString(16).padStart(2, '0').repeat(32);
const addressOf = (n: number) => addressFromPrivateKey(keyOf(n), 'p2wpkh');
const JUNK_SIG = 'AkcwRAIgjunk';

/**
 * Attestation `n`, really signed, in a kind-30078 event. `message` replaces the
 * message its id was computed over; `junk` puts a signature that does not
 * verify beside it.
 */
function attestation(n: number, created_at: number, opts: { message?: string; junk?: boolean } = {}): Ev {
    const address = addressOf(n);
    const issuedAt = new Date(created_at * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z');
    const msg = buildCanonicalMessage({ address, identities: [] }, {}, {
        nonce: n.toString(16).padStart(32, '0'),
        issuedAt,
    });
    const id = sha256Hex(msg);
    const envelope = {
        attestation_id: id,
        scheme: 'bip322',
        address,
        identities: [],
        message: opts.message ?? msg,
        signature: opts.junk ? JUNK_SIG : signMessage(address, msg, keyOf(n)),
        issued_at: issuedAt,
    };
    return nostrEvent({
        kind: 30078,
        created_at,
        content: JSON.stringify(envelope),
        tags: [
            ['d', id],
            ['t', address],
            ['t', 'oc-attest'],
            ['scheme', 'bip322'],
        ],
    });
}

function foreignAppData(n: number, created_at: number): Ev {
    return nostrEvent({
        kind: 30078,
        created_at,
        content: '{}',
        tags: [['d', `some-other-app:settings:${n}`]],
    });
}

describe('queryRecent', () => {
    beforeEach(() => {
        const store = [
            attestation(1, 1_000),
            attestation(2, 2_000),
            // Envelope whose id is not the hash of its message.
            attestation(3, 3_000, { message: 'orangecheck\naddress: bc1qother' }),
            // Newer NIP-78 data from other apps fills any unfiltered window.
            ...Array.from({ length: 50 }, (_, i) => foreignAppData(i, 10_000 + i)),
        ];
        vi.stubGlobal('WebSocket', fakeRelay(store));
    });
    afterEach(() => vi.unstubAllGlobals());

    it('finds attestations even when other NIP-78 apps publish more recent kind-30078 events', async () => {
        const envelopes = await queryRecent(['wss://relay.test'], 20);
        expect(envelopes.map((e) => e.address).sort()).toEqual([addressOf(1), addressOf(2)].sort());
    });

    it('drops envelopes whose attestation_id is not the hash of their message', async () => {
        const envelopes = await queryRecent(['wss://relay.test'], 20);
        expect(envelopes.some((e) => e.address === addressOf(3))).toBe(false);
    });

    it('returns one envelope per attestation_id when several relays serve it', async () => {
        const envelopes = await queryRecent(['wss://a.test', 'wss://b.test'], 20);
        expect(envelopes.map((e) => e.address).sort()).toEqual([addressOf(1), addressOf(2)].sort());
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

describe('queryRecent counts only attestations whose signature verifies (OC Attest §6.1 rule 4, §7.2)', () => {
    afterEach(() => vi.unstubAllGlobals());
    const read = async (store: Ev[]) => {
        vi.stubGlobal('WebSocket', fakeRelay(store));
        return queryRecent(['wss://relay.test'], 20);
    };

    it('leaves out an attestation whose only copy has a junk signature', async () => {
        const out = await read([attestation(1, 1_000), attestation(4, 4_000, { junk: true })]);
        expect(out.map((e) => e.address)).toEqual([addressOf(1)]);
    });

    it('keeps the valid copy when a junk-signature copy of the same message is read first', async () => {
        const valid = attestation(4, 4_000);
        // The same signed message beside a junk signature, in a newer event that relays answer first.
        const junkFirst = nostrEvent({
            kind: 30078,
            created_at: 5_000,
            content: JSON.stringify({ ...JSON.parse(valid.content), signature: JUNK_SIG }),
            tags: valid.tags,
        });
        const out = await read([junkFirst, valid]);
        expect(out.map((e) => [e.address, e.signature])).toEqual([
            [addressOf(4), JSON.parse(valid.content).signature],
        ]);
    });

    it('drops an event whose id is not its hash or whose Nostr signature fails, though the attestation in it verifies', async () => {
        const real = attestation(1, 1_000);
        const last = real.sig.at(-1) === '0' ? '1' : '0';
        expect(await read([{ ...real, id: 'c'.repeat(64) }])).toEqual([]);
        expect(await read([{ ...real, sig: real.sig.slice(0, -1) + last }])).toEqual([]);
        expect((await read([real])).map((e) => e.address)).toEqual([addressOf(1)]);
    });

    it('drops an event of another kind or without the oc-attest marker, from a relay that ignores the filter', async () => {
        const real = attestation(1, 1_000);
        const otherKind = nostrEvent({ kind: 1, created_at: 1_000, content: real.content, tags: real.tags });
        const unmarked = nostrEvent({
            kind: 30078,
            created_at: 1_000,
            content: real.content,
            tags: real.tags.filter((t) => t[1] !== 'oc-attest'),
        });
        vi.stubGlobal(
            'WebSocket',
            class extends fakeRelay([]) {
                send(raw: string) {
                    const [, sub] = JSON.parse(raw) as [string, string];
                    queueMicrotask(() => {
                        for (const e of [otherKind, unmarked])
                            this.onmessage?.({ data: JSON.stringify(['EVENT', sub, e]) });
                        this.onmessage?.({ data: JSON.stringify(['EOSE', sub]) });
                    });
                }
            }
        );
        expect(await queryRecent(['wss://relay.test'], 20)).toEqual([]);
    });
});
