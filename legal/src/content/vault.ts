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
                    text: 'OC Vault offers a free tier and paid tiers purchased with Bitcoin over the Lightning Network. OrangeCheck **receives** payment and never sends funds to users; OC Vault holds no custodial balance for you.',
                },
                {
                    kind: 'stub',
                    text: 'The full commercial terms for paid tiers — current pricing, what each tier includes, billing cycle and renewal behavior, the refund and cancellation policy, proration, and the consequences of non-renewal for stored data — are being finalized for publication. Current pricing is shown on /pricing. This section will be completed following review by counsel.',
                },
            ],
        },
        {
            id: 'lifetime',
            heading: 'lifetime entitlements',
            blocks: [
                {
                    kind: 'stub',
                    text: 'OC Vault offers a one-time "lifetime" tier. The precise meaning of "lifetime" — the entitlement’s duration and scope, what happens to it on a change of ownership or discontinuation of the Service, and OrangeCheck’s commitments for data export and continuity if the Service winds down — is being finalized for publication. This section will be completed following review by counsel.',
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
                    ],
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
