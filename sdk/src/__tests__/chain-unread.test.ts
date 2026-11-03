/**
 * Coins that were not read are unread, never a verdict (chain-read-failures
 * PK1, FO1). When no chain API lists an address's coins, verify() says why in
 * one code, and check() never adds below_min_* beside it:
 *
 * - chain_unread: none answered (429, 5xx, timeout, network, a body that does
 *   not parse). bad_request stays beside it, so every decoder published before
 *   1.21.0 still reads an outage and a caller's failOpen still covers it.
 * - utxo_cap_unread: an API said the address holds more coins than it lists
 *   (electrs' ~500-UTXO cap, a 400 "Too many unspent ..."). Anyone can put an
 *   address there with dust, so it never carries bad_request and outranks an
 *   outage elsewhere: no decoder, old or new, may fail it open.
 * - provider_refused_unread: any other 4xx but 429 (a 403, a WAF block, a 404
 *   from a moved endpoint, a cap worded some new way). The same rules.
 *
 * verify() runs for real on a signed vector with fetch stubbed per endpoint;
 * check() runs over an in-memory relay with verify() answering each shape.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCanonicalMessage, createAttestationEnvelope } from '../canonical';
import { check } from '../check';
import { createAttestationEvent } from '../nostr';
import type { NostrEvent, VerifyOutcome } from '../types';
import { unreadReason } from '../unread';
import { verify } from '../verify';
import tv21 from './vectors/tv21.json';

// check() below answers whatever `answer` holds; verify() above is the real one.
const answer = vi.hoisted(() => ({ outcome: null as null | VerifyOutcome }));
vi.mock('../verify', async (importOriginal) => {
    const real = await importOriginal<typeof import('../verify')>();
    return {
        ...real,
        signatureIsValid: vi.fn(async () => true),
        verify: vi.fn(async (...args: Parameters<typeof real.verify>) =>
            answer.outcome ? answer.outcome : real.verify(...args)
        ),
    };
});

const { address, message, signature } = tv21.input as {
    address: string;
    message: string;
    signature: string;
};
const input = { addr: address, msg: message, sig: signature };
const now = Math.floor(Date.now() / 1000);
const COINS = [
    {
        txid: '1'.padStart(64, '0'),
        vout: 0,
        value: 100_000,
        status: { confirmed: true, block_height: 900_001, block_time: now - 40 * 86_400 },
    },
];
const MEMPOOL_CAP = 'Too many unspent transaction outputs (>500). Contact support to raise limits.';
const BLOCKSTREAM_CAP = 'Too many unspent outputs';

type Answer = () => Response | Promise<Response>;
let mempool: Answer;
let blockstream: Answer;
const text = (body: string, status: number) => () => new Response(body, { status });
const list = () => new Response(JSON.stringify(COINS));
const down = () => {
    throw new TypeError('fetch failed');
};

beforeEach(() => {
    answer.outcome = null;
    vi.stubGlobal('fetch', async (url: string) => {
        if (!url.endsWith(`/address/${address}/utxo`)) return new Response('no', { status: 404 });
        if (url.startsWith('https://mempool.space/')) return mempool();
        if (url.startsWith('https://blockstream.info/')) return blockstream();
        return new Response('no', { status: 404 });
    });
});
afterEach(() => vi.unstubAllGlobals());

/** gate 0.3.2 / relay-filter 0.5.5, as published: an outage is sig_ok_* + bad_request. */
const publishedOutage = (codes: readonly string[]) =>
    codes.includes('bad_request') && codes.some((c) => c === 'sig_ok_bip322' || c === 'sig_ok_legacy');
/** gate 0.3.3 / relay-filter 0.5.6 also close a lone *_unread as an incomplete lookup. */
const publishedIncomplete = (codes: readonly string[]) => codes.length === 1 && codes[0]!.endsWith('_unread');

describe('verify(): coins no chain API listed are unread, with the reason decided across the APIs', () => {
    it('an outage on both is chain_unread, beside bad_request, with no metrics', async () => {
        mempool = text('slow down', 429);
        blockstream = text('busy', 503);
        const r = await verify(input);
        expect(r.ok).toBe(false);
        expect(r.codes).toEqual(['sig_ok_bip322', 'bad_request', 'chain_unread']);
        expect(r.metrics).toBeUndefined();
        expect(publishedOutage(r.codes)).toBe(true);
    });

    it('a network failure or a body that does not parse is chain_unread too', async () => {
        mempool = down;
        blockstream = text('<html>maintenance</html>', 200);
        expect((await verify(input)).codes).toEqual(['sig_ok_bip322', 'bad_request', 'chain_unread']);
    });

    it("the cap on both is utxo_cap_unread, never beside bad_request", async () => {
        mempool = text(MEMPOOL_CAP, 400);
        blockstream = text(BLOCKSTREAM_CAP, 400);
        const r = await verify(input);
        expect(r.codes).toEqual(['sig_ok_bip322', 'utxo_cap_unread']);
        expect(r.metrics).toBeUndefined();
        expect(publishedOutage(r.codes)).toBe(false);
    });

    it("the cap outranks an outage elsewhere", async () => {
        mempool = text(MEMPOOL_CAP, 400);
        blockstream = text('busy', 503);
        expect((await verify(input)).codes).toEqual(['sig_ok_bip322', 'utxo_cap_unread']);
    });

    it('the cap on one API and a list from the other is a reading', async () => {
        mempool = text(MEMPOOL_CAP, 400);
        blockstream = list;
        const r = await verify(input);
        expect(r.ok).toBe(true);
        expect(r.metrics?.sats_bonded).toBe(100_000);
    });

    it.each([
        ['a 403', 403, 'Forbidden'],
        ['a 404 from a moved endpoint', 404, 'Not Found'],
        ['a cap worded some new way', 400, 'Address has too many outputs for this plan'],
    ])('%s is provider_refused_unread with its status, never beside bad_request', async (_w, status, body) => {
        mempool = text(body, status);
        blockstream = text('busy', 503);
        const r = await verify(input);
        expect(r.codes).toEqual(['sig_ok_bip322', 'provider_refused_unread']);
        expect(r.chain_status).toBe(status);
        expect(publishedOutage(r.codes)).toBe(false);
    });

    it('a 429 is an outage, not a refusal', async () => {
        mempool = text('slow down', 429);
        blockstream = text('slow down', 429);
        expect(unreadReason((await verify(input)).codes)).toBe('chain_unread');
    });
});

// ── check() ──────────────────────────────────────────────────────────────────

const ADDR = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const RELAYS = ['wss://fake.example'];
let store: NostrEvent[] = [];

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
        const [type, sub, filter] = JSON.parse(raw) as [string, string, Record<string, string[]>];
        if (type !== 'REQ') return;
        for (const ev of store) {
            const ok = Object.entries(filter).every(
                ([k, want]) => !k.startsWith('#') || ev.tags.some((t) => t[0] === k.slice(1) && want.includes(t[1] ?? ''))
            );
            if (ok) this.onmessage?.({ data: JSON.stringify(['EVENT', sub, ev]) });
        }
        this.onmessage?.({ data: JSON.stringify(['EOSE', sub]) });
    }
    close(): void {
        this.readyState = 3;
    }
}

let realWs: typeof globalThis.WebSocket;
beforeEach(async () => {
    store = [];
    realWs = globalThis.WebSocket;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.WebSocket = FakeRelay as any;
    const message = buildCanonicalMessage({ address: ADDR, identities: [] }, {}, { issuedAt: '2026-01-01T00:00:00Z' });
    const env = await createAttestationEnvelope(message, 'c2lnbmF0dXJl', 'bip322', ADDR, []);
    const ev = createAttestationEvent(env, 'ab'.repeat(32));
    store.push({ ...ev, id: env.attestation_id, sig: 'ef'.repeat(64) } as NostrEvent);
});
afterEach(() => {
    globalThis.WebSocket = realWs;
});

const outcome = (codes: VerifyOutcome['codes'], extra: Partial<VerifyOutcome> = {}): VerifyOutcome => ({
    ok: false,
    codes,
    network: 'mainnet',
    ...extra,
});
const ask = () => check({ addr: ADDR, minSats: 50_000, minDays: 30, relays: RELAYS });

describe('check(): unread coins are never below a threshold', () => {
    it('an outage keeps the verify codes, chain_unread among them, and no below_min_*', async () => {
        answer.outcome = outcome(['sig_ok_bip322', 'bad_request', 'chain_unread']);
        const r = await ask();
        expect(r.ok).toBe(false);
        expect(r.reasons).toEqual(['sig_ok_bip322', 'bad_request', 'chain_unread']);
        expect(unreadReason(r.reasons)).toBe('chain_unread');
        expect(publishedOutage(r.reasons!)).toBe(true);
        expect(r.address).toBe(ADDR);
    });

    it('the cap is the one reason, which no published decoder fails open', async () => {
        answer.outcome = outcome(['sig_ok_bip322', 'utxo_cap_unread']);
        const r = await ask();
        expect(r.ok).toBe(false);
        expect(r.reasons).toEqual(['utxo_cap_unread']);
        expect(r.address).toBe(ADDR);
        expect(r.attestation_id).toMatch(/^[0-9a-f]{64}$/);
        expect(publishedOutage(r.reasons!)).toBe(false);
        expect(publishedIncomplete(r.reasons!)).toBe(true);
    });

    it('a refusal is the one reason, with the status it came with', async () => {
        answer.outcome = outcome(['sig_ok_bip322', 'provider_refused_unread'], { chain_status: 403 });
        const r = await ask();
        expect(r.reasons).toEqual(['provider_refused_unread']);
        expect(r.chain_status).toBe(403);
        expect(publishedOutage(r.reasons!)).toBe(false);
    });

    it('coins that were read and fall short are still below the threshold', async () => {
        answer.outcome = {
            ok: true,
            codes: ['sig_ok_bip322', 'bond_confirmed'],
            network: 'mainnet',
            metrics: { sats_bonded: 10_000, days_unspent: 3, score: 1 },
        };
        const r = await ask();
        expect(r.reasons).toEqual(['below_min_sats', 'below_min_days']);
        expect(unreadReason(r.reasons)).toBeNull();
    });
});

describe('unreadReason()', () => {
    it('ranks a cap and a refusal over an outage, and reads null for a reading', () => {
        expect(unreadReason(['sig_ok_bip322', 'bad_request', 'chain_unread', 'utxo_cap_unread'])).toBe('utxo_cap_unread');
        expect(unreadReason(['provider_refused_unread', 'chain_unread'])).toBe('provider_refused_unread');
        expect(unreadReason(['attestation_unread'])).toBe('attestation_unread');
        expect(unreadReason(['sig_ok_bip322', 'bad_request'])).toBeNull();
        expect(unreadReason(undefined)).toBeNull();
    });
});
