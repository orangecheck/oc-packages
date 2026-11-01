/**
 * verifyAttestationById returns an attestation only when its signature
 * verifies. Anyone can publish a message naming any address beside a junk
 * signature, and the id is only the message's hash, so the id and index tags
 * prove nothing about who signed. Relays and the signature check are stubbed:
 * a signature reading 'forged' does not verify.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCanonicalMessage, createAttestationEnvelope, verifyAttestationById } from '../index';
import { createAttestationEvent, queryByAttestationId } from '../nostr';
import { signatureIsValid } from '../verify';

vi.mock('../nostr', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../nostr')>()),
    queryByAttestationId: vi.fn(),
}));
vi.mock('../verify', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../verify')>()),
    signatureIsValid: vi.fn(async ({ sig }: { sig: string }) => sig !== 'forged'),
}));

const VICTIM = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

async function attestation(sig: string) {
    const message = buildCanonicalMessage(
        { address: VICTIM, identities: [] },
        {},
        { nonce: '0011223344556677889900aabbccddee', issuedAt: '2026-10-30T12:00:00Z' }
    );
    return createAttestationEnvelope(message, sig, 'bip322', VICTIM, []);
}

function eventFor(envelope: Awaited<ReturnType<typeof attestation>>, id: string) {
    return { ...createAttestationEvent(envelope, 'b'.repeat(64)), id, sig: 'c'.repeat(128) };
}

describe('verifyAttestationById', () => {
    beforeEach(() => vi.clearAllMocks());

    it("returns null for an attestation naming the victim's address beside a signature that does not verify", async () => {
        const forged = await attestation('forged');
        vi.mocked(queryByAttestationId).mockResolvedValue([eventFor(forged, '1'.repeat(64))]);
        await expect(verifyAttestationById(forged.attestation_id, ['wss://r'])).resolves.toBeNull();
        expect(signatureIsValid).toHaveBeenCalledWith(
            expect.objectContaining({ addr: VICTIM, msg: forged.message, sig: 'forged' })
        );
    });

    it('returns the attestation when its signature verifies', async () => {
        const genuine = await attestation('genuine');
        vi.mocked(queryByAttestationId).mockResolvedValue([eventFor(genuine, '2'.repeat(64))]);
        const found = await verifyAttestationById(genuine.attestation_id, ['wss://r']);
        expect(found?.attestation_id).toBe(genuine.attestation_id);
        expect(found?.signature).toBe('genuine');
    });

    it('returns the copy whose signature verifies when a forged copy comes first', async () => {
        const forged = await attestation('forged');
        const genuine = await attestation('genuine');
        vi.mocked(queryByAttestationId).mockResolvedValue([
            eventFor(forged, '3'.repeat(64)),
            eventFor(genuine, '4'.repeat(64)),
        ]);
        const found = await verifyAttestationById(genuine.attestation_id, ['wss://r']);
        expect(found?.signature).toBe('genuine');
    });
});
