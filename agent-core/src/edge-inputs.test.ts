// What each verifier answers for one odd input, by name: a typed refusal, and
// a revocation that cannot be read is skipped and counted, never a verdict.

import { describe, expect, it } from 'vitest';

import {
    AGENT,
    NOW,
    SUBAGENT,
    action,
    delegation,
    federation,
    revocation,
    subdelegation,
} from './envelopes.test-helper.js';
import { verifyFederationDelegation, verifyFederationRevocation } from './federation.js';
import type { ActionEnvelope, RevocationEnvelope } from './types.js';
import {
    createReplayGuard,
    verifyAction,
    verifyActionAsOfSignedAt,
    verifyDelegation,
    verifyRevocation,
    verifySubdelegation,
} from './verify.js';

const opts = { skipSignatureVerification: true } as const;
const root = delegation();
const sub = subdelegation(root);
const junk = (v: unknown) => v as RevocationEnvelope;

describe('a revocation that cannot be read revokes nothing, and is counted', () => {
    it('leaves the delegation valid beside a null, a number and a text entry', async () => {
        const r = await verifyDelegation({
            envelope: root,
            revocations: [junk(null), junk(7), junk('x')],
            now: NOW,
            ...opts,
        });
        expect(r).toMatchObject({ ok: true, revocationsSkipped: 3 });
    });

    it('still honours a real revocation listed after junk', async () => {
        const r = await verifyDelegation({
            envelope: root,
            revocations: [junk(null), revocation(root.id)],
            now: NOW,
            ...opts,
        });
        expect(r).toMatchObject({ ok: false, code: 'E_REVOKED' });
    });

    it('counts one citing the delegation that fails its own check', async () => {
        const forged = { ...revocation(root.id), signer: { address: SUBAGENT, alg: 'bip322' } };
        const r = await verifyDelegation({ envelope: root, revocations: [forged], now: NOW, ...opts });
        expect(r).toMatchObject({ ok: true, revocationsSkipped: 1 });
    });

    it('counts one citing a link of the action and failing its own check', async () => {
        const r = await verifyAction({
            action: action(root.id, AGENT),
            delegation: root,
            revocations: [revocation(root.id, SUBAGENT)],
            now: NOW,
            ...opts,
        });
        expect(r).toMatchObject({ ok: true, revocationsSkipped: 1 });
    });

    it('a federation delegation counts a single-address one the agent did not sign', async () => {
        const { del } = federation();
        const r = await verifyFederationDelegation({
            envelope: del,
            revocations: [revocation(del.id, SUBAGENT)],
            now: NOW,
            ...opts,
        });
        expect(r).toMatchObject({ ok: true, revocationsSkipped: 1 });
    });

    it('leaves an action valid beside junk revocations', async () => {
        const r = await verifyAction({
            action: action(root.id, AGENT),
            delegation: root,
            revocations: [junk(null), junk([null])],
            now: NOW,
            ...opts,
        });
        expect(r).toMatchObject({ ok: true, revocationsSkipped: 2 });
    });

    it('a federation delegation too', async () => {
        const { del } = federation();
        const r = await verifyFederationDelegation({
            envelope: del,
            revocations: [junk(null)],
            now: NOW,
            ...opts,
        });
        expect(r).toMatchObject({ ok: true, revocationsSkipped: 1 });
    });

    it('refuses a revocations value that is not a list', async () => {
        const r = await verifyDelegation({
            envelope: root,
            revocations: {} as never,
            now: NOW,
            ...opts,
        });
        expect(r).toMatchObject({ ok: false, code: 'E_MALFORMED' });
    });
});

describe('an action copy whose ots is not null or an object is E_MALFORMED', () => {
    const stripped = () => {
        const a: Partial<ActionEnvelope> = action(root.id, AGENT);
        delete a.ots;
        return a as ActionEnvelope;
    };
    /** The action with its ots set to `ots`, or with one field of its confirmed ots replaced. */
    const withOts = (ots: unknown) => ({ ...action(root.id, AGENT), ots: ots as never });
    const otsField = (field: string, value: unknown) =>
        withOts({ ...action(root.id, AGENT).ots!, [field]: value });
    it.each([
        ['stripped', stripped()],
        ['text', withOts('x')],
        ['an unknown status', otsField('status', 'x')],
        ['a proof that is not text', otsField('proof', 7)],
        ['a block height that is text', otsField('block_height', 'x')],
        ['a block hash that is a number', otsField('block_hash', 7)],
    ])('%s, live and as of signed_at', async (_what, a) => {
        const input = { action: a, delegation: root, revocations: [], ...opts };
        expect(await verifyAction({ ...input, now: NOW })).toMatchObject({ ok: false, code: 'E_MALFORMED' });
        expect(await verifyActionAsOfSignedAt(input)).toMatchObject({ ok: false, code: 'E_MALFORMED' });
    });
});

describe('inputs beside the envelope are checked before they are read', () => {
    it('a null link in the sub-delegation chain', async () => {
        const r = await verifyAction({
            action: action(sub.id, SUBAGENT),
            delegation: root,
            subdelegationChain: [null as never],
            revocations: [],
            now: NOW,
            ...opts,
        });
        expect(r).toMatchObject({ ok: false, code: 'E_MALFORMED' });
    });

    it.each([
        ['an agent that is null', { ...root, agent: null }],
        ['scopes that are not a list', { ...root, scopes: 'x' }],
        ['a scope that is not text', { ...root, scopes: [7] }],
        ['no kind', { ...root, kind: undefined }],
    ])('a parent with %s', async (_what, parent) => {
        const r = await verifySubdelegation({ envelope: sub, parent: parent as never, now: NOW, ...opts });
        expect(r).toMatchObject({ ok: false, code: 'E_MALFORMED' });
    });

    it('a revoked delegation whose principal is null', async () => {
        const r = await verifyRevocation({
            envelope: revocation(root.id),
            delegation: { ...root, principal: null } as never,
            ...opts,
        });
        expect(r).toMatchObject({ ok: false, code: 'E_MALFORMED' });
    });

    it.each([
        ['verifyDelegation', () => verifyDelegation({ envelope: null as never, ...opts })],
        ['verifyDelegation, no options', () => verifyDelegation(null as never)],
        ['verifyAction', () => verifyAction({ action: null as never, delegation: root, ...opts })],
        ['verifyActionAsOfSignedAt', () => verifyActionAsOfSignedAt(undefined as never)],
        ['verifySubdelegation', () => verifySubdelegation({ envelope: null as never, parent: root, ...opts })],
        ['verifyRevocation', () => verifyRevocation({ envelope: null as never, delegation: root, ...opts })],
        ['verifyFederationDelegation', () => verifyFederationDelegation({ envelope: null as never, ...opts })],
        [
            'verifyFederationRevocation',
            () => verifyFederationRevocation({ envelope: federation().rev, delegation: null as never, ...opts }),
        ],
    ])('%s with a null envelope', async (_name, run) => {
        expect(await run()).toMatchObject({ ok: false, code: 'E_MALFORMED' });
    });

    it.each([
        ['text', 'x'],
        ['an invalid date', new Date('nope')],
    ])('a now that is %s', async (_what, now) => {
        const at = now as Date;
        expect(await verifyDelegation({ envelope: root, revocations: [], now: at, ...opts })).toMatchObject({
            ok: false,
            code: 'E_MALFORMED',
        });
        expect(
            await verifyAction({ action: action(root.id, AGENT), delegation: root, revocations: [], now: at, ...opts })
        ).toMatchObject({ ok: false, code: 'E_MALFORMED' });
        expect(await verifySubdelegation({ envelope: sub, parent: root, now: at, ...opts })).toMatchObject({
            ok: false,
            code: 'E_MALFORMED',
        });
        expect(
            await verifyFederationDelegation({ envelope: federation().del, revocations: [], now: at, ...opts })
        ).toMatchObject({ ok: false, code: 'E_MALFORMED' });
    });

    it('a federation delegation whose bond is text, not an object or null', async () => {
        const { del } = federation();
        const r = await verifyFederationDelegation({
            envelope: { ...del, bond: 'x' } as never,
            revocations: [],
            now: NOW,
            ...opts,
        });
        expect(r).toMatchObject({ ok: false, code: 'E_MALFORMED' });
    });

    it('content that is not bytes', async () => {
        const r = await verifyAction({
            action: action(root.id, AGENT),
            delegation: root,
            revocations: [],
            content: 'x' as never,
            now: NOW,
            ...opts,
        });
        expect(r).toMatchObject({ ok: false, code: 'E_MALFORMED' });
    });

    it('a federation guardian or signature entry that is null', async () => {
        const { del } = federation();
        const guardians = [null, ...del.principal.descriptor.guardians.slice(1)];
        const descriptor = { ...del.principal.descriptor, guardians };
        const r1 = await verifyFederationDelegation({
            envelope: { ...del, principal: { ...del.principal, descriptor } } as never,
            skipRevocationCheck: true,
            now: NOW,
            ...opts,
        });
        expect(r1).toMatchObject({ ok: false, code: 'E_MALFORMED' });
        const r2 = await verifyFederationDelegation({
            envelope: { ...del, sig: { ...del.sig, signatures: [null, ...del.sig.signatures] } } as never,
            skipRevocationCheck: true,
            now: NOW,
            ...opts,
        });
        expect(r2).toMatchObject({ ok: false, code: 'E_MALFORMED' });
    });
});

describe('the replay guard', () => {
    it('answers false, never a throw, for an action it cannot remember', () => {
        const guard = createReplayGuard();
        for (const odd of [null, 7, 'x', {}, { id: 7 }, { id: '' }]) {
            expect(guard.firstUse(odd as never, NOW)).toBe(false);
        }
        expect(guard.firstUse(action(root.id, AGENT), 'x' as never)).toBe(false);
        expect(guard.firstUse(action(root.id, AGENT), NOW)).toBe(true);
        expect(guard.firstUse(action(root.id, AGENT), NOW)).toBe(false);
    });

    it('remembers an action whose signed_at it cannot read for maxSkewMs from now', () => {
        const guard = createReplayGuard(1000);
        const a = { ...action(root.id, AGENT), signed_at: 'soon' };
        expect(guard.firstUse(a, NOW)).toBe(true);
        expect(guard.firstUse(a, new Date(NOW.getTime() + 500))).toBe(false);
        expect(guard.firstUse(a, new Date(NOW.getTime() + 1000))).toBe(true);
    });
});

describe('a BIP-322 verifier that throws on what it cannot decode', () => {
    const throwing = async () => {
        throw new Error('cannot decode the signature');
    };
    it('makes the signature fail to verify, not the call', async () => {
        expect(
            await verifyDelegation({ envelope: root, skipRevocationCheck: true, now: NOW, verifyBip322: throwing })
        ).toMatchObject({ ok: false, code: 'E_BAD_SIG' });
        expect(
            await verifyRevocation({ envelope: revocation(root.id), delegation: root, verifyBip322: throwing })
        ).toMatchObject({ ok: false, code: 'E_BAD_SIG' });
        expect(
            await verifyFederationDelegation({
                envelope: federation().del,
                skipRevocationCheck: true,
                now: NOW,
                verifyBip322: throwing,
            })
        ).toMatchObject({ ok: false, code: 'E_BAD_SIG' });
    });
});
