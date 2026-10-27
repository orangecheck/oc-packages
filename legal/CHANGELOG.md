# Changelog

All notable changes to **`@orangecheck/legal`** will be documented in this file.

These documents are the published, binding terms for the products that render
them. A change here changes what a customer has agreed to, so every entry says
plainly what was claimed before and what is claimed now.

## [Unreleased]

## [0.7.22] — 2026-10-27

### Changed — what ochk.app asks of a guardian operator

ochk.app's Terms said it "does not require your legal name, government ID, or
physical address", and its Privacy policy said it "never collects your legal
name, government ID, or physical address", with no limit. Both now say this of
people who sign in, use apps or get paid, which is true on every path. The
Privacy policy's list of what orangecheck stores gains "guardian applications":
an application to run a guardian, through ochk.app or by email to
apply@ochk.io, holds the answers to the operator questionnaire and, through
ochk.app, an optional handle and email address for the decision. The
questionnaire asks for the name of the person or organisation that will run the
guardian, its jurisdiction, a public contact channel, a key fingerprint and two
references. The handle, name, jurisdiction, contact channel and fingerprint are
published in the federation charter, as the questionnaire (E1) and the charter
format say, because guardians are named trust anchors; nothing is checked
against an ID and nothing else is published. Both documents are dated
2026-10-27.

The owner may still decide that operators are not named. In that case this
item and the questionnaire's question come out together.

## [0.7.21] — 2026-10-26

### Added — what relay.ochk.io keeps

The ochk.io Privacy policy did not mention relays at all, though every family
site reads and publishes signed records through relay.ochk.io, which
orangecheck runs. Its "sent from your browser to others" list now names
relay.ochk.io: the records it keeps (public, archived daily, replaced by a
newer version from the same key or removed at their own expiry, otherwise
deleted only on a lawful takedown), that each is stored with our host's proxy address rather
than the visitor's and that this is never served, that Fly.io carries each
connection for its own short retention window, and that our host's connection
logs for the relay can hold the visitor's IP address and connection times for
7 days. The retention list says the same. Third-party relays stay covered by
the Terms.

## [0.7.20] — 2026-10-26

### Changed — a session no longer keeps an IP address

ochk.io stopped writing the IP address to a session's row; the sign-in log
still records it for each sign-in and each identity linked or removed, and
clears it after 90 days. The ochk.io Privacy policy's "each session" line and
the ochk.app Privacy policy's "session record" line no longer name an IP
address; both sign-in log lines and both retention lists say the IP is cleared
after 90 days, and the ochk.app list now names the sign-in log as the ochk.io
list does. Both Privacy policies' updated dates move to 2026-10-26.

### Added — the calendars an OC Chat handle claim reaches

Neither the ochk.io Terms nor its Privacy policy said that claiming an OC
Chat @handle sends anything outside orangecheck. The Terms' third-party list,
and a new "sent from your browser to others" list in the Privacy policy, now
name the three OpenTimestamps calendars the browser sends the claim's SHA-256
fingerprint to, and mempool.space, which it reads the address's coins and
block headers from, and say each sees the visitor's IP address and when they
asked. The Privacy policy has no single list of recipients, so the line sits
in both. Both documents' updated dates move to 2026-10-26.

## [0.7.19] — 2026-10-25

### Added — the record of which sites you sign in to

The ochk.app Privacy policy's list of what orangecheck stores did not mention
that me.ochk.io records which live sites a person signed in to or shared data
with, and when. It now does: a site can name the person as the one who earned
for an event only once that record exists, no site sees it, and it is erased
with the account or with that site's project. The sentence on what
integrators never receive called the same record "your connected-sites list";
it now uses the one name, "your site sign-ins". The Privacy policy's updated
date moves to 2026-10-25.

## [0.7.18] — 2026-10-24

### Changed — what sites learn when you sign in

The ochk.app Terms and Privacy policy said the id a site gets for you is
unlinkable across sites, so two sites could not correlate you. They now say
each site gets its own subject id for the events it reports, but signing in
gives every site the same orangecheck id (did:oc), so sites that compare ids
can tell it is you. The policies' short descriptions no longer list a
"per-integrator scoped identity", and the Terms' updated date moves to
2026-10-24.

## [0.7.17] — 2026-10-24

### Changed — the record a deletion keeps is under a keyed id

The ochk.app Privacy policy said the record of a deleted account is kept under
the account's id, and that payment receipts are kept under an id that no
longer leads to the person. It now says both are kept under a keyed id, so the
record by itself doesn't say whose account it was: me.ochk.io, vault, chat and
cosign each keep them under a keyed hash of the account's id, and none of them
looks a deleted account up by its own id any more. orangecheck holds the key,
so it does not claim the record can never be linked back. The policy's updated
date moves to 2026-10-24.

## [0.7.16] — 2026-10-24

### Added — deleting an account that runs a guardian

The ochk.app Privacy policy's deletion section did not mention guardian
operators. It now says an operator can delete once their operator key holds
no seat or hosted guardian, has finished any exit, created no federation that
still exists, and is owed nothing. It says that charter signatures, incidents
and amendment proposals the key signed stay public under the key, with what
the operator wrote in them, and that exit records and machine reports stay
visible to that federation's guardians and to orangecheck.

### Added — the record a deletion keeps

The same section now says that a record of the deletion is kept under the
account's id, out of public view, so sessions the account already had stop
working and the deletion can be shown.

## [0.7.15] — 2026-10-23

### Added — an account a site made for you

The ochk.app Privacy policy said nothing about accounts a site makes through
OrangeCheck Connect. It now says what is kept for one (a hash of the id the
site gave you, a keyed hash of your email if the site sent one, when it was
made, whether you agreed to earn, and what it earned), that it keeps no
sign-in times, that it earns nothing until you agree, and how it ends: you
claim it and delete your own account, or the site deletes it unless it holds
earnings, after which only a hash remains so it cannot be made again without
you.

## [0.7.14] — 2026-10-20

### Changed — the docs address

The protocol Terms and Privacy policy named `docs.ochk.io` as a covered site. The
docs now live at `ochk.io/docs` and the old host redirects there, so both
documents say "ochk.io, including its documentation at ochk.io/docs". What is
covered is unchanged.

## [0.7.13] — 2026-10-20

### Changed — one contact address

General and privacy questions went to hello@ochk.io while the sites' contact pages
said contact@ochk.io. Both now say contact@ochk.io. Security reports still go to
security@ochk.io.

## [0.7.12] — 2026-10-20

### Changed — no PGP key is claimed

The security block said a PGP fingerprint and key were published; none was. It now
offers email or a private GitHub security advisory.

### Changed — one reply target for security reports

- **`SecurityDisclosure`, was:** "acknowledgement within 72 hours of receipt"
  and "triage within 7 days — whether we agree it is a vulnerability, the
  severity assigned, and a target fix date". **Now:** "we aim to reply to every
  report within 30 days" and "we can't promise a time to a fix yet". Every
  OrangeCheck repository and page now states the same target.

## [0.7.11] — 2026-10-19

### Changed — the Service is ochk.app; me.ochk.io is its API

me.ochk.io's pages are retiring into ochk.app. me.ochk.io stays, serving the
API. No fact about custody, money, data or cookies changed; only which address
the documents call the Service.

- **me terms, who the Service is, was:** "me.ochk.io is a commercial product
  operated by OrangeCheck … The same Service is also served at ochk.app … and
  'me.ochk.io' in them means both." **Now:** "ochk.app is a commercial product
  operated by OrangeCheck … Its API is served at me.ochk.io, from the same
  accounts and records: these Terms govern the Service at either address, and
  'ochk.app' in them means both."
- **me terms, acceptance, was:** "By accessing or using me.ochk.io, you agree
  …". **Now:** "By accessing or using ochk.app or its API at me.ochk.io, you
  agree …".
- **me terms, every sentence whose subject was the product** (overview, not a
  bank, earning, no KYC, abuse limits, disclaimers, regulatory status,
  termination) now says ochk.app where it said me.ochk.io. Integrators "integrate
  ochk.app through its API at me.ochk.io".
- **me privacy, scope, was:** "both of its addresses, me.ochk.io and ochk.app
  … 'me.ochk.io' below means both". **Now:** "both of its addresses, ochk.app
  and its API at me.ochk.io … 'ochk.app' below means both." "never collects
  your legal name" now has ochk.app as its subject. The cookie paragraphs swap
  order, so ochk.app's comes first; both say what they said before.
- **me.ochk.io is still named** where the address itself is the fact: the
  cross-site linkage sits in storage on me.ochk.io infrastructure, the cookies
  set on me.ochk.io, the data a deletion erases there, and its own anchors.
- **Titles:** "Terms of Service — ochk.app" and "Privacy Policy — ochk.app"
  (were "— me.ochk.io"). The `me` site's `host`, `product` and
  `productShort` are `ochk.app`; its slug stays `me`.
- **ochk.io terms and privacy, was:** "the commercial products me.ochk.io and
  vault.ochk.io" publish their own Terms, pricing and privacy policies.
  **Now:** "ochk.app and vault.ochk.io".

`test/claims.test.mjs` now fails if me.ochk.io is the subject of a claim about
the Service, or is named as a commercial product.

## [0.7.10] — 2026-10-17

### Changed — deleting an account deletes it

Account deletion now completes across the family: erasing a person's data on
me.ochk.io, vault, chat and cosign, then closing their sign-in on ochk.io.

- **me.ochk.io, "deletable":** was "you can permanently revoke your identity
  in your settings", while completing a request left the sign-in account in
  place. Now: "you can delete your account in your settings: your data is
  erased and your sign-in closes".
- **me.ochk.io, retention of the account row:** was "deleted on request via
  the account-deletion flow", which never touched it. Now: deleted, with
  sign-in identities, passkeys and sessions, when the request completes;
  anchored and published data cannot be deleted by anyone.
- **me.ochk.io, "identity & account deletion":** now says a person reviews the
  request within 48 hours; completing it erases data on ochk.io, me.ochk.io,
  vault, chat and cosign and closes the sign-in; payment receipts are kept
  for accounting under an id that no longer leads to the person; backups roll
  off within 30 days; Nostr and Bitcoin records cannot be removed, and the
  attestations, polls, pledges, stamps and chat listing a person published
  carry their Bitcoin address. It no longer says "no federation is bound
  during bring-up" or that published records name no one.
- **ochk.io, account and sign-in records:** was "kept until you ask us to
  delete them … there is no automatic deletion yet". Now: deleted when the
  account-deletion request completes.

## [0.7.9] — 2026-10-16

### Changed — the last two places that tied held earnings to email sign-in

- **me.ochk.io terms, accounts, was:** email-OTP users hold no key, "so
  OrangeCheck holds what you accrue during bring-up". **Now:** OrangeCheck
  holds an email user's signing key, and either way, during bring-up, holds
  the cashback every user accrues.
- **me.ochk.io terms, custody, was:** "for email users, during this period,
  OrangeCheck is a custodian". **Now:** a custodian of email users' signing
  keys and of every user's accrued cashback. 0.7.8 corrected the same claim in
  three other places.

## [0.7.8] — 2026-10-16

### Changed — a wallet user's earnings are held by OrangeCheck too

- **me.ochk.io terms, custody, was:** "If you sign in with BIP-322 … it
  cannot move your funds", with nothing on what such a user earns. **Now:**
  adds that cashback a user accrues is a balance OrangeCheck owes until it is
  paid out, and that during bring-up OrangeCheck holds those sats for every
  user, however they sign in. This is what /custody has computed all along.
- **me.ochk.io terms, regulatory status, was:** OrangeCheck custodies "the
  funds it pays to email-identity users"; "Self-custody (BIP-322) users are
  unaffected: OrangeCheck never holds their keys or their funds." **Now:** it
  custodies the cashback it pays to every user; BIP-322 users keep their
  keys, and their accrued cashback is held by OrangeCheck until paid out.
- **me.ochk.io terms, summary, was:** "if you sign in with your own bitcoin
  wallet, orangecheck holds no keys and no funds." **Now:** a wallet user
  keeps their keys; either way, during bring-up OrangeCheck holds what you
  have earned until it is paid out or federations take it over.

### Fixed

- The two clauses set in capitals now name the entity in capitals too
  ("IN NO EVENT SHALL ORANGECHECK"), via a new `ENTITY_UPPER` token.
- Links read as words ("your settings", "the security page") instead of raw
  paths. Same destinations.

## [0.7.7] — 2026-10-15

### Changed — wording only, no change to what is claimed

- **All terms, entity of record, was:** 'operated as the unincorporated
  project "OrangeCheck (OCHK), an unincorporated project"', which said it
  twice. **Now:** 'the party of record is OrangeCheck (OCHK), an
  unincorporated project'. The successor clause is unchanged.
- **me.ochk.io terms and privacy, summary line, was:** named me.ochk.io.
  **Now:** names me.ochk.io and ochk.app, as both documents' first callout
  already did.

## [0.7.6] — 2026-10-15

### Changed — the Service has a second address

- **me.ochk.io terms and privacy, was:** named only me.ochk.io. **Now:** say
  once that the same Service is also served at ochk.app, from the same accounts
  and records, and that both documents govern it at either address.
- **me.ochk.io privacy, cookies, was:** listed the four `.ochk.io` cookies.
  **Now:** also lists ochk.app's two (`__Host-oc_session`, bound to ochk.app;
  `__Host-oc_oauth`, at most ten minutes during a Google or GitHub sign-in) and
  that ochk.app's page analytics are orangecheck's own cookie-free counter.

## [0.7.5] — 2026-10-09

### Added — the signup email to operators

- **ochk.io privacy, was:** silent on it. **Now:** when a new account first
  signs in, OrangeCheck's operators get an email through Resend naming its
  `did:oc` and the identity it signed in with, a Bitcoin address or an email
  address. oc-www has sent that email since the owner notifications shipped.

## [0.7.4] — 2026-10-09

### Fixed — me.ochk.io does not publish envelopes

- **me.ochk.io terms and privacy, was:** "Nostr-published envelopes" and
  "Nostr-published event roots" are immutable public records of fee flows.
  **Now:** each envelope's hash is anchored to Bitcoin and a salted commitment
  to it goes to Nostr. Neither names the user, the site or the amount; the
  envelope is served only to whoever holds its id. Drop manifests, which name
  no one, are published in full. me.ochk.io changed what it publishes on
  2026-10-09, before any envelope reached a relay.

## [0.7.3] — 2026-10-08

### Fixed — the policies now say what the code stores

Each passage below was compared with the code that does the storing (oc-www
`lib/auth/*`, oc-vault-web `lib/vault-key.ts`, `lib/backup.ts`, `lib/export.ts`),
and where they disagreed the text was rewritten from the code. A test
(`test/claims.test.mjs`, now in CI) renders every Terms and Privacy document
and fails on each phrase that was live and false.

- **ochk.io privacy, was:** sign-in is "Sign in with Bitcoin … no password, no
  email"; session rows hold "a user-agent hash"; the cookie is `SameSite=Lax`;
  server logs "retained 90 days, then auto-deleted". **Now:** sign-in is a
  Bitcoin signature, an email code, Google or GitHub; the verified email is
  stored encrypted, with a one-way hash for lookup; each session stores the
  token's hash, the IP address and the full user-agent string; sign-ins and
  identity changes are logged with IP and user-agent; passkeys store a public
  key and label; every cookie is listed with its real attributes
  (`oc_session` HttpOnly; Secure; SameSite=None; 30 days); request logs live
  only in the hosting provider's own window; nothing is deleted on a timer
  yet, and the policy says so.
- **ochk.io terms, was:** the same Bitcoin-only, `SameSite=Lax` account
  paragraph. **Now:** matches the privacy policy.
- **Was:** "idle accounts with no session activity for 24 months are deleted
  automatically". No such job runs. **Now:** kept until you ask.
- **vault privacy and terms, was:** "the Bitcoin address you sign in with … no
  email, no name"; the vault key "never leaves your control"; "we cannot see
  your vault key or any recovery material"; the export "works offline with
  vault-core"; a released browser extension; logs kept 90 days. **Now:** data
  is filed under the did:oc; the vault key is stored sealed under the
  passphrase and the recovery code, and stays after the cloud copy is
  deleted unless you ask; the encrypted backup (key plus entries) is the
  self-sufficient file, the plain export is not; the extension is marked
  unreleased.
- **me privacy, was:** "you sign up with a Bitcoin signature or an email/phone
  one-time code"; session records without device or IP; two cookies; logs
  kept 90 days. **Now:** no phone sign-in exists and an email is personal
  data; session records include IP and user-agent; four cookies; request logs
  as above.

## [0.7.0] — 2026-09-18

### Fixed — four passages still denied the custody that §custody admits

0.5.0 corrected the custody clause to say plainly that during bring-up
OrangeCheck holds the key that pays email-identity users. Four other passages in
the same document were left asserting the destination as the present, including
the one a regulator reads:

- "OrangeCheck does not hold your funds" (what this is) → now states that during
  bring-up OrangeCheck operates every role, custody included, and points at the
  custody section.
- "OrangeCheck does not itself custody, transmit, or take possession of user
  funds" (regulatory) → now states that the federations do not exist yet, that
  OrangeCheck itself custodies and transmits for email users during bring-up and
  why, and that BIP-322 users are unaffected. The pending counsel analysis now
  covers both the bring-up posture and the end state.
- "orangecheck holds no keys and no funds" (summary) → now splits by sign-in
  method, which is the only honest one-line answer.
- Both meta descriptions said "federation-custodied by default" → now
  "OrangeCheck-custodied during bring-up, federation custody and self-custody
  graduation as the destination".

This matters beyond accuracy: `me.ochk.io`'s rail-posture store refuses to arm a
bounded mainnet test until the Terms are marked corrected. With the document
contradicting itself, that gate could be satisfied over a live falsehood.

Custody is staged by design — OrangeCheck plays every role during bring-up to
prove the system works, and hands each one to independent operators as they
arrive. The documents now say that, in one voice.

## [0.5.0] — 2026-09-04

### Fixed — the me.ochk.io custody clause asserted three things that are not true

The clause read:

> me.ochk.io is **non-custodial with respect to OrangeCheck**: OrangeCheck holds
> no private keys and no federation key shares, and cannot move your funds. […]
> For email-OTP users, a Fedimint **federation** — run by independent guardian
> operators, never OrangeCheck — holds funds under a threshold scheme.

Three claims, all false as of today:

1. **"OrangeCheck holds no private keys."** OrangeCheck operates the paying
   rail's Lightning signing key.
2. **"cannot move your funds."** It can, and for an email user it is the only
   thing that can.
3. **"a federation … never OrangeCheck — holds funds."** There are no
   independent guardians. No federation holds anything.

This was not a future-tense problem awaiting a rail decision — it was already
wrong, describing the destination as though it were the present.

The clause now separates the two cases honestly. BIP-322 self-custody is real
today and says so without qualification. For email sign-in it states plainly
that OrangeCheck currently holds the key that pays you and is therefore a
custodian and the party that moves the money, that the federation is the design
rather than the state, and that graduation remains available.

It then points at **live, computed surfaces** — `/custody` and
`/api/federations` — for which posture is in force, what bounds it, and what has
settled. A legal document cannot fetch, so the durable pattern is for it to
describe the *mechanism* and name where the current state is published. Those
surfaces are derived from the system, so they cannot drift from this document
the way a fixed sentence did.

**This release is a prerequisite for the mainnet bounded test, enforced in
code.** `oc-me-web`'s `validateRailConfig` refuses to activate the
`bounded-test` posture unless `terms_corrected_at` is set — so the rail cannot
carry a real satoshi while this clause is uncorrected. That is deliberate: a
false custody claim while money moves is the most damaging failure available to
this product, and "we meant to update the Terms" is not a defence.

## [0.4.0] — 2026-09-03

### Fixed

- **OC Vault's Privacy Policy claimed something untrue about what OrangeCheck
  can see.** Under "what we cannot see" it listed *"How many items you store or
  how often you use them"*. Both halves are visible:

  - `countBlobs()` runs `select('envelope_id', { count: 'exact', head: true })`
    and `/api/blobs/[id]` refuses a write once that count reaches
    `MAX_BLOBS_PER_IDENTITY` (5,000). The exact item count is not merely
    visible, it is *load-bearing* — it enforces the published service limit.
  - `vault_blobs` holds one row per item with an `updated_at` column and an
    index on `(identity_address, updated_at desc)`, and `GET /api/blobs`
    returns `[{ envelope_id, updated_at }]`. That is per-item write cadence.

  The claim is removed from "cannot see" and the truth added to "what we
  collect" as a `per-item metadata` entry, which says what is visible, why
  (the count enforces the ceiling; the timestamp tells a second device what to
  re-sync), and what is still true — that no item's contents, name or type is
  visible. The strong claim survives; the overstated one does not.

  A privacy policy is the binding document, and this is the kind of clause a
  reader would rely on. `oc-vault-web/src/pages/security.tsx` carried the same
  sentence and is corrected in that repo.

## [0.3.0] — 2026-09-03

### Fixed — OC Vault terms and privacy stated commercial terms the product does not offer

`vault.ochk.io/terms` renders from this package. It published, as binding
terms:

- **A "vault Cloud Lifetime" tier at 210,000 sats one-time**, with its own
  `lifetime entitlements` section granting "cloud sync for the operational life
  of OC Vault". No such tier exists. It was retired by
  `oc-vault-web/db/migrations/0015_drop_lifetime_tier.sql`, `VaultTier` omits
  it, `SELLABLE_TIERS` is `['monthly','annual','family']`, and the product's own
  `/pricing` page carries a panel headed **"why no lifetime?"** arguing that a
  one-time lifetime price is "the promise that gets quietly broken later". The
  Terms sold one anyway — so a customer who paid and then read the Terms had a
  documented claim to a perpetual entitlement OC has engineered itself not to
  grant. Section removed; the export/continuity guarantee it also carried is
  kept, under `continuity & export`, where it does not depend on a paid tier.

- **An annual price of 21,000 sats/year.** The real annual tier is 70,000 sats
  for 365 days (`src/lib/billing/plans.ts`), and the monthly (7,000/30d) and
  family (200,000/365d) tiers were not mentioned at all. Prices are no longer
  restated here: the document now points at
  [vault.ochk.io/pricing](https://vault.ochk.io/pricing) as the authoritative
  price list, so it cannot drift out of agreement with it again. What the Terms
  DO now state is the structure, which is the part that belongs in terms: every
  paid tier is a prepaid period that expires and does not auto-renew, and no
  perpetual tier is sold.

- **Lightning as the payment rail**, in five places — the plans section, the
  section hint, the SEO description, the third-parties list and the
  data-collected list. `POST /api/checkout` hard-codes
  `paymentMethods: ['BTC-CHAIN']`, and Lightning is off family-wide. All five
  now say on-chain Bitcoin, and the third-parties entry no longer disclaims
  "the availability of the Lightning Network" for a network it does not use.

## [Unreleased]

- _(no pending changes)_

