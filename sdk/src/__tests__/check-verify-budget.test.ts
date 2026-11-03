/**
 * check() charges at most VERIFY_BUDGET signature checks a call, and only for
 * signatures shaped well enough to reach curve math. Anyone can publish under
 * an address's tag beside a signature that does not hold, newer than the real
 * attestation; a well-formed one costs a few milliseconds to turn away, junk
 * bytes almost nothing. Junk is checked free, so a flood of it never hides a
 * real attestation (the 1.16.2 rule). Past the budget of well-formed forgeries
 * the answer is attestation_unread (ask again): never not_found and never the
 * newest forged copy. The stake check shares the budget, and a sibling it could
 * not check makes the stake unread.
 *
 * An in-memory relay serves real REQ filters; GENUINE is the one signature
 * that holds, and the chain read is stubbed.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { buildCanonicalMessage, createAttestationEnvelope } from '../canonical';
import { check, VERIFY_BUDGET } from '../check';
import { createAttestationEvent } from '../nostr';
import type { IdentityBinding, NostrEvent } from '../types';
import { signatureIsValid } from '../verify';

vi.mock('../verify', async (importOriginal) => ({
    ...(await importOriginal<typeof import('../verify')>()),
    signatureIsValid: vi.fn(async ({ sig }: { sig: string }) => sig === GENUINE),
    verify: vi.fn(async () => ({
        ok: true,
        codes: ['sig_ok_bip322', 'bond_confirmed'],
        network: 'mainnet',
        metrics: { sats_bonded: 5_000_000, days_unspent: 400, score: 90 },
    })),
}));

const ADDR = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';

/** A p2wpkh witness shaped like a signature (DER with sighash byte, compressed key), unique per n. */
function wellFormed(n: number): string {
    const r = new Uint8Array(32).fill(0x11);
    r[0] = 0x01;
    r[31] = n & 0xff;
    r[30] = (n >> 8) & 0xff;
    const s = new Uint8Array(32).fill(0x22);
    const der = Uint8Array.from([0x30, 68, 0x02, 32, ...r, 0x02, 32, ...s, 0x01]);
    const pubkey = Uint8Array.from([0x02, ...new Uint8Array(32).fill(0x33)]);
    return Buffer.from(Uint8Array.from([2, der.length, ...der, pubkey.length, ...pubkey])).toString('base64');
}
const GENUINE = wellFormed(0xffff);
/** Bytes no verifier gets past: 66 zero bytes (a witness of no items, then trailing bytes). */
const JUNK = 'A'.repeat(88);
const RELAYS = ['wss://fake.example'];
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

/** An attestation by ADDR issued `minute` minutes into the day; later is newer. */
async function attest(minute: number, sig: string, identities: IdentityBinding[] = []) {
    const issuedAt = new Date(Date.UTC(2026, 0, 1, 0, minute)).toISOString().replace('.000', '');
    const message = buildCanonicalMessage({ address: ADDR, identities }, {}, { issuedAt });
    const env = await createAttestationEnvelope(message, sig, 'bip322', ADDR, identities);
    const ev = createAttestationEvent(env, 'ab'.repeat(32));
    store.push({ ...ev, id: env.attestation_id, sig: 'ef'.repeat(64) } as NostrEvent);
    return env;
}

/** `n` well-formed forged copies, each newer than anything before them. */
async function forged(n: number, from = 100, identities: IdentityBinding[] = []) {
    for (let i = 0; i < n; i++) await attest(from + i, wellFormed(i), identities);
}

/** `n` junk copies, each newer than anything before them. */
async function junk(n: number, from = 100) {
    for (let i = 0; i < n; i++) await attest(from + i, JUNK);
}

let realWs: typeof globalThis.WebSocket;
beforeEach(() => {
    store = [];
    vi.mocked(signatureIsValid).mockClear();
    realWs = globalThis.WebSocket;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.WebSocket = FakeRelay as any;
});
afterEach(() => {
    globalThis.WebSocket = realWs;
});

describe('check(): one signature budget a call, charged for well-formed signatures', () => {
    it('finds the real attestation behind one fewer well-formed forgeries than the budget', async () => {
        const real = await attest(1, GENUINE);
        await forged(VERIFY_BUDGET - 1);
        const r = await check({ addr: ADDR, relays: RELAYS });
        expect(r.attestation_id).toBe(real.attestation_id);
        expect(r.ok).toBe(true);
        expect(signatureIsValid).toHaveBeenCalledTimes(VERIFY_BUDGET);
    });

    it('answers attestation_unread behind a budget of well-formed forgeries, and checks no more', async () => {
        await attest(1, GENUINE);
        await forged(VERIFY_BUDGET + 20);
        const r = await check({ addr: ADDR, relays: RELAYS });
        expect(r).toEqual({ ok: false, sats: 0, days: 0, score: 0, reasons: ['attestation_unread'] });
        expect(signatureIsValid).toHaveBeenCalledTimes(VERIFY_BUDGET);
    });

    it('finds the real attestation behind 600 junk copies, which cost no budget', async () => {
        const real = await attest(1, GENUINE);
        await junk(600, 1000);
        await forged(VERIFY_BUDGET - 1);
        const r = await check({ addr: ADDR, relays: RELAYS });
        expect(r.attestation_id).toBe(real.attestation_id);
        expect(signatureIsValid).toHaveBeenCalledTimes(600 + VERIFY_BUDGET);
    });

    it('still answers the newest copy when every one was checked and none holds', async () => {
        await forged(3);
        const newest = await attest(200, wellFormed(500));
        const r = await check({ addr: ADDR, relays: RELAYS });
        expect(r.attestation_id).toBe(newest.attestation_id);
        expect(r.reasons ?? []).not.toContain('attestation_unread');
    });

    it('reads the stake as unread when the budget leaves a sibling naming another handle unchecked', async () => {
        const alice: IdentityBinding[] = [{ protocol: 'github', identifier: 'alice' }];
        const mallory: IdentityBinding[] = [{ protocol: 'github', identifier: 'mallory' }];
        await attest(1, GENUINE, alice);
        // Older than the attestation itself, so the subject read never checks them.
        await forged(VERIFY_BUDGET + 5, -120, mallory);
        const r = await check({ identity: { protocol: 'github', identifier: 'alice' }, relays: RELAYS });
        expect(r.reasons).toEqual(['stake_unread']);
        expect(r.ok).toBe(false);
        expect(signatureIsValid).toHaveBeenCalledTimes(VERIFY_BUDGET);
    });

    it('reads the stake as not shared when every sibling fits in the budget and none holds', async () => {
        const alice: IdentityBinding[] = [{ protocol: 'github', identifier: 'alice' }];
        await attest(1, GENUINE, alice);
        await forged(5, -120, [{ protocol: 'github', identifier: 'mallory' }]);
        const r = await check({ identity: { protocol: 'github', identifier: 'alice' }, relays: RELAYS });
        expect(r.ok).toBe(true);
        expect(r.reasons).toBeUndefined();
    });
});
