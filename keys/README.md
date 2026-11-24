# @orangecheck/keys

**Unreleased (0.0.0, private).** The reference implementation and vectors for
an account's own keys: the two secrets, what each one derives, the lock that
keeps them, and the public records that say who holds the identity key. The
normative text will move to a spec repo; until then this file is it, and the
section numbers below are the ones the source comments cite.

## §1 Two secrets

Every account has two 32-byte random secrets. Neither is derived from
anything, a passkey included.

| | made by | what it is for |
|---|---|---|
| **I**, identity | the server (custodial) or the browser | the identity address and the Nostr key |
| **W**, wallet | the browser, only | money: an on-chain wallet and the Fedimint client |

They are two separate draws, and the lock refuses `W = I`. orangecheck may
have held I (every account that starts without a passkey), and its deletion
cannot be proved, so no money ever sits under a key derived from I.

## §2 Derivation

Each secret is read as BIP-39 entropy: 24 English words, empty passphrase,
then BIP-32. Any standard wallet rebuilds every key from the words.

**From I**

- Identity address: BIP-84, `m/84'/0'/0'/0/0`, P2WPKH, always mainnet (`bc1q…`).
- Nostr key: NIP-06, `m/44'/1237'/0'/0/0`, x-only (BIP-340).

**From W**

- On-chain wallet: BIP-84 account `m/84'/0'/0'` on mainnet, `m/84'/1'/0'` on
  every test network; receive chain 0, change chain 1. The account key is
  exported with the plain BIP-32 version (`xpub` / `tpub`); a wallet that
  wants SLIP-132 (`zpub`) re-encodes the same key.
- Fedimint client root, as fedimint v0.13.0 (`264ebf22`) builds it:
  - `Bip39RootSecretStrategy::to_root_secret` (`fedimint-bip39/src/lib.rs:21`):
    `DerivableSecret::new_root(seed, b"Fedimint Client Salt")`, where `seed` is
    the BIP-39 seed of W's words with the empty passphrase. That is an
    HKDF-SHA512 extract; its 64-byte PRK is the root.
  - Per federation, `RootSecret::StandardDoubleDerive`
    (`fedimint-client/src/client/builder.rs:113`) calls
    `get_default_client_secret` (`fedimint-client-module/src/secret.rs:116`):
    `root.child_key(0).federation_key(id).child_key(0).child_key(0)`
    (`crypto/derive-secret/src/lib.rs`). Each step is
    `HMAC-SHA512(prk, info || 0x01)`, with info `"childkey" || u64be(n)` for a
    child and `id[0..8] || u64be(0)` for a federation.

**Why P2WPKH, not P2TR.** Every BIP-322 verifier in the family accepts both:
`@orangecheck/bip322` (`bip322/src/index.ts:268` and `:283`), the wallet
adapter (`wallet-adapter/src/sign.ts:262` picks the payment type from the
address) and the Python SDK (`sdk-py/orangecheck/verify_sig.py:295` and
`:297`). P2WPKH wins on the rest. Its BIP-322 signature is deterministic
(RFC 6979), so vectors are byte-exact. More outside verifiers and wallets
check it. And BIP-84 is the path most wallets restore from a phrase by
default, so the 24 words of I find the identity address there.

## §3 The lock

Every unlock method locks the same pair {I, W}. ochk.io stores the copies and
cannot open any of them.

- **PRF input.** One global value for every passkey:
  `SHA-256("oc-keys/v1 prf")`, asked for at create and at get.
- **Passkey copy.** `KEK = HKDF-SHA256(ikm = PRF output, salt = empty,
  info = "oc-keys/v1 passkey kek", 32)`. The plaintext is `I || W` (64 bytes).
- **Phrase copy.** The recovery phrase is W's own 24 words. A copy of I is
  locked under `KEK = HKDF-SHA256(ikm = W, salt = empty,
  info = "oc-keys/v1 phrase kek", 32)`; the plaintext is `I` (32 bytes).
  The phrase is offered, never required.
- **Cipher.** AES-256-GCM, a fresh random 12-byte nonce for every copy, a
  16-byte tag.
- **Additional data.** LF-separated lines with one final LF, rebuilt from the
  copy's own fields, so changing any of them stops the copy opening:

  ```
  oc-keys:lock:v1
  method: passkey
  did_oc: did:oc:<32 hex>
  credential_id: <unpadded base64url>   (passkey copies only)
  address: <the identity address>
  ```

A copy is this JSON object, with exactly these keys:

```json
{ "v": 1, "method": "passkey", "did_oc": "did:oc:…", "credential_id": "…",
  "address": "bc1q…", "nonce": "<12 bytes, base64url>", "ciphertext": "<base64url>" }
```

Opening checks, in order, and stops at the first failure:
1. the shape: version 1, the method's exact key set, a well-formed did:oc,
   a lowercase mainnet P2WPKH address, a 12-byte nonce, canonical unpadded
   base64url (`malformed`);
2. AES-GCM under the additional data (`lock_open_failed`);
3. I derives the copy's `address` (`bundle_address_mismatch`).

The phrase is read first: 24 valid words with a good checksum, or
`phrase_invalid`.

## §4 Records

Public statements of who holds an identity key. Each is text, LF-separated,
one final LF, no CR, fields in exactly this order, nothing padded. Its id is
the lowercase hex SHA-256 of that text. The signatures travel beside the text,
never inside it, so the id is the one an envelope with its signatures emptied
would have (family rule 4). Publication: kind 30078 under a new d-tag prefix,
to be allocated in `KINDS.md` with the spec.

```
oc-keys:binding:v1            oc-keys:takeover:v1           oc-keys:retire:v1
did_oc: did:oc:<32 hex>       did_oc: …                     did_oc: …
address: bc1q…                address: bc1q…                address: bc1q…
nostr: <64 hex, x-only>       nostr: …                      binding: <binding id>
custody: orangecheck | self   binding: <binding id>         issuer: bc1q…
issuer: bc1q…                 custody: self                 since_height: <n>
since_height: <n>             issuer: bc1q…                 since_block: <64 hex>
since_block: <64 hex>         since_height: <n>             reason: wallet_linked | merged
                              since_block: <64 hex>                 | deleted | withdrawn
                              trust: orangecheck held this key until this
                                record and says it deleted its copy. That
                                cannot be proven.
```

- **binding**: an address and Nostr key belong to a did:oc. `custody` says who
  made the key: `orangecheck` (no passkey at sign-up) or `self` (a passkey
  first).
- **takeover**: flips a custodial binding to `self`. Same address, same
  history; orangecheck then deletes its copy. The trust line is fixed text:
  the trust the record rests on, named in the record (family rule 8).
- **retire**: ends a custodial binding that was never taken over.
- **since** is a block the record was made after (its height and hash, RPC
  byte order): the tip when it was made. It is a lower bound, and the hash
  makes it one nobody can backdate past.
- **issuer** is orangecheck's issuer address, a mainnet P2WPKH address the
  spec names. A verifier needs only a node and a BIP-322 verifier.

**Who signs.** The issuer signs every record: `issuer_sig`, BIP-322 simple,
base64. A custodial key signs nothing. So a custodial binding and a retire
carry the issuer's signature only. A self binding and a takeover also carry
`address_sig` (BIP-322 simple, by the identity address) and `nostr_sig`
(BIP-340, 128 hex, by the Nostr key over the 32-byte id).

```json
{ "record": "<text>", "issuer_sig": "…", "address_sig": "…", "nostr_sig": "…" }
```

**What a verifier checks** for one record, offline, stopping at the first
failure:
1. an object with only those keys, string values (`malformed`);
2. the text parses and is canonical: the header names the type, each field
   appears once in its place, a did:oc, lowercase mainnet P2WPKH address and
   issuer, 64-hex Nostr key and binding id, a height with no leading zero, the
   fixed literals exact (`not_canonical`);
3. the issuer is one it trusts (`issuer_unknown`);
4. `issuer_sig` verifies for the issuer (`issuer_sig_invalid`);
5. a self binding or a takeover: `address_sig` is present
   (`address_sig_missing`) and verifies for the address
   (`address_sig_invalid`), and `nostr_sig` verifies for the Nostr key
   (`nostr_sig_invalid`). Any other record that carries either is refused
   (`custodial_key_signed`);
6. its own header chain has a block at `since_height` (`since_unverified`)
   and its hash is `since_block` (`since_not_on_chain`).

**Custody of an address** comes from every record the verifier holds for it.
One bad or conflicting record refuses the whole set:
- exactly one binding. Two refuse: `custody_flip_without_takeover` when one is
  custodial and one self, else `conflicting_bindings`;
- at most one takeover. It names the binding's id, the binding is custodial,
  its did:oc and Nostr key match, and its since height is not below the
  binding's;
- at most one retire, with the same checks, and never after a takeover: a
  taken-over key is the user's;
- the result is `orangecheck`, `self` or `retired`, and `born` says who made
  the key. Holding no takeover is not proof there is none, so `orangecheck`
  means "custodial as far as these records show".

## §5 Signatures by a bound address

For a signature that already verifies for the address, given the custody
above and what the verifier knows of when the signed artifact was made, each
height already checked against its own header chain:
- `anchoredAt`: the artifact's anchor (OpenTimestamps or a transaction); it
  existed before this block.
- `madeAfter`: a block whose hash the artifact commits to; it was made after.
- `takeoverAnchoredAt`: the takeover record's own anchor.

| custody | evidence | verdict |
|---|---|---|
| retired | any | refuse `retired` |
| orangecheck | any | refuse `custodial`: orangecheck made it |
| self from birth | any | accept `self_born` |
| taken over | impossible evidence (not a height; the takeover anchored at or below its since block; `madeAfter ≥ anchoredAt`) | refuse `bad_evidence` |
| taken over | `anchoredAt ≤ since_height` | refuse `before_takeover`: it existed before the takeover could be made |
| taken over | `madeAfter ≥ takeoverAnchoredAt` | accept `after_takeover`: made after the takeover existed |
| taken over | anything else | accept `on_trust` |

`on_trust` is accepted on the takeover's trust line: orangecheck deleted its
copy and no copy leaked. A strict verifier refuses it. This is how a verifier
tells that a signature made while orangecheck held the key was made by
orangecheck: the records say who held it, and the chain says when.

## §6 Vectors

`test-vectors/keys-v1.json`: 38 vectors (derivation `kd`, lock and open `kl`,
record `kr`, custody `kc`, signature `ks`), positive and negative, each with
`id`, `category`, `description`, `input` and `expected` (or `cases`).

- Every secret and private key in it is a **disclosed burn key**, derived from
  a published label in `test/vectors.build.ts`. None guards anything. Never
  send funds to these addresses.
- `chain.headers` holds the three mainnet blocks the records name; `issuers`
  holds the issuer address the vectors trust.
- `yarn vectors` rebuilds the file. `yarn test` fails unless the committed
  file is byte-identical to a rebuild and every vector holds when read back
  from the JSON alone.
- Published vectors it is checked against: BIP-39 (32-byte entropy), NIP-06
  (both), BIP-84 (account, first receive and change addresses).

Two cross-checks outside the TypeScript:
- `python3 -I test/check_vectors.py test-vectors/keys-v1.json`: the PRF input,
  both KEKs, every additional data, ciphertext and open, the record ids and
  the Fedimint root, in Python's standard library and `cryptography`.
- `test/fedimint-xcheck/`: Fedimint's own HKDF crate and rust-bip39 print
  the root and client secrets `test/derive.test.ts` pins.

## Using it

```ts
import { randomSecret, deriveIdentity, lockWithPasskey, openWithPasskey } from '@orangecheck/keys';

const I = randomSecret();
const W = randomSecret();
const { address, npub } = deriveIdentity(I);
const copy = lockWithPasskey({ identitySecret: I, walletSecret: W, prfOutput, credentialId, didOc });
const opened = openWithPasskey(copy, prfOutput); // { ok: true, identitySecret, walletSecret }
```

MIT.
