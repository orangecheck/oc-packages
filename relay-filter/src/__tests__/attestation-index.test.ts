/**
 * The strfry plugin decides from memory. These cases pin that every decision
 * is synchronous and that the index admits only attestations whose signed
 * message backs the key, one key per bond.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/sdk', async (importOriginal) => ({
    ...(await importOriginal<typeof import('@orangecheck/sdk')>()),
    verify: vi.fn(),
}));

import {
    buildCanonicalMessage,
    createAttestationEnvelope,
    createAttestationEvent,
    nostrIdentifierForms,
    verify,
} from '@orangecheck/sdk';
import type { IdentityBinding } from '@orangecheck/sdk';

import { AttestationIndex, parseAttestationEvent } from '../attestation-index';
import { handleLine } from '../strfry-line';

const ADDR = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const ADDR_2 = 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l';
const [NPUB_A, HEX_A] = nostrIdentifierForms('7e7e9c42a91bfef19fa929e5fda1b72e0ebc1a4c1141673e2794234d86addf4e');
const [NPUB_B, HEX_B] = nostrIdentifierForms('3bf0c63fcb93463407af97a5e5ee64fa883d107ef9e558472c4eb9aaaefa459d');
const STRANGER = 'c'.repeat(64);

async function attestation(address: string, identities: IdentityBinding[]) {
    const message = buildCanonicalMessage({ address, identities }, {}, { issuedAt: '2026-01-01T00:00:00Z' });
    const env = await createAttestationEnvelope(message, 'sig', 'bip322', address, identities);
    return createAttestationEvent(env, 'ab'.repeat(32));
}

const ev = (pubkey: string, kind = 1) => ({ id: 'e'.repeat(64), pubkey, kind });
const flush = () => new Promise((r) => setTimeout(r, 0));

function bond(sats: number, days = 400) {
    vi.mocked(verify).mockResolvedValue({
        ok: true,
        codes: ['sig_ok_bip322', 'bond_confirmed'],
        network: 'mainnet',
        metrics: { sats_bonded: sats, days_unspent: days, score: 1 },
    } as never);
}

let index: AttestationIndex;
beforeEach(() => {
    vi.mocked(verify).mockReset();
    index = new AttestationIndex();
    index.markSynced();
});

describe('AttestationIndex.decide', () => {
    it('rejects an unknown key synchronously, with no network call', () => {
        const d = index.decide(ev(STRANGER));
        expect(d).not.toBeInstanceOf(Promise);
        expect(d.reason).toBe('no_attestation');
        expect(verify).not.toHaveBeenCalled();
    });

    it('accepts the hex pubkey of an npub-bound attestation once its bond is read', async () => {
        bond(500_000);
        expect(index.ingest(await attestation(ADDR, [{ protocol: 'nostr', identifier: NPUB_A! }]))).toBe(true);
        await flush();
        expect(index.decide(ev(HEX_A!), { minSats: 100_000, minDays: 30 })).toMatchObject({
            action: 'accept',
            reason: 'ok',
        });
    });

    it('asks the client to retry while the bond is still being read', async () => {
        vi.mocked(verify).mockReturnValue(new Promise(() => {}));
        index.ingest(await attestation(ADDR, [{ protocol: 'nostr', identifier: NPUB_A! }]));
        expect(index.decide(ev(HEX_A!)).reason).toBe('lookup_error');
        expect(index.decide(ev(HEX_A!), { failOpen: true }).action).toBe('accept');
    });

    it('rejects below the thresholds', async () => {
        bond(1_000, 3);
        index.ingest(await attestation(ADDR, [{ protocol: 'nostr', identifier: NPUB_A! }]));
        await flush();
        expect(index.decide(ev(HEX_A!), { minSats: 100_000 }).reason).toBe('below_threshold');
    });

    it('one bond, one key: an address backing two keys admits neither', async () => {
        bond(500_000);
        index.ingest(await attestation(ADDR, [{ protocol: 'nostr', identifier: NPUB_A! }]));
        index.ingest(await attestation(ADDR, [{ protocol: 'nostr', identifier: NPUB_B! }]));
        await flush();
        expect(index.decide(ev(HEX_A!)).reason).toBe('stake_shared');
        expect(index.decide(ev(HEX_B!)).reason).toBe('stake_shared');
    });

    it('a key with its own unshared bond passes even if another address shares', async () => {
        bond(500_000);
        index.ingest(await attestation(ADDR, [{ protocol: 'nostr', identifier: NPUB_A! }]));
        index.ingest(await attestation(ADDR, [{ protocol: 'nostr', identifier: NPUB_B! }]));
        index.ingest(await attestation(ADDR_2, [{ protocol: 'nostr', identifier: HEX_A! }]));
        await flush();
        expect(index.decide(ev(HEX_A!)).reason).toBe('ok');
    });

    it('treats unknown keys as "not yet" until the backlog has loaded', () => {
        const cold = new AttestationIndex();
        (cold as unknown as { startedAt: number }).startedAt = Date.now();
        expect(cold.decide(ev(STRANGER)).reason).toBe('lookup_error');
    });
});

describe('parseAttestationEvent', () => {
    it('ignores a key added by an unsigned tag', async () => {
        const e = await attestation(ADDR, [{ protocol: 'nostr', identifier: NPUB_A! }]);
        const att = parseAttestationEvent({ ...e, tags: [...e.tags, ['i', `nostr:${HEX_B}`]] });
        expect(att?.keys).toEqual([HEX_A]);
    });

    it('refuses an event whose d or t tag disagrees with its envelope', async () => {
        const e = await attestation(ADDR, [{ protocol: 'nostr', identifier: NPUB_A! }]);
        expect(parseAttestationEvent({ ...e, tags: e.tags.map((t) => (t[0] === 'd' ? ['d', 'f'.repeat(64)] : t)) })).toBeNull();
        expect(parseAttestationEvent({ ...e, tags: e.tags.filter((t) => t[0] !== 't') })).toBeNull();
    });

    it('refuses an envelope whose message does not hash to its id', async () => {
        const e = await attestation(ADDR, [{ protocol: 'nostr', identifier: NPUB_A! }]);
        const env = JSON.parse(e.content);
        env.message = env.message.replace(NPUB_A, NPUB_B);
        expect(parseAttestationEvent({ ...e, content: JSON.stringify(env) })).toBeNull();
    });

    it('refuses an envelope whose address is not the signed one', async () => {
        const e = await attestation(ADDR, [{ protocol: 'nostr', identifier: NPUB_A! }]);
        const env = { ...JSON.parse(e.content), address: ADDR_2 };
        const tags = [...e.tags, ['t', ADDR_2]];
        expect(parseAttestationEvent({ tags, content: JSON.stringify(env) })).toBeNull();
    });
});

describe('handleLine (strfry wire format)', () => {
    it('answers a new event with its id and the decision', () => {
        const out = handleLine(JSON.stringify({ type: 'new', event: ev(STRANGER) }), index, {});
        expect(JSON.parse(out!)).toMatchObject({ id: 'e'.repeat(64), action: 'reject' });
    });

    it('answers nothing for lookback events', () => {
        expect(handleLine(JSON.stringify({ type: 'lookback', event: ev(STRANGER) }), index, {})).toBeNull();
    });
});
