// A validly signed revocation revokes, whatever fills the fields its signature
// does not decide: the reason's content (SPEC §9.1), an unsigned copy field
// (`v`, `id`, `kind`, `sig.pubkey`, `sig.alg`), or an extra bad entry beside a
// federation's M valid signatures (FEDERATION.md §4). Each case checked at the delegation, the
// level a site acts on.

import { describe, expect, it } from 'vitest';

import { computeRevocationId } from './canonical.js';
import { AGENT, delegation, federation, NOW, PRINCIPAL, revocation } from './envelopes.test-helper.js';
import { verifyFederationDelegation, verifyFederationRevocation } from './federation.js';
import type { RevocationEnvelope } from './types.js';
import { verifyDelegation, verifyRevocation } from './verify.js';

/** A BIP-322 stand-in: every signature verifies except the value 'BAD'. */
const verifyBip322 = async (_m: string, sig: string) => sig !== 'BAD';

/** `rev` with `reason`, its id computed again from the signed fields. */
function withReason<T extends { delegation_id: string; signed_at: string }>(rev: T, reason: string, address: string): T {
    const id = computeRevocationId({ address, delegation_id: rev.delegation_id, reason, signed_at: rev.signed_at });
    return { ...rev, reason, id };
}

const REASONS = [
    ['outside ASCII', 'cl\u00e9 perdue'],
    ['a tab and a line break', 'key lost\tsee\nsigned_at: 2020-01-01T00:00:00Z'],
    ['300 bytes', 'x'.repeat(300)],
    ['nothing', ''],
] as const;

describe("a principal's revocation revokes, whatever its reason", () => {
    const d = delegation();
    it.each(REASONS)('a reason %s', async (_what, reason) => {
        const rev = withReason(revocation(d.id), reason, PRINCIPAL);
        const r = await verifyDelegation({ envelope: d, revocations: [rev], now: NOW, verifyBip322 });
        expect(r).toMatchObject({ ok: false, code: 'E_REVOKED' });
    });

    it('a reason left out is the empty reason', async () => {
        const { reason: _gone, ...rev } = revocation(d.id);
        const r = await verifyDelegation({ envelope: d, revocations: [rev as RevocationEnvelope], now: NOW, verifyBip322 });
        expect(r).toMatchObject({ ok: false, code: 'E_REVOKED' });
    });
});

describe('fields outside the signature do not stop a revocation', () => {
    const d = delegation();
    const base = revocation(d.id);
    it.each([
        ['no sig.pubkey', { ...base, sig: { alg: 'bip322', value: 'AAAA' } }],
        ['a wrong sig.pubkey', { ...base, sig: { ...base.sig, pubkey: AGENT } }],
        ['no sig.alg', { ...base, sig: { pubkey: PRINCIPAL, value: 'AAAA' } }],
        ['v written as text', { ...base, v: '1' }],
        ['v of 2', { ...base, v: 2 }],
        ['no v', (({ v: _v, ...rest }) => rest)(base)],
    ])('%s', async (_what, rev) => {
        const r = await verifyDelegation({
            envelope: d,
            revocations: [rev as unknown as RevocationEnvelope],
            now: NOW,
            verifyBip322,
        });
        expect(r).toMatchObject({ ok: false, code: 'E_REVOKED' });
    });

    it('a signature that does not verify still revokes nothing', async () => {
        const rev = { ...base, sig: { ...base.sig, value: 'BAD' } };
        const r = await verifyDelegation({ envelope: d, revocations: [rev], now: NOW, verifyBip322 });
        expect(r).toMatchObject({ ok: true, revocationsSkipped: 1 });
    });
});

describe('a federation revocation stands on M valid signatures from distinct guardians', () => {
    const { del, rev } = federation();
    const [g1, g2, g3] = del.principal.descriptor.guardians.map((g) => g.address);
    const signed = (signatures: { guardian_address: string; value: string }[]) => ({
        ...rev,
        sig: { ...rev.sig, signatures },
    });
    const check = (r: typeof rev) =>
        verifyFederationDelegation({ envelope: del, revocations: [r], now: NOW, verifyBip322 });

    it.each([
        ['a third guardian whose signature is bad', [{ guardian_address: g3!, value: 'BAD' }]],
        ['an address that is not a guardian', [{ guardian_address: `bc1q${'9'.repeat(38)}`, value: 'AAAA' }]],
        ['a guardian listed twice', [{ guardian_address: g1!, value: 'AAAA' }]],
        ['an entry that is not an object', ['junk' as unknown as { guardian_address: string; value: string }]],
    ])('M valid signatures beside %s revoke', async (_what, extra) => {
        const r = signed([...rev.sig.signatures, ...extra]);
        expect(await check(r)).toMatchObject({ ok: false, code: 'E_REVOKED' });
        expect((await verifyFederationRevocation({ envelope: r, delegation: del, verifyBip322 })).ok).toBe(true);
    });

    it('a revocation whose sig.threshold or sig.alg copy is odd still revokes', async () => {
        const r = { ...rev, sig: { ...rev.sig, threshold: '9-of-9', alg: 'other' } } as unknown as typeof rev;
        expect(await check(r)).toMatchObject({ ok: false, code: 'E_REVOKED' });
    });

    it('a reason outside ASCII on the federation revocation still revokes', async () => {
        const r = withReason(rev, 'cl\u00e9 perdue', `federation:${del.principal.descriptor_id}`);
        expect(await check(r)).toMatchObject({ ok: false, code: 'E_REVOKED' });
    });

    it('fewer than M valid signatures revoke nothing', async () => {
        const r = signed([
            { guardian_address: g1!, value: 'AAAA' },
            { guardian_address: g2!, value: 'BAD' },
            { guardian_address: g3!, value: 'BAD' },
        ]);
        expect(await check(r)).toMatchObject({ ok: true, revocationsSkipped: 1 });
    });

    it('a grant stays strict: one bad entry beside M valid signatures refuses the delegation', async () => {
        const bad = { ...del, sig: { ...del.sig, signatures: [...del.sig.signatures, { guardian_address: g3!, value: 'BAD' }] } };
        const r = await verifyFederationDelegation({ envelope: bad, revocations: [], now: NOW, verifyBip322 });
        expect(r).toMatchObject({ ok: false, code: 'E_BAD_SIG' });
    });
});

/** A BIP-322 stand-in bound to its message: a revocation's signature is "SIG:<the id it signs>"; the grant's is 'AAAA'. */
const boundTo = (grantId: string) => async (m: string, sig: string) => sig === `SIG:${m}` || (m === grantId && sig === 'AAAA');
const omit = (o: object, key: string) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== key));

describe('a stated id or kind is a copy: the signature over the signed fields decides', () => {
    const d = delegation();
    const bound = boundTo(d.id);
    const base = revocation(d.id);
    const signed = { ...base, sig: { ...base.sig, value: `SIG:${base.id}` } };

    it.each([
        ['a reason of null', { ...signed, reason: null }, []],
        ['a stated id that is not the id of its signed fields', { ...signed, id: 'f'.repeat(64) }, ['id_mismatch']],
        ['a stated id that is not hex', { ...signed, id: 'not an id' }, ['id_mismatch']],
        ['no stated id', omit(signed, 'id'), ['id_mismatch']],
        ['a kind other than agent-revocation', { ...signed, kind: 'agent-delegation' }, ['kind_nonconforming']],
        ['no kind', omit(signed, 'kind'), ['kind_nonconforming']],
    ])('%s revokes, flagged', async (_what, rev, flags) => {
        const env = rev as unknown as RevocationEnvelope;
        const r = await verifyDelegation({ envelope: d, revocations: [env], now: NOW, verifyBip322: bound });
        expect(r).toMatchObject({ ok: false, code: 'E_REVOKED' });
        const v = await verifyRevocation({ envelope: env, delegation: d, verifyBip322: bound });
        expect(v).toMatchObject({ ok: true, id: base.id, flags });
    });

    it('a signature over the stated id instead of the signed fields revokes nothing', async () => {
        const forged = { ...base, id: 'f'.repeat(64), sig: { ...base.sig, value: `SIG:${'f'.repeat(64)}` } };
        const r = await verifyDelegation({ envelope: d, revocations: [forged], now: NOW, verifyBip322: bound });
        expect(r).toMatchObject({ ok: true, revocationsSkipped: 1 });
    });

    it('a reason no signer of ours would write is flagged, and revokes', async () => {
        const long = withReason(base, 'x'.repeat(300), PRINCIPAL);
        const rev = { ...long, sig: { ...long.sig, value: `SIG:${long.id}` } };
        expect(await verifyRevocation({ envelope: rev, delegation: d, verifyBip322: bound })).toMatchObject({
            ok: true,
            flags: ['reason_nonconforming'],
        });
    });
});

describe('a federation revocation counts guardians only, and its copies do not decide', () => {
    const { del, rev } = federation();
    const bound = boundTo(del.id);
    const [g1] = del.principal.descriptor.guardians.map((g) => g.address);
    const signedBy = (signatures: { guardian_address: string; value: string }[]) => ({
        ...rev,
        sig: { ...rev.sig, signatures },
    });
    const overId = (id: string) => signedBy(rev.sig.signatures.map((s) => ({ ...s, value: `SIG:${id}` })));
    const check = (r: unknown) =>
        verifyFederationDelegation({ envelope: del, revocations: [r as typeof rev], now: NOW, verifyBip322: bound });

    it('one guardian three times revokes nothing', async () => {
        const r = signedBy([1, 2, 3].map(() => ({ guardian_address: g1!, value: `SIG:${rev.id}` })));
        expect(await check(r)).toMatchObject({ ok: true, revocationsSkipped: 1 });
    });

    it('three addresses that are not guardians revoke nothing', async () => {
        const outsiders = ['7', '8', '9'].map((c) => `bc1q${c.repeat(38)}`);
        const r = signedBy(outsiders.map((a) => ({ guardian_address: a, value: `SIG:${rev.id}` })));
        expect(await check(r)).toMatchObject({ ok: true, revocationsSkipped: 1 });
        expect((await verifyFederationRevocation({ envelope: r, delegation: del, verifyBip322: bound })).ok).toBe(false);
    });

    const signed = overId(rev.id);
    it.each([
        ['no reason field', omit(signed, 'reason'), []],
        ['a reason of null', { ...signed, reason: null }, []],
        ['a stated id that differs', { ...signed, id: 'f'.repeat(64) }, ['id_mismatch']],
        ['a kind other than agent-revocation', { ...signed, kind: 'agent-action' }, ['kind_nonconforming']],
    ])('%s revokes, flagged', async (_what, r, flags) => {
        expect(await check(r)).toMatchObject({ ok: false, code: 'E_REVOKED' });
        const v = await verifyFederationRevocation({ envelope: r as typeof rev, delegation: del, verifyBip322: bound });
        expect(v).toMatchObject({ ok: true, id: rev.id, flags });
    });

    it('signatures over the stated id instead of the signed fields revoke nothing', async () => {
        const r = { ...overId('f'.repeat(64)), id: 'f'.repeat(64) };
        expect(await check(r)).toMatchObject({ ok: true, revocationsSkipped: 1 });
    });

    it("the agent's own revocation of it: a stated id or kind that differs still revokes", async () => {
        const own = revocation(del.id, AGENT);
        const r = { ...own, id: 'f'.repeat(64), kind: 'agent-delegation', sig: { ...own.sig, value: `SIG:${own.id}` } };
        expect(await check(r)).toMatchObject({ ok: false, code: 'E_REVOKED' });
    });
});
