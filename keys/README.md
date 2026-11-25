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

**Lock domain.** The PRF input and the additional data assume the lock runs
on the key frame's own host (keys.ochk.app), not ochk.io. A passkey's PRF
output is bound to the RP ID it was made under, so a passkey made for another
host gives another output and opens nothing.

## §4 Records

Public statements of who holds an address's identity key. The normative text
is `KEY-HOLDER.md` in oc-attest-protocol, a companion to its SPEC.md; this
section is the implementation's summary of it.

**One word for one thing.** The *key holder* is whoever holds the identity
key: `orangecheck` or `user`. These records never say "custody", the word
oc-attest-protocol's FEDERATION-CUSTODY.md uses for who holds funds.

Each record is text, LF-separated, one final LF, no CR, ASCII, fields in
exactly this order, nothing padded. Its id is the lowercase hex SHA-256 of
that text. The signatures travel beside the text, never inside it, so the id
is the one an envelope with its signatures emptied would have (family rule 4).

```
oc-attest-key:binding:v1        oc-attest-key:takeover:v1       oc-attest-key:retire:v1
did_oc: did:oc:<32 hex>         did_oc: …                       did_oc: …
address: bc1q…                  address: bc1q…                  address: bc1q…
nostr: <64 hex, x-only>         nostr: …                        binding: <binding id>
key_holder: orangecheck | user  binding: <binding id>           issuer: bc1q…
issuer: bc1q…                   key_holder: user                since_height: <n>
since_height: <n>               issuer: bc1q…                   since_block: <64 hex>
since_block: <64 hex>           since_height: <n>               reason: own_wallet | merged
trust: <CUSTODIAL_TRUST>        since_block: <64 hex>                   | deleted | withdrawn
  (key_holder orangecheck only) trust: <TAKEOVER_TRUST>

oc-attest-key:issuer:v1
old: bc1q…
new: bc1q…
since_height: <n>
since_block: <64 hex>
```

The two trust lines are fixed text (`CUSTODIAL_TRUST`, `TAKEOVER_TRUST` in
`src/records.ts`), the trust each record rests on, named in the record
(family rule 8).

- **binding**: an address and Nostr key belong to a did:oc, and who made the
  key: `orangecheck` (an account that starts without a passkey) or `user` (a
  passkey first). Before a takeover, a custodial address is a reserved
  identity: the key exists, and signs nothing.
- **takeover**: the user holds the key now; orangecheck held it until this
  record's anchor. The binding stays, so the address keeps its history and is
  never read as the user's from the start. It is the first thing the key ever
  signs.
- **retire**: ends a custodial binding that was never taken over.
  `own_wallet`: the account's own wallet address became its identity, and
  the key orangecheck made is shredded. (Not a wallet link, §6.)
- **issuer**: hands the issuer role from one address to another, signed by
  both.
- **since** is a block the record was made after (its height and hash, RPC
  byte order): the tip when it was made. A lower bound nobody can backdate.
- **issuer** is orangecheck's issuer address, a mainnet P2WPKH address the
  spec names. The vectors use a placeholder burn key.

**Who signs.** The issuer signs every address record (`issuer_sig`, BIP-322
simple, base64). The key orangecheck holds signs nothing, so a custodial
binding and a retire carry the issuer's signature only. A user binding and a
takeover also carry `address_sig` (BIP-322 simple, by the identity address)
and `nostr_sig` (BIP-340, 128 hex, by the Nostr key over the 32-byte id). An
issuer record carries `old_sig` and `new_sig`, by each address. Any envelope
may carry `ots`, an OpenTimestamps proof of the id. Wallet links (§6) carry no
issuer signature.

```json
{ "record": "<text>", "issuer_sig": "…", "address_sig": "…", "nostr_sig": "…", "ots": "…" }
```

**Anchors order everything.** Who held a key when is read from Bitcoin
anchors, never from a date anyone signed. Every record is stamped with
OpenTimestamps; the verifier checks the proof against its own header chain
and passes the height it attests (`anchoredAt`). An anchor at or below the
record's own since block cannot be (`bad_anchor`). Copies of one record may
carry different proofs: the earliest anchor among the copies that verify is
the record's, in any order (`kh15`, `ki01`, `kb11`, `kb15`).

**Issuer terms.** The verifier starts from the issuer address the spec names
and follows every issuer record signed by both sides, back and forward
(`resolveIssuers`). Anything else under the issuer tag is ignored. Two records
out of one address or into one, a loop, or a since block not on the
verifier's chain refuse the whole set. An issuer's term starts at its
record's since block; a term that ended counts only for records anchored at
or below the anchor of the record that ended it (the since block where that
record has no anchor). orangecheck hands over only once every record the old
issuer made is anchored.

**What a verifier checks** for one record, offline, stopping at the first
failure (`verifyRecord`):
1. an object with only those keys, string values (`malformed`);
2. the text parses and is canonical (`not_canonical`);
3. the issuer is in a term it holds (`issuer_unknown`) and `issuer_sig`
   verifies (`issuer_sig_invalid`);
4. the anchor, if given, is above the since block (`bad_anchor`);
5. the since block is inside the issuer's term (`issuer_not_yet`,
   `issuer_retired`);
6. a user binding or a takeover: `address_sig` is present and verifies, and
   `nostr_sig` verifies (`address_sig_missing`, `address_sig_invalid`,
   `nostr_sig_invalid`). Any other record that carries either is refused
   (`custodial_key_signed`);
7. its own header chain has `since_block` at `since_height`
   (`since_unverified`, `since_not_on_chain`).

The result says whether a trusted issuer signed the text, so a reader can
tell a broken copy of a real record from noise anyone can publish.

**Who holds an address's key** (`resolveKeyHolder`) comes from every copy the
verifier read for the address:
- copies no trusted issuer signed are ignored: anyone can publish under the
  address's tag;
- a record the issuer signed counts once any copy of it verifies. If none
  does, the address is refused (`record_unverified`), never read as unbound;
- no binding: plain Bitcoin (`unbound`), but only when the read was complete,
  else `unavailable`. A read is complete when at least the read floor of the
  relays asked answered in full, each paged to its end, and none was cut off.
  The floor is the number asked, less the write quorum of 2, plus one, and
  never fewer than one: four of five (OC Pledge SPEC §11 item 15). ochk.io
  publishes every record to at least two of the relays verifiers ask. A
  binding the account itself names (its did:oc's record) exists whether found
  or not: `named_binding_missing`;
- exactly one binding, at most one takeover and at most one retire, each
  naming the binding, matching its did:oc (and Nostr key), and not below its
  since block. Only a custodial binding is taken over or retired;
- a retire counts against a takeover only when its anchor is at or below the
  takeover's since block (`takeover_after_retire`); otherwise the takeover
  stands;
- the result keeps `born` (who made the key, forever) beside `holder` (now:
  `orangecheck`, `user` or `retired`). Holding no takeover is not proof
  there is none, so `holder: orangecheck` means "as far as these records
  show", which only ever refuses more.

**Publication.** Kind 30078, no new kind. Each record has its own d tag,
`oc-attest-key:<address>:<id>` (an issuer record `oc-attest-key:issuer:<id>`),
so no record replaces another even under one publishing key, plus a `t` tag
for the address so oc-attest SPEC §6.2's address query returns them, and a
`t` tag `oc-attest-key` (`oc-attest-key-issuer`). The binding, retire and
issuer records go out under orangecheck's service Nostr key, the takeover
under the user's own (oc-chat §8.6). Wallet links and unlinks (§6) also go
out under the user's own; their d tag names the wallet, and they carry a `t`
tag for the wallet and one for the identity. `publicationTags` builds the tags.

## §5 Signatures by a bound address

For a signature that already verifies for the address, given the key holder
above and what the verifier knows of when the signed artifact was made, each
height already checked against its own header chain (`judgeSignature`):
- `anchoredAt`: the artifact's anchor (OpenTimestamps or a transaction); it
  existed by this block.
- `madeAfter`: a block whose hash the artifact commits to; it was made after.
- `live`: the verifier issued what was signed (a sign-in challenge) after it
  resolved the records.

| key holder | evidence | verdict |
|---|---|---|
| refused | any | refuse `unresolved` |
| no record | any | accept `unbound`: plain Bitcoin |
| any bound | impossible evidence (not a height; `madeAfter ≥ anchoredAt`) | refuse `bad_evidence` |
| retired | any | refuse `retired` |
| orangecheck | any, a live sign-in included | refuse `orangecheck_held` |
| user from the start | any | accept `user_born` |
| taken over | `anchoredAt ≤` the takeover's since height | refuse `before_takeover` |
| taken over | `live`, or `madeAfter ≥` the takeover's anchor | accept `after_takeover` |
| taken over | anything else | accept `ambiguous_window` |

A signature anchored above the takeover's since block but at or below the
takeover's own anchor is in an ambiguous window and is accepted, which adds
nothing beyond the named residual: orangecheck says it deleted its copy, and
that cannot be proven, so a copy it kept could sign after the takeover anyway.
The same holds for a signature with no anchor at all. Every verb applies this
rule to every signature by a bound address: Attest, Lock and Chat device
binds, Stamp, Agent delegations, Vote ballots, Pledge, and ochk.io sign-in.

## §6 Wallet links

No money sits at the identity address, so its weight starts at zero. A
wallet link lets the coins at one of the user's wallet addresses count for
the identity, checked offline with no issuer: both addresses sign it.

```
oc-attest-key:wallet-link:v1          oc-attest-key:wallet-unlink:v1
did_oc: did:oc:<32 hex>               did_oc: …
address: bc1q…  (the identity)        address: bc1q…
wallet: bc1q…   (another address)     wallet: bc1q…
binding: <the identity's binding id>  link: <the wallet link's id>
since_height: <n>                     since_height: <n>
since_block: <64 hex>                 since_block: <64 hex>
ack: <WALLET_LINK_ACK>
```

```json
{ "record": "<text>", "address_sig": "…", "wallet_sig": "…", "ots": "…" }
```

- It is made in the browser, where both keys are: at takeover with W's first
  receive address (`walletKey`), or later with any address the user can sign
  for (`walletLinkSign`). Only a user who holds the identity key can make
  one; a did:oc alone links nothing.
- A link carries both signatures, BIP-322 simple. An unlink carries either
  (`walletUnlinkSign`): ending a link only ever refuses more, so either key
  may end it.
- Both addresses are mainnet P2WPKH in v1, and the wallet is never the
  identity address. The ack line is fixed text a wallet shows before it
  signs.
- `verifyWalletRecord` checks one copy: its shape, canonical text,
  signatures, anchor and since block, as in §4. Its result says whose
  signatures verify.
- A link is public: anyone can see which wallet backs which identity. A user
  who wants coins to back an account without publishing them uses
  oc-attest-protocol BOND.md's bond instead.

**Which identity a wallet backs** (`resolveWalletLink`), from every copy read
under the wallet's `t` tag:
- the read must be complete (the floor in §4), whatever it found: a missed
  link or unlink could only make another link count wrongly (`unavailable`);
- copies the record's own keys did not sign are ignored. A link both keys
  signed, or an unlink signed by the wallet or by that link's identity, of
  which no copy verifies refuses the wallet (`record_unverified`,
  `bad_anchor`). Copies of one unlink signed by different keys make one
  unlink signed by each (`kb13`);
- a link counts from its anchor. One not yet anchored does not count yet;
- one identity at a time, in anchor order. A link anchored while another is
  in force never counts, even after that one ends. Two anchored in one block
  with none in force never count;
- an unlink ends its link at the unlink's anchor. Asked about now, any unlink
  ends it, anchored or not;
- an unlink the wallet signed, of a link the read does not hold, refuses the
  wallet (`unlink_without_link`). One signed only by an identity is ignored:
  anyone can sign for their own address;
- `at` asks about the block at that height instead of now: only links and
  unlinks anchored at or below it count.

**Whether it counts for an identity** (`judgeWalletLink`), given the
identity's and the wallet's key holders (§4) and the wallet's link:

| case | verdict |
|---|---|
| any of the three refused | refuse `unresolved` |
| the wallet backs no identity | refuse `not_linked` |
| it backs another identity | refuse `linked_elsewhere` |
| the identity's complete read holds no binding, though the link names one | refuse `unresolved` |
| another did:oc or binding than the identity's | refuse `link_mismatch` |
| a since block below the takeover's | refuse `before_takeover` |
| the identity's signature fails §5 at the link's anchor, its since block as `madeAfter` | refuse with §5's reason |
| the wallet's signature fails §5 (the wallet is itself a bound address) | refuse `wallet_key_refused` |
| otherwise | accept `linked` |

So a custodial account never links: the key orangecheck holds signs nothing.
A linked wallet's coins weigh for the identity as they weigh for the wallet
address, through an attestation by the wallet address re-resolved against
the chain; Stamp §8.1 step 7, Agent §4.4 and §8.4, and Pledge §8 say where.
The wallet can still sign as itself, so its coins weigh for both addresses:
a verifier that counts people rather than addresses treats a linked pair as
one.

## §7 Vectors

`test-vectors/keys-v1.json`: 81 vectors (derivation `kd`, lock and open `kl`,
record `kr`, issuer `ki`, key holder `kh`, signature `ks`, wallet record
`kw`, wallet link `kb` and its copies `kc`, publication `kn`), positive and
negative, each with `id`, `category`, `description`, `input` and `expected`
(or `cases`).

- Every secret and private key in it is a **disclosed burn key**, derived from
  a published label in `test/vectors.build.ts`. None guards anything. Never
  send funds to these addresses.
- `chain.headers` holds the four mainnet blocks the records name. `issuer`
  holds the placeholder issuer address and the issuer record every record and
  key-holder vector is checked under (`ki01` gives the terms).
- `yarn vectors` rebuilds the file. `yarn test` fails unless the committed
  file is byte-identical to a rebuild and every vector holds when read back
  from the JSON alone.
- Published vectors it is checked against: BIP-39 (32-byte entropy), NIP-06
  (both), BIP-84 (account, first receive and change addresses).

Two cross-checks outside the TypeScript:
- `python3 -I test/check_vectors.py test-vectors/keys-v1.json`, in Python's
  standard library and `cryptography`: the PRF input; both phrases as the
  BIP-39 encoding of I and W (against `test/bip39-english.txt`, pinned to the
  hash of the BIP's own list); both KEKs, every additional data, ciphertext
  and open; the record texts and ids; the issuer terms; the publication tags;
  the key-holder and signature rules over the records the vectors call good;
  and the wallet-link rule over every `wallet_link` vector. It does no curve
  math, so it takes signatures as given, and `wallet_link_copies` (copies
  with bad signatures) is for a checker that can verify BIP-322.
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

One call per step of a key's life (`src/issue.ts`). Each returns the record's
id, its envelope and an unsigned kind-30078 event; the caller stamps the id
with OpenTimestamps, adds the proof as `ots`, and signs the event with the
key §4 names.

```ts
import {
    countersignTakeover, identityKeys, issueCustodialBinding, issueRetire, randomSecret, readBack, signTakeover,
} from '@orangecheck/keys';

// ochk.io mints a key it holds, and binds it. The key signs nothing.
const keys = identityKeys(randomSecret());
const bound = issueCustodialBinding({ didOc, address: keys.address, nostr: keys.nostr, issuer, since: tip });

// After publishing a batch, and before counting it done:
readBack({ address: keys.address, expect: { binding: bound.id, holder: 'orangecheck' }, lookup, ctx });
// { ok: true } or { ok: false, reason: 'unavailable' | 'not_seen' | 'other_binding' | 'holder_differs' | 'refused' }

// Ending a binding never taken over (`withdrawn` undoes a published one):
issueRetire({ didOc, address: keys.address, binding: bound.id, reason: 'withdrawn', issuer, since: tip });

// The takeover, in two phases. The key frame signs first; ochk.io checks it
// against the binding it holds, adds the issuer's signature, and deletes its
// copy of the key only after `ok: true`. The user's own Nostr key publishes it.
const request = signTakeover({ binding: bound.envelope, keys, issuer: issuer.address, since: tip });
const done = countersignTakeover(request, { binding: bound.envelope, issuer, ctx });
```

`issuer` is `{ address, addressKey }`; an issue call refuses a key that is
not that address, and fields that do not make a canonical record.
`countersignTakeover` never throws on what the frame sends: it answers
`{ ok: false, reason }`, from `malformed` to the finished envelope's own
`verifyRecord` failure. It checks the request, not ochk.io's state: call it
only for an account whose binding ochk.io still holds and has neither
retired nor handed over.

MIT.
