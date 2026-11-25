// The committed vectors are exactly what the reference implementation builds
// (OC_KEYS_WRITE_VECTORS=1 rewrites them), and every vector holds when read
// back from the JSON alone, as another implementation would read it.
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { fromB64url, fromHex, toHex } from '../src/bytes';
import { deriveIdentity, deriveWallet, fedimintClientSecret, fedimintRootSecret, secretToMnemonic } from '../src/derive';
import { lockAad, lockWithPasskey, lockWithPhrase, openWithPasskey, openWithPhrase, passkeyKek, phraseKek, PRF_SALT } from '../src/lock';
import {
    judgeSignature,
    judgeWalletLink,
    parseRecord,
    publicationTags,
    recordId,
    resolveIssuers,
    resolveKeyHolder,
    resolveWalletLink,
    verifyRecord,
    verifyWalletRecord,
    type KeyHolderState,
    type VerifyContext,
    type WalletLinkState,
} from '../src/records';
import { buildVectors } from './vectors.build';

const FILE = join(__dirname, '..', 'test-vectors', 'keys-v1.json');
const built = JSON.stringify(buildVectors(), null, 2) + '\n';
if (process.env.OC_KEYS_WRITE_VECTORS === '1') writeFileSync(FILE, built);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Any = any;
type Case = Record<string, Any>;
const file: Any = JSON.parse(readFileSync(FILE, 'utf8'));
const blockHash = (h: number): string | undefined => file.chain.headers[String(h)];
const issuers = resolveIssuers(file.issuer.named, file.issuer.records, blockHash);
if (!issuers.ok) throw new Error(`the file's issuer records do not resolve: ${issuers.reason}`);
const ctx: VerifyContext = { issuers: issuers.terms, blockHash };
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

const flat = (category: string) =>
    file.vectors
        .filter((v: Any) => v.category === category)
        .flatMap((v: Any) =>
            (v.cases ?? [v]).map((c: Any) => ({
                ...c,
                input: c.input ?? v.input,
                label: `${v.id} ${c.name ?? (c.evidence ? JSON.stringify(c.evidence) : v.description)}`,
            }))
        );

/** A bound state as the vectors write it: ids and heights, not whole records. */
const summary = (s: KeyHolderState) =>
    s.status !== 'bound'
        ? s
        : {
              status: s.status,
              born: s.born,
              holder: s.holder,
              binding: s.binding.id,
              ...(s.takeover
                  ? {
                        takeover: s.takeover.id,
                        takeover_since: s.takeover.since.height,
                        ...(s.takeover.anchoredAt !== undefined ? { takeover_anchored_at: s.takeover.anchoredAt } : {}),
                    }
                  : {}),
              ...(s.retire ? { retire: s.retire.id, retire_reason: s.retire.reason } : {}),
          };

const resolve = (input: Any) =>
    resolveKeyHolder(input.address, input.lookup, input.namedBinding ? { ...ctx, namedBinding: input.namedBinding } : ctx);

describe('record vectors', () => {
    it.each<Case>(flat('record'))('$label', (c: Any) => {
        const r = verifyRecord(c.input.envelope, ctx, c.input.anchoredAt);
        expect(r.ok ? { ok: true, id: r.id, type: r.record.type, signed: r.signed } : r).toEqual(c.expected);
    });
});

describe('issuer vectors', () => {
    it.each<Case>(flat('issuers'))('$label', (c: Any) => {
        expect(resolveIssuers(c.input.named, c.input.records, blockHash)).toEqual(c.expected);
    });

    it("the file's own issuer records resolve to ki01's terms", () => {
        expect(issuers).toEqual(byId('ki01').expected);
    });
});

describe('key-holder vectors', () => {
    it.each<Case>(flat('key_holder'))('$label', (c: Any) => {
        expect(summary(resolve(c.input))).toEqual(c.expected);
    });
});

describe('signature vectors', () => {
    it.each<Case>(flat('signature'))('$label', (c: Any) => {
        expect(judgeSignature(resolve(c.input), c.evidence)).toEqual(c.expected);
    });
});

describe('wallet record vectors', () => {
    it.each<Case>(flat('wallet_record'))('$label', (c: Any) => {
        const r = verifyWalletRecord(c.input.envelope, blockHash, c.input.anchoredAt);
        expect(r.ok ? { ok: true, id: r.id, type: r.record.type, signed: r.signed } : r).toEqual(c.expected);
    });
});

/** A wallet's link as the vectors write it. */
const linkSummary = (s: WalletLinkState) =>
    s.status !== 'linked' ? s : { status: s.status, address: s.address, link: s.link.id, anchored_at: s.link.anchoredAt };

describe('wallet link vectors', () => {
    it.each<Case>([...flat('wallet_link'), ...flat('wallet_link_copies')])('$label', (c: Any) => {
        const { address, wallet, address_records, wallet_records, at } = c.input;
        const link = resolveWalletLink(wallet, wallet_records, { blockHash }, at);
        const verdict = judgeWalletLink({
            address,
            identity: resolveKeyHolder(address, address_records, ctx),
            link,
            wallet: resolveKeyHolder(wallet, wallet_records, ctx),
        });
        expect({ link: linkSummary(link), verdict }).toEqual(c.expected);
    });
});

describe('publication vectors', () => {
    it.each<Case>(flat('publication'))('$label', (c: Any) => {
        expect(publicationTags(c.input)).toEqual(c.expected);
        // The d tag names the record's own id, so no record replaces another under one key.
        expect(c.expected[0][1].endsWith(`:${recordId(c.input)}`)).toBe(true);
    });

    it.each<Case>(flat('publication_no_bare_address'))('$label', (c: Any) => {
        const r = parseRecord(c.input) as Any;
        const addresses = [r.address, r.wallet, r.old, r.new].filter(Boolean);
        const bare = publicationTags(c.input).filter(([k, v]) => k === 't' && addresses.includes(v));
        expect({ bare_address_tags: bare }).toEqual(c.expected);
    });
});
