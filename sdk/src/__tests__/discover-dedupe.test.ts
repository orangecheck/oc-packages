/**
 * discoverAttestations returns each attestation once.
 *
 * It merges the events of every relay it asks, and a publish fans out to all of
 * them, so the same attestation arrives once per relay that holds it. On
 * 2026-10-21 attest.ochk.io's discovery listed 32 rows for 8 attestations,
 * four relays each. An attestation is content-addressed: its id is the hash of
 * its message, so every valid copy is the same attestation.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCanonicalMessage, createAttestationEnvelope, discoverAttestations } from '../index';
import { createAttestationEvent, queryByAddress } from '../nostr';

vi.mock('../nostr', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../nostr')>()),
    queryByAddress: vi.fn(),
}));

const ADDR = 'bc1qtest';

async function envelopeFor(nonce: string) {
    const message = buildCanonicalMessage(
        { address: ADDR, identities: [] },
        {},
        { nonce, issuedAt: '2026-04-22T12:00:00Z' }
    );
    return createAttestationEnvelope(message, 'AA'.repeat(64), 'bip322', ADDR, []);
}

function eventFor(
    envelope: Awaited<ReturnType<typeof envelopeFor>>,
    id: string,
    createdAt: number
) {
    const unsigned = createAttestationEvent(envelope, 'b'.repeat(64));
    return { ...unsigned, created_at: createdAt, id, sig: 'c'.repeat(128) };
}

describe('discoverAttestations', () => {
    beforeEach(() => vi.clearAllMocks());

    it('returns one envelope per attestation however many relays hold it', async () => {
        const a = await envelopeFor('0011223344556677889900aabbccddee');
        const b = await envelopeFor('ffeeddccbbaa99887766554433221100');
        vi.mocked(queryByAddress).mockResolvedValue([
            eventFor(a, '1'.repeat(64), 1000), // relay one
            eventFor(a, '1'.repeat(64), 1000), // relay two, same event
            eventFor(a, '2'.repeat(64), 1005), // republished later: another event id
            eventFor(b, '3'.repeat(64), 1000),
        ]);
        const found = await discoverAttestations({ address: ADDR, relays: ['wss://r'] });
        expect(found.map((e) => e.attestation_id).sort()).toEqual(
            [a.attestation_id, b.attestation_id].sort()
        );
    });

    it('keeps a valid copy when an earlier copy of the same id is broken', async () => {
        const a = await envelopeFor('0011223344556677889900aabbccddee');
        const broken = {
            ...eventFor(a, '4'.repeat(64), 900),
            content: JSON.stringify({ ...a, message: 'altered' }),
        };
        vi.mocked(queryByAddress).mockResolvedValue([
            broken,
            eventFor(a, '5'.repeat(64), 1000),
        ]);
        const found = await discoverAttestations({ address: ADDR, relays: ['wss://r'] });
        expect(found).toHaveLength(1);
        expect(found[0]!.message).toBe(a.message);
    });
});
