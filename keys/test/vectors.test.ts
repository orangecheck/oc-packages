// The committed vectors are exactly what the reference implementation builds
// (OC_KEYS_WRITE_VECTORS=1 rewrites them), and every vector holds when read
// back from the JSON alone, as another implementation would read it.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fromB64url, fromHex, toHex } from '../src/bytes';
import { deriveIdentity, deriveWallet, fedimintClientSecret, fedimintRootSecret, secretToMnemonic } from '../src/derive';
import { lockAad, lockWithPasskey, lockWithPhrase, openWithPasskey, openWithPhrase, passkeyKek, phraseKek, PRF_SALT } from '../src/lock';
import { judgeSignature, resolveCustody, verifyRecord, type VerifyContext } from '../src/records';
import { buildVectors } from './vectors.build';

const FILE = join(__dirname, '..', 'test-vectors', 'keys-v1.json');
const built = JSON.stringify(buildVectors(), null, 2) + '\n';
if (process.env.OC_KEYS_WRITE_VECTORS === '1') writeFileSync(FILE, built);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Case = Record<string, Any>;
const file: Any = JSON.parse(readFileSync(FILE, 'utf8'));
const ctx: VerifyContext = {
    issuers: file.issuers,
    blockHash: (h) => file.chain.headers[String(h)],
};
const hex = (s: string) => fromHex(s)!;
const byId = (id: string): Any => file.vectors.find((v: Any) => v.id === id);
const opened = (r: ReturnType<typeof openWithPasskey>) =>
    r.ok ? { ok: true, identity_secret: toHex(r.identitySecret), wallet_secret: toHex(r.walletSecret) } : r;

it('the committed file is what the reference implementation builds', () => {
    expect(readFileSync(FILE, 'utf8')).toBe(built);
});

it('holds at least five vectors, positive and negative', () => {
    const ids = file.vectors.map((v: Any) => v.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBeGreaterThanOrEqual(5);
    expect(toHex(PRF_SALT)).toBe(file.constants.prf_salt);
});

describe.each<Case>(file.vectors.filter((v: Any) => v.category === 'derivation'))('$id derivation', (v: Any) => {
    it('derives every key it lists', () => {
        const I = hex(v.input.identity_secret);
        const W = hex(v.input.wallet_secret);
        const id = deriveIdentity(I);
        expect({ mnemonic: secretToMnemonic(I), ...id }).toEqual(v.expected.identity);
        for (const net of ['mainnet', 'testnet'] as const) {
            const w = deriveWallet(W, net);
            expect(w.mnemonic).toBe(v.expected.wallet.mnemonic);
            expect(w.fingerprint).toBe(v.expected.wallet.fingerprint);
            expect({
                account_path: w.accountPath,
                account_xpub: w.accountXpub,
                receive_0: w.address(0, 0),
                change_0: w.address(1, 0),
            }).toEqual(v.expected.wallet[net]);
        }
        expect(toHex(fedimintRootSecret(W))).toBe(v.expected.wallet.fedimint_root_prk);
        expect(toHex(fedimintClientSecret(W, v.input.federation_id))).toBe(v.expected.wallet.fedimint_client_prk);
        // No money is ever paid to the identity address: W's wallet never yields it.
        expect(v.expected.wallet.mainnet.receive_0).not.toBe(v.expected.identity.address);
    });
});

describe('lock vectors', () => {
    it.each(['kl01', 'kl02'])('%s: passkey copy', (vid) => {
        const v = byId(vid);
        const copy = lockWithPasskey({
            identitySecret: hex(v.input.identity_secret),
            walletSecret: hex(v.input.wallet_secret),
            prfOutput: hex(v.input.prf_output),
            credentialId: fromB64url(v.input.credential_id)!,
            didOc: v.input.did_oc,
            nonce: fromB64url(v.input.nonce)!,
        });
        expect(copy).toEqual(v.expected.copy);
        expect(toHex(passkeyKek(hex(v.input.prf_output)))).toBe(v.expected.kek);
        expect(new TextDecoder().decode(lockAad(copy))).toBe(v.expected.aad);
        expect(opened(openWithPasskey(v.expected.copy, hex(v.input.prf_output)))).toEqual(v.expected.opens);
    });

    it('kl01 and kl02 open to the same pair', () => {
        expect(byId('kl01').expected.opens).toEqual(byId('kl02').expected.opens);
    });

    it('kl03: phrase copy', () => {
        const v = byId('kl03');
        const copy = lockWithPhrase({
            identitySecret: hex(v.input.identity_secret),
            walletSecret: hex(v.input.wallet_secret),
            didOc: v.input.did_oc,
            nonce: fromB64url(v.input.nonce)!,
        });
        expect(copy).toEqual(v.expected.copy);
        expect(toHex(phraseKek(hex(v.input.wallet_secret)))).toBe(v.expected.kek);
        expect(opened(openWithPhrase(v.expected.copy, v.expected.phrase))).toEqual(v.expected.opens);
    });

    const opens = file.vectors
        .filter((v: Any) => v.category === 'open' || v.category === 'open_phrase')
        .flatMap((v: Any) => (v.cases ?? [v]).map((c: Any) => ({ ...c, category: v.category, label: `${v.id} ${c.name ?? ''}` })));
    it.each<Case>(opens)('$label', (c: Any) => {
        const r =
            c.category === 'open'
                ? openWithPasskey(c.input.copy, hex(c.input.prf_output))
                : openWithPhrase(c.input.copy, c.input.phrase);
        expect(opened(r)).toEqual(c.expected);
    });
});

describe('record vectors', () => {
    const cases = file.vectors
        .filter((v: Any) => v.category === 'record')
        .flatMap((v: Any) => (v.cases ?? [v]).map((c: Any) => ({ ...c, label: `${v.id} ${c.name ?? v.description}` })));
    it.each<Case>(cases)('$label', (c: Any) => {
        const r = verifyRecord(c.input, ctx);
        expect(r.ok ? { ok: true, id: r.id, type: r.record.type } : r).toEqual(c.expected);
    });
});

describe('custody vectors', () => {
    it.each<Case>(file.vectors.filter((v: Any) => v.category === 'custody'))('$id $description', (v: Any) => {
        const r = resolveCustody(v.input.address, v.input.records, ctx);
        if (!r.ok) return expect(r).toEqual(v.expected);
        expect({
            ok: true,
            custody: r.custody,
            born: r.born,
            binding: r.binding.id,
            ...(r.takeover ? { takeover: r.takeover.id, takeover_since_height: r.takeover.since.height } : {}),
        }).toEqual(v.expected);
    });
});

describe('signature vectors', () => {
    const cases = file.vectors
        .filter((v: Any) => v.category === 'signature')
        .flatMap((v: Any) => v.cases.map((c: Any) => ({ ...c, input: v.input, label: `${v.id} ${JSON.stringify(c.evidence)}` })));
    it.each<Case>(cases)('$label', (c: Any) => {
        const state = resolveCustody(c.input.address, c.input.records, ctx);
        if (!state.ok) throw new Error(state.reason);
        expect(judgeSignature(state, c.evidence)).toEqual(c.expected);
    });
});
