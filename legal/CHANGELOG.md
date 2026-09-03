# Changelog

All notable changes to **`@orangecheck/legal`** will be documented in this file.

These documents are the published, binding terms for the products that render
them. A change here changes what a customer has agreed to, so every entry says
plainly what was claimed before and what is claimed now.

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

