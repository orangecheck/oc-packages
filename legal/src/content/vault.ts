/**
 * @orangecheck/legal — `vault` profile.
 *
 * vault.ochk.io: an end-to-end-encrypted secrets vault sold as paid SaaS.
 * Client-side AES-256-GCM; OrangeCheck stores opaque ciphertext only and
 * cannot read vault contents. Payment is inbound-only Lightning — no fund
 * custody — so the stubs cover pricing, refunds, and lifetime-entitlement
 * durability rather than money movement.
 */

import type { DocSpec } from '../types';
import {
    acceptableUse,
    changesToTerms,
    disputeResolution,
    eligibility,
    indemnification,
    intellectualProperty,
    limitationOfLiability,
    miscellaneous,
    privacyChanges,
    privacyChildren,
    privacyRegional,
    privacyRights,
    privacyTransfers,
} from './clauses';

const COMMERCIAL_NOTE =
    '**OC Vault is a commercial product operated by OrangeCheck**, available at vault.ochk.io. It is distinct from the non-custodial OrangeCheck protocol sites; the Terms at [ochk.io/terms](https://ochk.io/terms) do not govern OC Vault. These Terms do.';

const terms: DocSpec = {
    kind: 'terms',
    eyebrow: 'terms',
    title: 'Terms of service',
    description:
        'The terms governing your use of OC Vault — an end-to-end-encrypted secrets vault. Client-side encryption; OrangeCheck stores ciphertext only and cannot read your data.',
    metaTitle: 'Terms of Service — OC Vault',
    metaDescription:
        'Terms of service for OC Vault (vault.ochk.io): an end-to-end-encrypted secrets vault. Client-side encryption, Lightning payment, no fund custody.',
    effective: '2026-05-15',
    updated: '2026-05-15',
    preamble: [
        {
            kind: 'callout',
            emphatic: true,
            text: 'By accessing or using OC Vault, you agree to be bound by these Terms. If you do not agree, do not use the Service. These Terms contain a binding-arbitration, class-action, and jury-trial waiver and important limitations on liability.',
        },
        { kind: 'callout', text: COMMERCIAL_NOTE },
    ],
    sections: [
        {
            id: 'overview',
            heading: 'overview',
            hint: 'what oc vault is',
            blocks: [
                {
                    kind: 'para',
                    text: 'OC Vault stores passwords, one-time-password seeds, API keys, notes, and small files. Every item is **encrypted client-side** in your browser under a vault key that never leaves your control. When you sync to the cloud, OrangeCheck stores an opaque encrypted blob — **OrangeCheck cannot read your vault contents, item names, or item types.**',
                },
                {
                    kind: 'para',
                    text: 'OC Vault is built on the OC Lock protocol. It is **not** a custodial service for funds and does not take possession of any cryptocurrency.',
                },
            ],
        },
        {
            id: 'accounts',
            heading: 'accounts',
            blocks: [
                {
                    kind: 'para',
                    text: 'Your identity is a Bitcoin address you prove control of via BIP-322. No email or password is required. You are responsible for the security of the wallet you sign with and of the vault key that encrypts your data.',
                },
            ],
        },
        {
            id: 'plans-billing',
            heading: 'plans, payment & billing',
            hint: 'lightning · inbound only',
            blocks: [
                {
                    kind: 'para',
                    text: 'OC Vault offers a free tier and paid tiers purchased with Bitcoin over the Lightning Network. OrangeCheck **receives** payment and never sends funds to users; OC Vault holds no custodial balance for you. Cloud sync is granted by the **vault Cloud Annual** (21,000 sats / year) and **vault Cloud Lifetime** (210,000 sats one-time) tiers. All paid tiers are subject to the **service limits** below.',
                },
                {
                    kind: 'stub',
                    text: 'The full commercial terms for paid tiers — billing cycle and renewal behavior, the refund and cancellation policy, proration, and the consequences of non-renewal for stored data — are being finalized for publication. This section will be completed following review by counsel.',
                },
            ],
        },
        {
            id: 'service-limits',
            heading: 'service limits',
            hint: 'storage · per-entry size · bandwidth',
            blocks: [
                {
                    kind: 'para',
                    text: 'Every tier — including the one-time **Lifetime** tier — is subject to the following service limits. They are deliberately set well above the needs of a personal password vault but bound the storage and bandwidth a single account may consume on the shared infrastructure. The limits are **enforced in code**; exceeding them returns an HTTP 507 (storage) or 429 (rate) response.',
                },
                { kind: 'subhead', text: 'storage' },
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'entries per personal vault',
                            v: 'up to **5,000** entries (envelope ids). A brand-new entry counts against this ceiling; replacing an existing entry does not.',
                        },
                        {
                            k: 'entries per team vault',
                            v: 'up to **5,000** entries, shared across team members.',
                        },
                        {
                            k: 'per-entry size',
                            v: 'each entry\'s ciphertext is capped at **1.25 MB** (≈ 1 MB of plaintext payload — sufficient for any password, TOTP seed, API key, note, or small file).',
                        },
                        {
                            k: 'total ciphertext per personal vault',
                            v: 'up to **≈ 1 GiB** (1,073,741,824 bytes) of ciphertext per identity. Typical real-world vaults are well under 50 MB.',
                        },
                        {
                            k: 'total ciphertext per team vault',
                            v: 'up to **≈ 2 GiB** of ciphertext per team.',
                        },
                    ],
                },
                { kind: 'subhead', text: 'bandwidth & request rate' },
                {
                    kind: 'para',
                    text: 'The API is rate-limited per IP address as a fair-use measure. Current ceilings: up to **1,000 blob reads / writes per minute**, **120 manifest listings per minute**, and **30 escrow-key writes per minute**. Exceeding a limit returns HTTP 429; legitimate clients retry with backoff. There is no per-month bandwidth cap; the delta-sync protocol makes a steady-state sync fetch only the change manifest, so day-to-day bandwidth use is negligible.',
                },
                { kind: 'subhead', text: 'adjustments' },
                {
                    kind: 'para',
                    text: 'OrangeCheck may adjust these limits with reasonable advance notice — for example, to defend the service against abuse, to keep pace with infrastructure costs, or to lift a ceiling that is constraining legitimate use. We will not lower a limit below a number that would reduce **existing** data already stored under a paid tier without offering an export and a reasonable migration window.',
                },
            ],
        },
        {
            id: 'lifetime',
            heading: 'lifetime entitlements',
            blocks: [
                {
                    kind: 'para',
                    text: 'The one-time **Lifetime** tier grants cloud sync for the operational life of OC Vault, subject to the service limits above. The portable export feature is always free and works offline with [`@orangecheck/vault-core`](https://www.npmjs.com/package/@orangecheck/vault-core) — even if OC Vault is discontinued, you retain a self-decryptable copy of your data.',
                },
                {
                    kind: 'stub',
                    text: 'The precise legal meaning of "lifetime" — including treatment on a change of ownership, the wind-down notice period, and the export / continuity commitments OrangeCheck offers if the Service is discontinued — is being finalized for publication. This section will be completed following review by counsel.',
                },
            ],
        },
        {
            id: 'your-data',
            heading: 'your data & encryption',
            hint: 'you hold the only key',
            blocks: [
                {
                    kind: 'callout',
                    emphatic: true,
                    text: 'ORANGECHECK CANNOT READ, RECOVER, OR RESET YOUR VAULT. IF YOU LOSE YOUR VAULT KEY AND ALL RECOVERY FACTORS, YOUR ENCRYPTED DATA IS PERMANENTLY UNRECOVERABLE — BY YOU AND BY US. THIS IS THE INTENDED SECURITY PROPERTY, NOT A DEFECT.',
                },
                {
                    kind: 'para',
                    text: 'You are solely responsible for safeguarding your vault key and any recovery material, for the lawfulness of what you store, and for maintaining your own independent backups of anything critical.',
                },
            ],
        },
        acceptableUse,
        intellectualProperty,
        {
            id: 'third-parties',
            heading: 'third parties',
            blocks: [
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'payment processing',
                            v: 'Lightning payments are processed via a self-hosted BTCPay Server; we do not guarantee the availability of the Lightning Network',
                        },
                        {
                            k: 'storage / hosting',
                            v: 'encrypted blobs are stored with third-party infrastructure providers; they receive ciphertext only',
                        },
                    ],
                },
            ],
        },
        {
            id: 'disclaimers',
            heading: 'disclaimers & warranties',
            hint: 'as-is · no warranty',
            blocks: [
                {
                    kind: 'callout',
                    emphatic: true,
                    text: 'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITH ALL FAULTS AND WITHOUT WARRANTY OF ANY KIND. TO THE MAXIMUM EXTENT PERMITTED BY LAW, ORANGECHECK DISCLAIMS ALL WARRANTIES, EXPRESS, IMPLIED, AND STATUTORY — INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND ACCURACY — AND DOES NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED OR THAT STORED DATA WILL BE FREE FROM LOSS.',
                },
                {
                    kind: 'para',
                    text: 'Maintain your own backups of anything critical. The encryption design that prevents OrangeCheck from reading your data also prevents OrangeCheck from recovering it.',
                },
            ],
        },
        limitationOfLiability,
        indemnification,
        eligibility,
        changesToTerms,
        disputeResolution,
        miscellaneous,
    ],
    summary:
        'summary: end-to-end encrypted; orangecheck stores ciphertext only and cannot recover your vault. pricing, refund, and lifetime-entitlement terms are being finalized — see the marked sections.',
};

const privacy: DocSpec = {
    kind: 'privacy',
    eyebrow: 'privacy',
    title: 'Privacy policy',
    description:
        'How OC Vault handles data. End-to-end encrypted by design — OrangeCheck stores opaque ciphertext and cannot read your vault, item names, or item types.',
    metaTitle: 'Privacy Policy — OC Vault',
    metaDescription:
        'OC Vault privacy policy. End-to-end encrypted; OrangeCheck stores ciphertext only and cannot read your vault contents.',
    effective: '2026-05-15',
    updated: '2026-05-15',
    sections: [
        {
            id: 'principles',
            heading: 'our principles',
            hint: 'zero-knowledge by design',
            blocks: [
                {
                    kind: 'para',
                    text: 'OC Vault is designed so that OrangeCheck cannot read your data. Encryption and decryption happen in your browser. What OrangeCheck stores is an opaque, double-encrypted blob with no readable item names, types, or contents.',
                },
            ],
        },
        {
            id: 'what-we-collect',
            heading: 'information we collect',
            blocks: [
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'identity address',
                            v: 'the Bitcoin address you sign in with — public on-chain already; no email, no name',
                        },
                        {
                            k: 'payment records',
                            v: 'for paid tiers: the Lightning invoice id, sats paid, tier, and entitlement expiry. No card number, no billing address',
                        },
                        {
                            k: 'encrypted blobs',
                            v: 'opaque ciphertext keyed to your identity address — OrangeCheck cannot decrypt it',
                        },
                        {
                            k: 'access tokens',
                            v: 'for developer / CLI / CI access: an SHA-256 hash of each token, an optional label, the granted scope (read or read-write), creation / last-used / optional expiry timestamps. We never store the token itself — only its hash.',
                        },
                        {
                            k: 'technical data',
                            v: 'IP address and request metadata, for security and rate limiting',
                        },
                    ],
                },
            ],
        },
        {
            id: 'what-we-cannot-see',
            heading: 'what we cannot see',
            blocks: [
                {
                    kind: 'bullets',
                    items: [
                        'The contents of any vault item',
                        'The names, titles, or types of your items',
                        'How many items you store or how often you use them',
                        'Your vault key or any recovery material',
                        'Your access tokens (only the SHA-256 hash is stored)',
                        'Which sites the browser extension autofilled on — origin matching happens locally in your browser',
                    ],
                },
            ],
        },
        {
            id: 'surfaces',
            heading: 'vault surfaces (web, extension, CLI, SDK)',
            hint: 'same vault, same zero-knowledge guarantee',
            blocks: [
                {
                    kind: 'para',
                    text: 'The same encrypted vault is reachable from three surfaces. The zero-knowledge guarantee — that OrangeCheck only ever holds ciphertext — applies to all of them.',
                },
                { kind: 'subhead', text: 'browser extension (OC Vault for Chromium / Firefox)' },
                {
                    kind: 'para',
                    text: 'The extension fetches the same encrypted blobs the web app does, caches them **as ciphertext** in browser-extension storage, and decrypts in the service worker only after you enter your passphrase. The vault key lives in memory and a RAM-only `storage.session` slot — it is never written to disk. The content script that offers autofill receives **one entry\'s field values at fill time** and nothing else; it never receives the vault key or the entry index. The extension talks only to your own `vault.ochk.io` account: no analytics, no telemetry, no remote code.',
                },
                { kind: 'subhead', text: 'developer platform — access tokens, CLI, SDK, GitHub Action' },
                {
                    kind: 'para',
                    text: 'For headless access (`oc-vault` CLI, the `@orangecheck/vault-core` SDK, CI / GitHub Actions), you may mint **access tokens** at [vault.ochk.io/vault/developer](https://vault.ochk.io/vault/developer). A token authorizes **transport only** — it lets the caller fetch your encrypted blobs and the passphrase-wrapped escrow, and (for tokens minted with a write scope) write new ciphertext. **A token carries no key material:** a leaked token yields only ciphertext, the same thing the server already holds. The passphrase still performs decryption in your local process and is never transmitted. We store only the SHA-256 hash of each token; tokens can be revoked at any time from the same page.',
                },
            ],
        },
        {
            id: 'cookies',
            heading: 'cookies & analytics',
            blocks: [
                {
                    kind: 'para',
                    text: 'Essential cookies only, plus a theme preference. Page analytics use [Plausible](https://plausible.io/privacy) — cookie-free, no PII, aggregate only. No advertising or tracking cookies.',
                },
            ],
        },
        {
            id: 'retention',
            heading: 'data retention',
            blocks: [
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'encrypted blobs',
                            v: 'retained while your account is active; deleted on account deletion',
                        },
                        {
                            k: 'payment records',
                            v: 'retained as required for accounting and entitlement verification',
                        },
                        {
                            k: 'technical logs',
                            v: 'retained 90 days, then auto-deleted',
                        },
                    ],
                },
            ],
        },
        {
            id: 'data-security',
            heading: 'data security',
            blocks: [
                {
                    kind: 'para',
                    text: 'Client-side AES-256-GCM encryption, HTTPS in transit, and a server that only ever holds ciphertext. No method of storage is perfectly secure — we use reasonable measures but do not warrant security; see the [Terms of Service](/terms). Because of the encryption design, a compromise of OrangeCheck infrastructure exposes ciphertext, not your secrets.',
                },
            ],
        },
        privacyRights,
        privacyTransfers,
        privacyRegional,
        privacyChildren,
        privacyChanges,
    ],
    summary:
        'summary: end-to-end encrypted; orangecheck stores ciphertext only and cannot read your vault contents.',
};

export const vaultProfile = { terms, privacy };
