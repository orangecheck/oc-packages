/**
 * check() and discovery take every field they use, order by or return from the
 * signed message, never from the envelope JSON beside it, and refuse an expiry
 * that is not an RFC 3339 time.
 *
 * Real BIP-322 signatures, an in-memory relay and a stubbed chain. Set
 * SDK_UNDER_TEST to a built entry point to run these against another build.
 */

import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { createHash } from 'crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Sdk = typeof import('../index');
const sdk: Sdk = process.env.SDK_UNDER_TEST
    ? await import(process.env.SDK_UNDER_TEST)
    : await import('../index');

const OWNER_KEY = '11'.repeat(32);
const SQUAT_KEY = '22'.repeat(32);
const OWNER = addressFromPrivateKey(OWNER_KEY, 'p2wpkh');
const SQUATTER = addressFromPrivateKey(SQUAT_KEY, 'p2wpkh');
const RELAYS = ['wss://fake.example'];

type Identity = { protocol: string; identifier: string };
type Ev = { id: string; kind: number; pubkey: string; created_at: number; tags: string[][]; content: string; sig: string };

let store: Ev[] = [];

function message(address: string, identities: Identity[], issuedAt: string, ext: Record<string, string> = {}) {
    return sdk.buildCanonicalMessage({ address, identities }, ext, {
        nonce: createHash('sha256').update(address + issuedAt).digest('hex').slice(0, 32),
        issuedAt,
    });
}

/** An envelope as anyone may publish it: the signed message and signature, any JSON beside them. */
function publish(
    msg: string,
    signature: string,
    beside: Record<string, unknown> = {},
    publisher = 'ab',
    createdAt = 1_700_000_000
) {
    const id = createHash('sha256').update(msg).digest('hex');
    const address = /\naddress: (\S+)/.exec(msg)![1]!;
    const identities = sdk.parseIdentities(/\nidentities: ([^\n]*)/.exec(msg)![1]!);
    const issued_at = /\nissued_at: (\S+)/.exec(msg)![1]!;
    const envelope = { attestation_id: id, scheme: 'bip322', address, identities, message: msg, signature, issued_at, ...beside };
    const tags = [
        ['d', id],
        ['t', address],
        ['t', 'oc-attest'],
        ['scheme', 'bip322'],
        ...((envelope.identities as Identity[]).map((b) => ['i', `${b.protocol}:${b.identifier}`])),
    ];
    store.push({
        id: createHash('sha256').update(publisher + id + signature + JSON.stringify(beside)).digest('hex'),
        kind: 30078,
        pubkey: publisher.repeat(32).slice(0, 64),
        created_at: createdAt,
        tags,
        content: JSON.stringify(envelope),
        sig: 'ef'.repeat(64),
    });
    return id;
}

function signed(key: string, address: string, identities: Identity[], issuedAt: string, ext?: Record<string, string>) {
    const msg = message(address, identities, issuedAt, ext);
    return { msg, sig: signMessage(address, msg, key) };
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
        // As NIP-01 relays answer: matching events newest first, none after `until`, cut at `limit`.
        const hits = store
            .filter((ev) =>
                Object.entries(filter).every(([k, v]) => {
                    if (!k.startsWith('#')) return true;
                    return ev.tags.some((t) => t[0] === k.slice(1) && (v as string[]).includes(t[1] ?? ''));
                })
            )
            .filter((ev) => filter.until === undefined || ev.created_at <= filter.until)
            .sort((a, b) => b.created_at - a.created_at)
            .slice(0, filter.limit ?? Infinity);
        for (const ev of hits) this.onmessage?.({ data: JSON.stringify(['EVENT', sub, ev]) });
        this.onmessage?.({ data: JSON.stringify(['EOSE', sub]) });
    }
    close(): void {
        this.readyState = 3;
    }
}

const DAY = 86_400;
// The owner holds 2,000,000 sats for 400 days; the squatter 50,000 for 30.
function chain(url: string) {
    const addr = /\/address\/([^/]+)\/utxo/.exec(url)?.[1];
    const [value, days] = addr === OWNER ? [2_000_000, 400] : addr === SQUATTER ? [50_000, 30] : [0, 0];
    const utxos = value
        ? [{ txid: 'aa'.repeat(32), vout: 0, value, status: { confirmed: true, block_height: 800_000, block_time: Math.floor(Date.now() / 1000) - days * DAY } }]
        : [];
    return new Response(JSON.stringify(utxos), { status: 200, headers: { 'content-type': 'application/json' } });
}

beforeEach(() => {
    store = [];
    vi.stubGlobal('WebSocket', FakeRelay);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => chain(String(url))));
});
afterEach(() => vi.unstubAllGlobals());

describe('identities come from the signed message', () => {
    it('check() returns the signed identities of a re-wrapped copy', async () => {
        const { msg, sig } = signed(OWNER_KEY, OWNER, [{ protocol: 'github', identifier: 'owner' }], '2026-01-01T00:00:00Z');
        const id = publish(msg, sig, { identities: [{ protocol: 'github', identifier: 'someone-else' }] }, 'cd');
        const r = await sdk.check({ id, relays: RELAYS });
        expect(r.ok).toBe(true);
        expect(r.identities).toEqual([{ protocol: 'github', identifier: 'owner' }]);
    });

    it('discovery hands back the signed address, identities and times', async () => {
        const { msg, sig } = signed(OWNER_KEY, OWNER, [{ protocol: 'github', identifier: 'owner' }], '2026-01-01T00:00:00Z', {
            expires: '2030-01-01T00:00:00Z',
        });
        const id = publish(msg, sig, {
            identities: [{ protocol: 'github', identifier: 'someone-else' }],
            issued_at: '2099-01-01T00:00:00Z',
            expires_at: '2099-01-01T00:00:00Z',
        });
        const [env] = await sdk.discoverAttestations({ attestationId: id, relays: RELAYS });
        expect(env).toMatchObject({
            address: OWNER,
            identities: [{ protocol: 'github', identifier: 'owner' }],
            issued_at: '2026-01-01T00:00:00Z',
            expires_at: '2030-01-01T00:00:00Z',
        });
    });
});

describe('the newest attestation is the newest signed one', () => {
    it('an old attestation re-dated beside its message does not displace the current one', async () => {
        const old = signed(OWNER_KEY, OWNER, [], '2025-01-01T00:00:00Z', { expires: '2025-06-01T00:00:00Z' });
        const current = signed(OWNER_KEY, OWNER, [], '2026-01-01T00:00:00Z');
        publish(old.msg, old.sig, { issued_at: '2099-01-01T00:00:00Z' }, 'cd');
        const currentId = publish(current.msg, current.sig);
        const r = await sdk.check({ addr: OWNER, relays: RELAYS });
        expect(r.attestation_id).toBe(currentId);
        expect(r.ok).toBe(true);
    });

    it("a squatter's claim re-dated beside its message does not outrank the owner", async () => {
        const handle = [{ protocol: 'github', identifier: 'alice' }];
        const squat = signed(SQUAT_KEY, SQUATTER, handle, '2025-01-01T00:00:00Z');
        const owner = signed(OWNER_KEY, OWNER, handle, '2026-01-01T00:00:00Z');
        publish(squat.msg, squat.sig, { issued_at: '2099-01-01T00:00:00Z' }, 'cd');
        publish(owner.msg, owner.sig);
        const r = await sdk.check({ identity: handle[0]!, relays: RELAYS });
        expect(r.address).toBe(OWNER);
    });

    it('a claim signed with a date ahead of now is not valid yet', async () => {
        const handle = [{ protocol: 'github', identifier: 'alice' }];
        const squat = signed(SQUAT_KEY, SQUATTER, handle, '2099-01-01T00:00:00Z');
        const owner = signed(OWNER_KEY, OWNER, handle, '2026-01-01T00:00:00Z');
        publish(squat.msg, squat.sig, {}, 'cd');
        publish(owner.msg, owner.sig);
        const r = await sdk.check({ identity: handle[0]!, relays: RELAYS });
        expect(r.address).toBe(OWNER);
    });

    it('a newer message with a signature that does not hold does not stand in', async () => {
        const handle = [{ protocol: 'github', identifier: 'alice' }];
        const owner = signed(OWNER_KEY, OWNER, handle, '2026-01-01T00:00:00Z');
        publish(message(SQUATTER, handle, '2026-06-01T00:00:00Z'), owner.sig, {}, 'cd');
        publish(owner.msg, owner.sig);
        const r = await sdk.check({ identity: handle[0]!, relays: RELAYS });
        expect(r).toMatchObject({ ok: true, address: OWNER });
    });

    it("only the address's own signature can share its stake", async () => {
        const handle = { protocol: 'github', identifier: 'alice' };
        const owner = signed(OWNER_KEY, OWNER, [handle], '2026-01-01T00:00:00Z');
        publish(owner.msg, owner.sig);
        publish(message(OWNER, [{ protocol: 'github', identifier: 'mallory' }], '2026-02-01T00:00:00Z'), owner.sig, {}, 'cd');
        const r = await sdk.check({ identity: handle, relays: RELAYS });
        expect(r).toMatchObject({ ok: true, address: OWNER });
    });
});

describe('an expiry that is not a time', () => {
    it.each(['soon', '2027-13-45T00:00:00Z', ''])('refuses expires: %j as expired', async (expires) => {
        const msg = message(OWNER, [], '2026-01-01T00:00:00Z') + `expires: ${expires}\n`;
        const sig = signMessage(OWNER, msg, OWNER_KEY);
        const r = await sdk.verify({ addr: OWNER, msg, sig, scheme: 'bip322' });
        expect(r.ok).toBe(false);
        expect(r.codes).toContain('expired');
    });

    it('still accepts an RFC 3339 expiry ahead of now', async () => {
        const { msg, sig } = signed(OWNER_KEY, OWNER, [], '2026-01-01T00:00:00Z', { expires: '2030-01-01T00:00:00Z' });
        const r = await sdk.verify({ addr: OWNER, msg, sig, scheme: 'bip322' });
        expect(r.ok).toBe(true);
    });
});

describe('a signed issue time ahead of the clock', () => {
    const at = (ms: number) => new Date(Date.now() + ms).toISOString();

    it('refuses one more than two minutes ahead as not_yet_valid', async () => {
        const { msg, sig } = signed(OWNER_KEY, OWNER, [], '2099-01-01T00:00:00Z');
        const r = await sdk.verify({ addr: OWNER, msg, sig, scheme: 'bip322' });
        expect(r.ok).toBe(false);
        expect(r.codes).toContain('not_yet_valid');
    });

    it('accepts one within two minutes of the clock', async () => {
        const { msg, sig } = signed(OWNER_KEY, OWNER, [], at(60_000));
        const r = await sdk.verify({ addr: OWNER, msg, sig, scheme: 'bip322' });
        expect(r.ok).toBe(true);
    });

    it('refuses an issued_at that is not an RFC 3339 time', async () => {
        const { msg, sig } = signed(OWNER_KEY, OWNER, [], 'tomorrow');
        const r = await sdk.verify({ addr: OWNER, msg, sig, scheme: 'bip322' });
        expect(r.ok).toBe(false);
        expect(r.codes).toContain('decode_error');
    });
});

describe('every copy under a subject is read', () => {
    const T = 1_750_000_000;
    // A message naming the subject, with a signature that does not hold for it.
    const unsigned = (address: string, identities: Identity[], n: number) =>
        message(address, identities, new Date(Date.UTC(2026, 5, 1) + n * 1000).toISOString());

    it('a newer copy under the id with a signature that does not hold does not hide the signed one', async () => {
        const { msg, sig } = signed(OWNER_KEY, OWNER, [], '2026-01-01T00:00:00Z');
        const id = publish(msg, sig, {}, 'ab', T);
        publish(msg, 'A'.repeat(88), {}, 'cd', T + 100);
        const r = await sdk.check({ id, relays: RELAYS });
        expect(r).toMatchObject({ ok: true, attestation_id: id });
    });

    it('by address, the signed attestation is found behind 600 newer events under the address', async () => {
        const { msg, sig } = signed(OWNER_KEY, OWNER, [], '2026-01-01T00:00:00Z');
        const id = publish(msg, sig, {}, 'ab', T);
        for (let n = 1; n <= 600; n++) publish(unsigned(OWNER, [], n), 'A'.repeat(88), {}, 'cd', T + n);
        const r = await sdk.check({ addr: OWNER, relays: RELAYS });
        expect(r).toMatchObject({ ok: true, attestation_id: id });
    });

    it('by identity, the signed claim is found behind newer claims whose signatures do not hold', async () => {
        const handle = [{ protocol: 'github', identifier: 'alice' }];
        const owner = signed(OWNER_KEY, OWNER, handle, '2026-01-01T00:00:00Z');
        publish(owner.msg, owner.sig, {}, 'ab', T);
        for (let n = 1; n <= 30; n++) publish(unsigned(SQUATTER, handle, n), 'A'.repeat(88), {}, 'cd', T + n);
        const r = await sdk.check({ identity: handle[0]!, relays: RELAYS });
        expect(r).toMatchObject({ ok: true, address: OWNER });
    });
});

describe('a key signed twice', () => {
    it('is refused by verify()', async () => {
        const base = message(OWNER, [], '2026-01-01T00:00:00Z');
        const msg = base + 'expires: 2030-01-01T00:00:00Z\nexpires: 2020-01-01T00:00:00Z\n';
        const sig = signMessage(OWNER, msg, OWNER_KEY);
        const r = await sdk.verify({ addr: OWNER, msg, sig, scheme: 'bip322' });
        expect(r.ok).toBe(false);
        expect(r.codes).toContain('decode_error');
    });

    it('takes no part in check()', async () => {
        const base = message(OWNER, [], '2026-02-01T00:00:00Z');
        const twice = base + 'network: mainnet\nnetwork: testnet\n';
        publish(twice, signMessage(OWNER, twice, OWNER_KEY));
        const { msg, sig } = signed(OWNER_KEY, OWNER, [], '2026-01-01T00:00:00Z');
        const id = publish(msg, sig);
        const r = await sdk.check({ addr: OWNER, relays: RELAYS });
        expect(r).toMatchObject({ ok: true, attestation_id: id });
    });
});
