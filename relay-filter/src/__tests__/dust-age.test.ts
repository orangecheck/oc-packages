/**
 * Old dust must not lend its age to a fresh deposit. The index ages a bond by
 * the coins that cover minSats (OC Attest SPEC §7 step 5.d), through the real
 * SDK verifier and a real BIP-322 signature; only the chain API is stubbed.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/sdk', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@orangecheck/sdk')>()),
    queryByIdentity: vi.fn(async () => []),
}));
// The address and backlog reads: answered in full and empty unless a test says otherwise.
vi.mock('../paged-read', () => ({
    readSubject: vi.fn(async () => ({ events: [], complete: true })),
}));

import { createAttestationEnvelope, createAttestationEvent, nostrIdentifierForms } from '@orangecheck/sdk';

import { AttestationIndex } from '../attestation-index';

// Signed by private key 1 (public, holds nothing) with bip322-js 3.0.0 on bitcoinjs-lib 6.1.8.
const ADDR = 'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4';
const [NPUB, HEX] = nostrIdentifierForms('7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e');
const MESSAGE = [
    'orangecheck',
    `identities: nostr:${NPUB}`,
    `address: ${ADDR}`,
    'purpose: portable reputation attestation (non-custodial)',
    'nonce: 00112233445566778899aabbccddeeff',
    'issued_at: 2026-10-19T00:00:00Z',
    'ack: I attest control of this address and bind it to my identities.',
    '',
].join('\n');
const SIGNATURE =
    'AkcwRAIgF/zgPeNKmBkciGVAZF40fSIGRR+SrT0xxnZaPQWLiKECIFvHCyLl1nPgnUMXXUfAjUjcZQgVOylM+bBrFTPQydWqASECeb5mfvncu6xVoGKVzocLBwKb/NstzijZWfKBWxb4F5g=';

const DAY = 86_400;
const now = Math.floor(Date.now() / 1000);
const coin = (value: number, daysOld: number, n: number) => ({
    txid: n.toString(16).padStart(64, '0'),
    vout: 0,
    value,
    status: { confirmed: true, block_height: 900_000 + n, block_time: now - daysOld * DAY },
});

function chainWith(utxos: unknown[]) {
    vi.stubGlobal('fetch', async (url: string) =>
        url.endsWith(`/address/${ADDR}/utxo`)
            ? new Response(JSON.stringify(utxos))
            : new Response('not found', { status: 404 })
    );
}

async function decideWith(utxos: unknown[]) {
    chainWith(utxos);
    const index = new AttestationIndex({ minSats: 100_000 });
    index.markSynced();
    const env = await createAttestationEnvelope(MESSAGE, SIGNATURE, 'bip322', ADDR, [
        { protocol: 'nostr', identifier: NPUB! },
    ]);
    index.ingest(createAttestationEvent(env, 'ab'.repeat(32)));
    await (index as unknown as { refresh(a: string): Promise<void> }).refresh(ADDR);
    return index.decide({ id: 'e'.repeat(64), pubkey: HEX!, kind: 1 }, { minSats: 100_000, minDays: 30 });
}

afterEach(() => vi.unstubAllGlobals());

describe('bond age under minSats', () => {
    it('refuses 100,000 sats deposited yesterday beside a 400-day-old 546-sat output', async () => {
        expect(await decideWith([coin(546, 400, 1), coin(100_000, 1, 2)])).toMatchObject({
            action: 'reject',
            reason: 'below_threshold',
        });
    });

    it('admits 100,000 sats held 60 days, with a newer deposit beside them', async () => {
        expect(await decideWith([coin(100_000, 60, 1), coin(50_000, 1, 2)])).toMatchObject({
            action: 'accept',
            reason: 'ok',
        });
    });
});
