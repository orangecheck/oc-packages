/**
 * The index reads an attestation only in its canonical form (OC Attest SPEC §7.1
 * step 1). Each message here is really signed by a throwaway key, and signatures
 * are checked for real: only the chain's answer is stood in for, as a bond read
 * that holds, so the form alone decides.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/sdk', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@orangecheck/sdk')>()),
    verify: vi.fn(),
    queryByIdentity: vi.fn(async () => []),
}));
vi.mock('../paged-read', () => ({
    readSubject: vi.fn(async () => ({ events: [], complete: true })),
}));

import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import {
    buildCanonicalMessage,
    createAttestationEnvelope,
    createAttestationEvent,
    nostrIdentifierForms,
    verify,
} from '@orangecheck/sdk';

import { AttestationIndex, parseAttestationEvent } from '../attestation-index';

const KEY = '33'.repeat(32);
const ADDR = addressFromPrivateKey(KEY, 'p2wpkh');
const [NPUB_OWN, HEX_OWN] = nostrIdentifierForms('7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e');
const [NPUB_OTHER, HEX_OTHER] = nostrIdentifierForms('3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d');

async function eventFor(message: string, npub: string) {
    const env = await createAttestationEnvelope(message, signMessage(ADDR, message, KEY), 'bip322', ADDR, [
        { protocol: 'nostr', identifier: npub },
    ]);
    return createAttestationEvent(env, 'ab'.repeat(32));
}
const canonical = () =>
    eventFor(
        buildCanonicalMessage(
            { address: ADDR, identities: [{ protocol: 'nostr', identifier: NPUB_OWN! }] },
            {},
            { issuedAt: '2026-01-01T00:00:00Z' }
        ),
        NPUB_OWN!
    );
/** Text the address signed that carries an attestation's lines but is not one. */
const lookalike = () =>
    eventFor(
        `Sign in to example.com\nidentities: nostr:${NPUB_OTHER}\naddress: ${ADDR}\nissued_at: 2026-02-01T00:00:00Z\n`,
        NPUB_OTHER!
    );

const ev = (pubkey: string) => ({ id: 'e'.repeat(64), pubkey, kind: 1 });
const settle = () => new Promise((r) => setTimeout(r, 50));

let index: AttestationIndex;
beforeEach(() => {
    vi.mocked(verify).mockReset().mockResolvedValue({
        ok: true,
        codes: ['sig_ok_bip322', 'bond_confirmed'],
        network: 'mainnet',
        metrics: { sats_bonded: 500_000, days_unspent: 400, score: 1 },
    } as never);
    index = new AttestationIndex();
    index.markSynced();
});

describe('the index and signed text not in canonical form', () => {
    it('parses the canonical attestation and refuses the look-alike, both validly signed', async () => {
        expect(parseAttestationEvent(await canonical())?.keys).toEqual([HEX_OWN]);
        expect(parseAttestationEvent(await lookalike())).toBeNull();
    });

    it('takes no key from the look-alike, however good the bond read', async () => {
        expect(index.ingest(await lookalike())).toBe(false);
        await settle();
        expect(index.decide(ev(HEX_OTHER!))).toMatchObject({ action: 'reject', reason: 'no_attestation' });
    });

    it("keeps the address's own key admitted beside a look-alike naming another", async () => {
        index.ingest(await canonical());
        index.ingest(await lookalike());
        await settle();
        expect(index.decide(ev(HEX_OWN!))).toMatchObject({ action: 'accept', reason: 'ok' });
        expect(index.decide(ev(HEX_OTHER!))).toMatchObject({ action: 'reject', reason: 'no_attestation' });
    });
});
