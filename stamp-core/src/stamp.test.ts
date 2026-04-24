import { describe, expect, it } from 'vitest';

import { canonicalMessage, computeEnvelopeId } from './canonical.js';
import { StampError, stamp, verify } from './stamp.js';
import type { StampEnvelope } from './types.js';

const FIXED_ADDRESS = 'bc1qtest00000000000000000000000000000000000';
const FIXED_SIG = 'ZmFrZS1zaWduYXR1cmU=';
const FIXED_DATE = new Date('2026-04-24T18:30:00Z');

function fakeSigner(captures: { msg?: string } = {}) {
    return {
        address: FIXED_ADDRESS,
        signMessage: async (m: string) => {
            captures.msg = m;
            return FIXED_SIG;
        },
    };
}

describe('stamp()', () => {
    it('hashes raw content bytes and produces a well-formed envelope', async () => {
        const content = new TextEncoder().encode('hello stamp');
        const captured: { msg?: string } = {};
        const env = await stamp({
            content,
            mime: 'text/plain',
            signer: fakeSigner(captured),
            signedAt: FIXED_DATE,
        });

        expect(env.v).toBe(1);
        expect(env.kind).toBe('stamp');
        expect(env.content.length).toBe(content.byteLength);
        expect(env.content.mime).toBe('text/plain');
        expect(env.content.hash.startsWith('sha256:')).toBe(true);
        expect(env.content.hash).toHaveLength('sha256:'.length + 64);
        expect(env.signer.address).toBe(FIXED_ADDRESS);
        expect(env.signed_at).toBe('2026-04-24T18:30:00Z');
        expect(env.ots).toBeNull();
        expect(env.stake).toBeNull();
        expect(env.sig.value).toBe(FIXED_SIG);

        // The signer was called with the envelope id (hex). That's the whole
        // ceremony — if the signer captures anything else, we have a spec bug.
        expect(captured.msg).toBe(env.id);
    });

    it('accepts pre-computed {hash, length}', async () => {
        const env = await stamp({
            content: {
                hash: 'sha256:' + '1'.repeat(64),
                length: 42,
            },
            mime: 'text/plain',
            signer: fakeSigner(),
            signedAt: FIXED_DATE,
        });
        expect(env.content.hash).toBe('sha256:' + '1'.repeat(64));
        expect(env.content.length).toBe(42);
    });

    it('rejects pre-computed hash with wrong prefix', async () => {
        await expect(
            stamp({
                content: { hash: 'md5:xxx', length: 1 },
                mime: 'text/plain',
                signer: fakeSigner(),
                signedAt: FIXED_DATE,
            })
        ).rejects.toBeInstanceOf(StampError);
    });

    it('computed id matches computeEnvelopeId() over the same canonical message', async () => {
        const env = await stamp({
            content: { hash: 'sha256:' + '2'.repeat(64), length: 1024 },
            mime: 'application/json',
            signer: fakeSigner(),
            signedAt: FIXED_DATE,
        });
        const expected = computeEnvelopeId({
            address: FIXED_ADDRESS,
            content_hash: env.content.hash,
            content_length: 1024,
            content_mime: 'application/json',
            signed_at: '2026-04-24T18:30:00Z',
        });
        expect(env.id).toBe(expected);
    });

    it('embeds optional stake and ref', async () => {
        const env = await stamp({
            content: { hash: 'sha256:' + '3'.repeat(64), length: 100 },
            mime: 'text/plain',
            signer: fakeSigner(),
            signedAt: FIXED_DATE,
            ref: 'ipfs://bafyxxxx',
            stake: { attestation_id: 'a'.repeat(64), sats_bonded: 500000, days_unspent: 180 },
        });
        expect(env.content.ref).toBe('ipfs://bafyxxxx');
        expect(env.stake).toEqual({ attestation_id: 'a'.repeat(64), sats_bonded: 500000, days_unspent: 180 });
    });
});

describe('verify()', () => {
    async function freshEnv(overrides: Partial<StampEnvelope> = {}): Promise<StampEnvelope> {
        const base = await stamp({
            content: new TextEncoder().encode('hi'),
            mime: 'text/plain',
            signer: fakeSigner(),
            signedAt: FIXED_DATE,
        });
        return { ...base, ...overrides };
    }

    it('accepts a well-formed envelope with skipSignatureVerification', async () => {
        const env = await freshEnv();
        const r = await verify({ envelope: env, skipSignatureVerification: true });
        expect(r.ok).toBe(true);
        if (r.ok) {
            expect(r.anchor.status).toBe('none');
            expect(r.id).toBe(env.id);
        }
    });

    it('rejects a tampered content.hash with E_BAD_ID', async () => {
        const env = await freshEnv();
        const tampered = { ...env, content: { ...env.content, hash: 'sha256:' + '9'.repeat(64) } };
        const r = await verify({ envelope: tampered, skipSignatureVerification: true });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_BAD_ID');
    });

    it('rejects an unknown version', async () => {
        const env = await freshEnv();
        const bad = { ...env, v: 99 as unknown as 1 };
        const r = await verify({ envelope: bad, skipSignatureVerification: true });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_UNSUPPORTED_VERSION');
    });

    it('rejects when signer.address !== sig.pubkey', async () => {
        const env = await freshEnv();
        const bad = { ...env, sig: { ...env.sig, pubkey: 'bc1qimposter00000000000000000000000000000' } };
        const r = await verify({ envelope: bad, skipSignatureVerification: true });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_MALFORMED');
    });

    it('checks content bytes when supplied', async () => {
        const bytes = new TextEncoder().encode('hi');
        const env = await stamp({
            content: bytes,
            mime: 'text/plain',
            signer: fakeSigner(),
            signedAt: FIXED_DATE,
        });
        const good = await verify({ envelope: env, content: bytes, skipSignatureVerification: true });
        expect(good.ok).toBe(true);

        const wrongBytes = new TextEncoder().encode('ho');
        const bad = await verify({ envelope: env, content: wrongBytes, skipSignatureVerification: true });
        expect(bad.ok).toBe(false);
        if (!bad.ok) expect(bad.code).toBe('E_BAD_CONTENT');
    });

    it('reports pending anchor when ots.status === "pending"', async () => {
        const env = await freshEnv({
            ots: {
                status: 'pending',
                proof: 'xxx',
                calendars: ['https://alice.btc.calendar.opentimestamps.org'],
                block_height: null,
                block_hash: null,
                upgraded_at: null,
            },
        });
        const r = await verify({ envelope: env, skipSignatureVerification: true });
        expect(r.ok).toBe(true);
        if (r.ok) expect(r.anchor.status).toBe('pending');
    });

    it('calls verifyOtsAnchor and surfaces its result on confirmed proofs', async () => {
        const env = await freshEnv({
            ots: {
                status: 'confirmed',
                proof: 'xxx',
                calendars: ['https://alice.btc.calendar.opentimestamps.org'],
                block_height: 890123,
                block_hash: '0'.repeat(64),
                upgraded_at: '2026-04-24T19:00:00Z',
            },
        });
        let called = false;
        const r = await verify({
            envelope: env,
            skipSignatureVerification: true,
            verifyOtsAnchor: async () => {
                called = true;
                return true;
            },
        });
        expect(called).toBe(true);
        expect(r.ok).toBe(true);
        if (r.ok && r.anchor.status === 'confirmed') {
            expect(r.anchor.verified).toBe(true);
            expect(r.anchor.blockHeight).toBe(890123);
        }
    });

    it('returns E_BAD_ANCHOR when verifyOtsAnchor rejects a confirmed proof', async () => {
        const env = await freshEnv({
            ots: {
                status: 'confirmed',
                proof: 'xxx',
                calendars: ['x'],
                block_height: 1,
                block_hash: '0'.repeat(64),
                upgraded_at: '2026-04-24T19:00:00Z',
            },
        });
        const r = await verify({
            envelope: env,
            skipSignatureVerification: true,
            verifyOtsAnchor: async () => false,
        });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_BAD_ANCHOR');
    });

    it('returns E_BAD_SIG when no verifier supplied and skipSignatureVerification is false', async () => {
        const env = await freshEnv();
        const r = await verify({ envelope: env });
        expect(r.ok).toBe(false);
        if (!r.ok) expect(r.code).toBe('E_BAD_SIG');
    });

    it('invokes the supplied BIP-322 verifier', async () => {
        const env = await freshEnv();
        let gotMsg = '';
        let gotAddr = '';
        const r = await verify({
            envelope: env,
            verifyBip322: async (msg, _sig, addr) => {
                gotMsg = msg;
                gotAddr = addr;
                return true;
            },
        });
        expect(r.ok).toBe(true);
        expect(gotMsg).toBe(env.id);
        expect(gotAddr).toBe(FIXED_ADDRESS);
    });
});

describe('canonical message consistency', () => {
    it('round-trips via canonicalMessage()', () => {
        const input = {
            address: FIXED_ADDRESS,
            content_hash: 'sha256:' + '0'.repeat(64),
            content_length: 12,
            content_mime: 'text/plain',
            signed_at: '2026-04-24T18:30:00Z',
        };
        const msg = canonicalMessage(input);
        const lines = msg.split('\n');
        expect(lines[0]).toBe('oc-stamp:v1');
        expect(lines[1]).toBe(`address: ${FIXED_ADDRESS}`);
        expect(lines[2]).toBe('content_hash: sha256:' + '0'.repeat(64));
        expect(lines[3]).toBe('content_length: 12');
        expect(lines[4]).toBe('content_mime: text/plain');
        expect(lines[5]).toBe('signed_at: 2026-04-24T18:30:00Z');
        expect(lines.length).toBe(6);
    });
});
