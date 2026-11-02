// A revoked delegation must not verify when the caller passes what a kind-30085
// query returns. The built binary is run (CI builds before it tests) against a
// delegation and a revocation signed with real BIP-322 keys (each signs its own id).

import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    canonicalizeScopes,
    computeActionId,
    computeDelegationId,
    computeRevocationId,
    type ActionEnvelope,
    type DelegationEnvelope,
    type RevocationEnvelope,
} from '@orangecheck/agent-core';
import { addressFromPrivateKey, signMessage } from '@orangecheck/bip322';
import { describe, expect, it } from 'vitest';

import { readRevocations, REVOCATION_KIND } from './revocations';

const bin = fileURLToPath(new URL('../dist/cli.js', import.meta.url));

const principalKey = new Uint8Array(32).fill(3);
const agentKey = new Uint8Array(32).fill(4);
const PRINCIPAL = addressFromPrivateKey(principalKey, 'p2wpkh');
const AGENT = addressFromPrivateKey(agentKey, 'p2wpkh');

function delegation(): DelegationEnvelope {
    const now = Date.now();
    const fields = {
        principal: PRINCIPAL,
        agent: AGENT,
        scopes: canonicalizeScopes([`lock:seal(recipient=${AGENT})`]),
        bond_sats: 0,
        bond_attestation: 'none',
        issued_at: new Date(now - 3_600_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        expires_at: new Date(now + 86_400_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        nonce: '0123456789abcdef0123456789abcdef',
    };
    return {
        v: 1,
        kind: 'agent-delegation',
        id: computeDelegationId(fields),
        principal: { address: PRINCIPAL, alg: 'bip322' },
        agent: { address: AGENT, alg: 'bip322' },
        scopes: fields.scopes,
        bond: null,
        issued_at: fields.issued_at,
        expires_at: fields.expires_at,
        nonce: fields.nonce,
        revocation: { holders: ['principal'], ref: null },
        sig: {
            alg: 'bip322',
            pubkey: PRINCIPAL,
            value: signMessage(PRINCIPAL, computeDelegationId(fields), principalKey),
        },
    };
}

function revocation(d: DelegationEnvelope): RevocationEnvelope {
    const fields = {
        address: PRINCIPAL,
        delegation_id: d.id,
        reason: 'key lost',
        signed_at: new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
    };
    return {
        v: 1,
        kind: 'agent-revocation',
        id: computeRevocationId(fields),
        delegation_id: d.id,
        signer: { address: PRINCIPAL, alg: 'bip322' },
        reason: fields.reason,
        signed_at: fields.signed_at,
        ots: null,
        sig: {
            alg: 'bip322',
            pubkey: PRINCIPAL,
            value: signMessage(PRINCIPAL, computeRevocationId(fields), principalKey),
        },
    };
}

/** An action the agent signs under `d`, now. */
function action(d: DelegationEnvelope): ActionEnvelope {
    const content = {
        hash: 'sha256:' + '3'.repeat(64),
        length: 1024,
        mime: 'text/plain',
        ref: null,
    };
    const fields = {
        address: AGENT,
        content_hash: content.hash,
        content_length: content.length,
        content_mime: content.mime,
        signed_at: new Date(Date.now() - 10_000).toISOString().replace(/\.\d{3}Z$/, 'Z'),
        delegation_id: d.id,
        scope_exercised: d.scopes![0]!,
    };
    const id = computeActionId(fields);
    return {
        v: 1,
        kind: 'agent-action',
        id,
        content,
        signer: { address: AGENT, alg: 'bip322' },
        signed_at: fields.signed_at,
        delegation_id: d.id,
        scope_exercised: fields.scope_exercised,
        ots: null,
        sig: { alg: 'bip322', pubkey: AGENT, value: signMessage(AGENT, id, agentKey) },
    } as ActionEnvelope;
}

/** As a relay returns it: the envelope in `content`. The event's own signature is not what revokes. */
const asEvent = (rev: RevocationEnvelope) => ({
    id: 'e'.repeat(64),
    pubkey: 'f'.repeat(64),
    created_at: Math.floor(Date.now() / 1000),
    kind: REVOCATION_KIND,
    tags: [['t', rev.delegation_id]],
    content: JSON.stringify(rev),
    sig: '0'.repeat(128),
});

function verify(
    d: DelegationEnvelope | [DelegationEnvelope, ActionEnvelope],
    revocations?: unknown,
) {
    const dir = mkdtempSync(join(tmpdir(), 'oc-agent-cli-'));
    writeFileSync(join(dir, 'd.json'), JSON.stringify(d));
    const args = [bin, 'verify', join(dir, 'd.json'), '--json'];
    if (revocations !== undefined) {
        writeFileSync(join(dir, 'revs.json'), JSON.stringify(revocations));
        args.push('--revocations', join(dir, 'revs.json'));
    }
    const r = spawnSync(process.execPath, args, { encoding: 'utf8' });
    return { status: r.status, out: r.stdout + r.stderr };
}

describe('oc-agent verify --revocations', () => {
    const d = delegation();
    const rev = revocation(d);

    it('the built binary exists', () => {
        expect(existsSync(bin), 'run `yarn build` first: this checks dist/cli.js').toBe(true);
    });

    it('verifies the delegation when nothing revokes it', () => {
        const r = verify(d, []);
        expect(r.status, r.out).toBe(0);
        expect(JSON.parse(r.out)).toMatchObject({
            ok: true,
            revocation_checked: true,
            revocations_skipped: 0,
            not_a_revocation: 0,
            names_this_delegation_unverifiable: 0,
        });
    });

    it('refuses a revoked delegation given the kind-30085 events a relay returns', () => {
        const r = verify(d, [asEvent(rev)]);
        expect(r.status, r.out).toBe(1);
        expect(r.out).toContain('E_REVOKED');
    });

    it('refuses a revoked delegation given the envelope itself', () => {
        const r = verify(d, [rev]);
        expect(r.status, r.out).toBe(1);
        expect(r.out).toContain('E_REVOKED');
    });

    it('says when a revocation passed did not verify', () => {
        const forged = {
            ...rev,
            sig: { ...rev.sig, value: signMessage(AGENT, 'not the statement', agentKey) },
        };
        const r = verify(d, [asEvent(forged)]);
        expect(r.status, r.out).toBe(0);
        // Counted as a signal; revocation_checked still means "supplied and read".
        expect(JSON.parse(r.out)).toMatchObject({
            ok: true,
            revocation_checked: true,
            revocations_skipped: 1,
            names_this_delegation_unverifiable: 1,
            not_a_revocation: 0,
        });
    });

    // review-me's probe on de00140e: every way of writing the kind, and none.
    describe('the envelope decides, never the event kind', () => {
        const withKind = (kind: unknown) => ({ ...asEvent(rev), kind });
        const { kind: _k, ...kindless } = asEvent(rev);
        it.each([
            ['"30085 "', [withKind('30085 ')]],
            ['" 30085"', [withKind(' 30085')]],
            ['"030085"', [withKind('030085')]],
            ['"0x7555"', [withKind('0x7555')]],
            ['"30085.0"', [withKind('30085.0')]],
            ['"3.0085e4"', [withKind('3.0085e4')]],
            ['30085.5', [withKind(30085.5)]],
            ['1', [withKind(1)]],
            ['null', [withKind(null)]],
            ['[30085]', [withKind([30085])]],
            ['no kind at all', [kindless]],
        ])('an event whose kind is %s carrying a real revocation: E_REVOKED', (_k2, revs) => {
            const r = verify(d, revs);
            expect(r.status, r.out).toBe(1);
            expect(r.out).toContain('E_REVOKED');
        });
    });

    // review-me's probe: the unsigned `kind` field decides nothing (SPEC §9.1).
    describe('a revocation is applied whatever its unsigned kind field says', () => {
        const { kind: _kind, ...noKind } = rev as unknown as Record<string, unknown>;
        const otherKind = { ...rev, kind: 'revocation' };
        it.each([
            ['an event carrying a revocation with no kind', [asEvent(noKind as never)]],
            [
                'an event carrying a revocation with kind "revocation"',
                [asEvent(otherKind as never)],
            ],
            ['a bare revocation with no kind', [noKind]],
            [
                'junk beside a real event',
                [{ kind: REVOCATION_KIND, content: 'not json' }, asEvent(rev)],
            ],
            [
                'an event whose kind is the string "30085"',
                [{ ...asEvent(rev), kind: String(REVOCATION_KIND) }],
            ],
        ])('%s: E_REVOKED', (_what, revs) => {
            const r = verify(d, revs);
            expect(r.status, r.out).toBe(1);
            expect(r.out).toContain('E_REVOKED');
        });
        it.each([
            [
                'a junk object naming this delegation',
                'names_this_delegation_unverifiable',
                [{ kind: 'junk', delegation_id: d.id }],
            ],
            [
                'a kind-30085 event whose content is a JSON array',
                'names_this_delegation_unverifiable',
                [{ ...asEvent(rev), content: JSON.stringify([rev]) }],
            ],
            [
                'a kind-30085 event whose content is a JSON string',
                'names_this_delegation_unverifiable',
                [{ ...asEvent(rev), content: JSON.stringify(JSON.stringify(rev)) }],
            ],
            [
                'a plain note that names the delegation id',
                'names_this_delegation_unverifiable',
                [{ kind: REVOCATION_KIND, content: `see ${d.id}` }],
            ],
            [
                'a kind-30085 event whose content is not JSON',
                'not_a_revocation',
                [{ kind: REVOCATION_KIND, content: 'not json' }],
            ],
        ])('%s: OK, counted once as %s', (_what, kind, revs) => {
            const r = verify(d, revs);
            expect(r.status, r.out).toBe(0);
            const out = JSON.parse(r.out);
            expect(out).toMatchObject({ ok: true, revocations_skipped: 1, [kind]: 1 });
            // Anyone can publish these: a signal, never a change to revocation_checked.
            expect(out.revocation_checked).toBe(true);
        });
    });

    it('refuses only a file that is not a JSON array', () => {
        const r = verify(d, { not: 'an array' });
        expect(r.status, r.out).toBe(1);
        expect(r.out).toContain('BAD_REVOCATIONS');
    });

    it('reads around entries that are not revocations, and counts them', () => {
        const junk = [
            { kind: 1, content: '{}' },
            { kind: REVOCATION_KIND, content: '{"kind":"agent-delegation"}' },
            { kind: REVOCATION_KIND, content: 'not json' },
            42,
        ];
        const r = verify(d, junk);
        expect(r.status, r.out).toBe(0);
        expect(JSON.parse(r.out)).toMatchObject({
            ok: true,
            revocation_checked: true,
            revocations_skipped: 4,
            not_a_revocation: 4,
            names_this_delegation_unverifiable: 0,
        });
    });

    it('a junk entry beside a real revocation does not stop it revoking', () => {
        const r = verify(d, [{ kind: REVOCATION_KIND, content: 'not json' }, asEvent(rev)]);
        expect(r.status, r.out).toBe(1);
        expect(r.out).toContain('E_REVOKED');
    });

    it('an action under a revoked delegation is refused, given the relay events', () => {
        const pair: [DelegationEnvelope, ActionEnvelope] = [d, action(d)];
        const ok = verify(pair, []);
        expect(ok.status, ok.out).toBe(0);
        expect(JSON.parse(ok.out)).toMatchObject({ ok: true, verified: 'action + delegation' });
        const revoked = verify(pair, [asEvent(rev)]);
        expect(revoked.status, revoked.out).toBe(1);
        expect(revoked.out).toContain('E_REVOKED');
    });
});

describe('readRevocations', () => {
    const rev = revocation(delegation());
    it('unwraps an event whatever its kind, keeps an envelope, and counts the rest in two kinds', () => {
        const other = { kind: 1, content: '{}' };
        const stringKind = { ...asEvent(rev), kind: 'x' };
        const arrayNamingIt = { ...asEvent(rev), content: JSON.stringify([rev]) };
        expect(
            readRevocations(
                [asEvent(rev), rev, stringKind, other, 'x', arrayNamingIt],
                rev.delegation_id,
            ),
        ).toEqual({
            ok: true,
            revocations: [rev, rev, rev],
            notARevocation: 2,
            unreadableNamingThis: 1,
        });
    });
});
