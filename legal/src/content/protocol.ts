/**
 * @orangecheck/legal — `protocol` profile.
 *
 * The non-custodial family: the ochk.io umbrella, the six verb sites
 * (attest, lock, vote, stamp, agent, pledge), docs.ochk.io, and
 * analytics.ochk.io. Free, no money movement, no custody. This is a refresh
 * of the long-standing ochk.io documents — narrowed so it no longer purports
 * to govern the commercial products, which now carry their own Terms.
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

const COMMERCIAL_SCOPE_NOTE =
    'These Terms govern the **non-custodial** OrangeCheck family: [ochk.io](https://ochk.io), the verb sites — OC Attest, OC Lock, OC Vote, OC Stamp, OC Agent, OC Pledge — and [docs.ochk.io](https://docs.ochk.io). The commercial products **me.ochk.io**, **vault.ochk.io**, and **fleet.ochk.io** each publish their own Terms; these Terms do not govern your use of those products.';

const terms: DocSpec = {
    kind: 'terms',
    eyebrow: 'terms',
    title: 'Terms of service',
    description:
        'These Terms govern your access to and use of the OrangeCheck website, protocol reference sites, and documentation. By using OrangeCheck, you agree to be bound by these Terms.',
    metaTitle: 'Terms of Service — OrangeCheck',
    metaDescription:
        'The terms and conditions for using OrangeCheck. Non-custodial service provided as-is. You are responsible for your wallet and private keys.',
    effective: '2025-09-30',
    updated: '2026-05-15',
    preamble: [
        {
            kind: 'callout',
            emphatic: true,
            text: 'By accessing or using OrangeCheck, you agree to be bound by these Terms. If you do not agree, do not use the Service. These Terms contain a binding-arbitration, class-action, and jury-trial waiver, important limitations on liability, and specific acknowledgements about the public, permanent, and irrevocable nature of anything you publish.',
        },
        { kind: 'callout', text: COMMERCIAL_SCOPE_NOTE },
    ],
    sections: [
        {
            id: 'overview',
            heading: 'overview',
            hint: 'what orangecheck does / does not',
            blocks: [
                { kind: 'subhead', text: 'what orangecheck does' },
                {
                    kind: 'para',
                    text: 'OrangeCheck is a family of **non-custodial** protocols and reference tools that let you create cryptographic proof-of-stake artifacts using Bitcoin message signatures (BIP-322), bind self-asserted handles to them, optionally publish them to decentralized Nostr relays, and discover and verify artifacts created by others.',
                },
                { kind: 'subhead', text: 'what orangecheck does not' },
                {
                    kind: 'bullets',
                    items: [
                        'Take custody of your Bitcoin, private keys, or wallet credentials',
                        'Broadcast Bitcoin transactions on your behalf',
                        'Provide financial, investment, or legal advice',
                        'Guarantee the accuracy of blockchain data from third-party sources',
                    ],
                },
                { kind: 'subhead', text: 'non-custodial nature' },
                {
                    kind: 'para',
                    text: '**You are solely responsible for** your wallet, keys, device security, and what you sign. We cannot recover lost keys, reverse signatures, or access your funds.',
                },
            ],
        },
        {
            id: 'publication-risks',
            heading: 'publication risks · your acknowledgement',
            hint: 'public, permanent, irrevocable',
            blocks: [
                {
                    kind: 'callout',
                    emphatic: true,
                    text: 'AN ORANGECHECK ENVELOPE IS A SIGNED, PUBLIC ARTIFACT THAT PERMANENTLY LINKS A BITCOIN ADDRESS TO EVERY HANDLE YOU ASSERT. BY CREATING OR PUBLISHING ONE, YOU EXPRESSLY ACCEPT THE RISKS BELOW. WE ARE NOT RESPONSIBLE FOR THE CONSEQUENCES OF YOUR DECISION TO PUBLISH.',
                },
                { kind: 'subhead', text: 'specific risks you accept' },
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'deanonymization',
                            v: 'an envelope binds your address to your handles; chain analysis can then link your other addresses, counterparties, and spending patterns. you cannot un-bind once published.',
                        },
                        {
                            k: 'wealth advertisement',
                            v: 'public sat values combined with real-name handles may make you a target for phishing, theft, or coercion. we recommend pseudonymous handles and modest bonds. your personal safety is your responsibility.',
                        },
                        {
                            k: 'irrevocability',
                            v: 'envelopes published to Nostr relays are replicated across independent operators. OrangeCheck cannot delete, edit, or revoke Nostr events.',
                        },
                        {
                            k: 'handle spoofing',
                            v: 'identity bindings are self-asserted; any user can claim any string. relying parties must verify ownership out-of-band.',
                        },
                    ],
                },
            ],
        },
        eligibility,
        {
            id: 'account',
            heading: 'account & sign-in',
            hint: 'sign-in optional',
            blocks: [
                {
                    kind: 'para',
                    text: 'Most of the Service works without registration. An optional **Sign in with Bitcoin** flow opens a session keyed to a Bitcoin address you prove control of via BIP-322 — no password, no email. A session is a server-side row plus an `httpOnly + Secure + SameSite=Lax` cookie, revoked when you sign out or the cookie expires.',
                },
                {
                    kind: 'para',
                    text: 'If you use sign-in, you are responsible for the security of the device and wallet you sign with. Anyone with your keys can open a session in your name.',
                },
            ],
        },
        acceptableUse,
        intellectualProperty,
        {
            id: 'third-parties',
            heading: 'third parties',
            hint: 'blockchain · nostr · wallets · relying parties',
            blocks: [
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'blockchain data',
                            v: 'verification relies on third-party APIs (mempool.space, Esplora, or your own node). we do not guarantee accuracy or availability.',
                        },
                        {
                            k: 'nostr network',
                            v: 'decentralized relays operated by third parties. published data is replicated outside our control and may persist indefinitely.',
                        },
                        {
                            k: 'wallet software',
                            v: 'browser, mobile, desktop, and hardware wallets are third-party software we do not audit or endorse. a malicious wallet could sign something other than what is displayed.',
                        },
                        {
                            k: 'relying parties',
                            v: 'platforms, relays, and integrators independently decide whether to trust any OrangeCheck artifact. OrangeCheck is not a party to, and accepts no liability for, those decisions.',
                        },
                        {
                            k: 'api / sdk consumers',
                            v: 'calling a hosted endpoint or using an `@orangecheck/*` package is use of the Service and subject to these Terms; the packages are separately MIT-licensed.',
                        },
                    ],
                },
            ],
        },
        {
            id: 'fees',
            heading: 'fees',
            hint: 'free',
            blocks: [
                {
                    kind: 'para',
                    text: 'The protocol sites and documentation are free to use. You are responsible for Bitcoin network fees on any transactions you initiate and for your own ISP and wallet-provider costs. Paid functionality, if introduced, will be announced with advance notice; the commercial products **me.ochk.io**, **vault.ochk.io**, and **fleet.ochk.io** carry their own pricing and Terms.',
                },
            ],
        },
        {
            id: 'disclaimers',
            heading: 'disclaimers & warranties',
            hint: 'as-is · no warranty of any kind',
            blocks: [
                {
                    kind: 'callout',
                    emphatic: true,
                    text: 'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITH ALL FAULTS AND WITHOUT WARRANTY OF ANY KIND. TO THE MAXIMUM EXTENT PERMITTED BY LAW, ORANGECHECK DISCLAIMS ALL WARRANTIES, EXPRESS, IMPLIED, AND STATUTORY — INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, AND ACCURACY.',
                },
                { kind: 'subhead', text: 'not financial, legal, or compliance advice' },
                {
                    kind: 'para',
                    text: 'Nothing OrangeCheck provides — artifacts, metrics, scores, identity bindings, or other output — is financial, investment, legal, tax, KYC, AML, sanctions, or regulatory-compliance advice. Obtain independent professional advice before relying on the Service for any decision.',
                },
                { kind: 'subhead', text: 'regulatory status · not a money services business' },
                {
                    kind: 'para',
                    text: 'The protocol sites do not transmit, transfer, exchange, convert, issue, redeem, or custody any virtual currency, fiat currency, security, or other asset. They sign and verify cryptographic messages; they do not move value. Accordingly, with respect to the protocol sites, OrangeCheck does not hold itself out as a Money Services Business or money transmitter under the U.S. Bank Secrecy Act, a Virtual Asset Service Provider under the FATF Recommendations, a Crypto-Asset Service Provider under the EU MiCA Regulation, a broker-dealer, a payment or e-money institution, a bank, or a regulated identity provider.',
                },
                { kind: 'subhead', text: 'use at your own risk' },
                {
                    kind: 'para',
                    text: 'YOU ASSUME ALL RISK from your use of the Service. Verify anything load-bearing independently. Features labelled "beta", "experimental", or "preview" carry even fewer guarantees and may change or be removed at any time.',
                },
            ],
        },
        limitationOfLiability,
        indemnification,
        {
            id: 'termination',
            heading: 'termination',
            blocks: [
                {
                    kind: 'para',
                    text: '**Your right:** stop using the Service at any time. **Our right:** suspend or terminate access with or without cause or notice. On termination, your right to use the Service ceases; artifacts you created may remain publicly accessible and data published to Nostr cannot be deleted by OrangeCheck. The intellectual-property, disclaimer, liability, indemnification, governing-law, and dispute provisions survive.',
                },
            ],
        },
        changesToTerms,
        disputeResolution,
        miscellaneous,
    ],
    summary:
        'summary: non-custodial service provided as-is. you are responsible for your wallet and private keys. disputes resolved via binding arbitration. commercial products have their own terms.',
};

const privacy: DocSpec = {
    kind: 'privacy',
    eyebrow: 'privacy',
    title: 'Privacy policy',
    description:
        'How OrangeCheck handles data and privacy across the non-custodial protocol family. Non-custodial by design, minimal collection, no account required.',
    metaTitle: 'Privacy Policy — OrangeCheck',
    metaDescription:
        'How OrangeCheck handles data and privacy. Non-custodial by design, minimal data collection, no account required, privacy-preserving analytics only.',
    effective: '2025-09-30',
    updated: '2026-05-15',
    preamble: [
        {
            kind: 'callout',
            text: 'This policy covers the **non-custodial** OrangeCheck family — [ochk.io](https://ochk.io), the six verb sites, and [docs.ochk.io](https://docs.ochk.io). The commercial products me.ochk.io, vault.ochk.io, and fleet.ochk.io publish their own privacy policies covering the additional data their products handle.',
        },
    ],
    sections: [
        {
            id: 'principles',
            heading: 'our principles',
            hint: 'non-custodial, minimal, transparent',
            blocks: [
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'non-custodial',
                            v: 'we never take custody of your Bitcoin or keys; cryptographic operations happen in your wallet or browser',
                        },
                        {
                            k: 'minimal collection',
                            v: 'only what is necessary to provide the Service; no user profiles, no cross-web tracking',
                        },
                        {
                            k: 'optional account',
                            v: 'most of the Service needs no sign-in; the optional Sign in with Bitcoin flow is keyed to a public address — no email, no password',
                        },
                        {
                            k: 'transparency',
                            v: 'plain-language policy; ask us anything at [[PRIVACY_CONTACT]]',
                        },
                    ],
                },
            ],
        },
        {
            id: 'what-we-dont-do',
            heading: "what we don't do",
            blocks: [
                {
                    kind: 'bullets',
                    items: [
                        'No custody of funds and no access to private keys',
                        'No account required for the core service',
                        'No selling or renting of personal information, ever',
                        'No targeted advertising and no cross-site tracking',
                        'No third-party analytics trackers — privacy-preserving analytics only',
                    ],
                },
            ],
        },
        {
            id: 'information-we-collect',
            heading: 'information we collect',
            hint: 'scoped, minimal',
            blocks: [
                { kind: 'subhead', text: 'information you provide' },
                {
                    kind: 'para',
                    text: '**Bitcoin addresses and signatures** are processed client-side to generate a cryptographic proof; this data is public by design. **Identity bindings** you add are included in the signed message and are public. **Contact information** is collected only if you email us for support, solely to respond. **Sign-in sessions** store a minimal account row keyed by your verified Bitcoin address plus session rows with a random id, source IP, a user-agent hash, and timestamps — no password, no email.',
                },
                { kind: 'subhead', text: 'automatically collected' },
                {
                    kind: 'bullets',
                    items: [
                        { k: 'ip address', v: 'security, rate limiting, service delivery' },
                        { k: 'browser/device', v: 'compatibility and UX optimization' },
                        { k: 'pages visited', v: 'aggregate, to improve the Service' },
                    ],
                },
                { kind: 'subhead', text: 'cookies & analytics' },
                {
                    kind: 'para',
                    text: 'Essential cookies are required for the Service to function; a preference cookie stores your theme. We use [Plausible Analytics](https://plausible.io/privacy) — cookie-free, no personal data, aggregate statistics only. No advertising or tracking cookies.',
                },
            ],
        },
        {
            id: 'how-we-use',
            heading: 'how we use information',
            blocks: [
                {
                    kind: 'bullets',
                    items: [
                        'Generate and verify cryptographic proofs and serve verification pages',
                        'Detect and prevent abuse, spam, and denial-of-service attacks',
                        'Fix bugs, optimize performance, and improve the Service',
                        'Provide technical support',
                    ],
                },
            ],
        },
        {
            id: 'retention',
            heading: 'data retention',
            hint: '90d logs · permanent public artifacts',
            blocks: [
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'public artifacts',
                            v: 'permanent and publicly shareable; data published to Nostr cannot be deleted by OrangeCheck',
                        },
                        {
                            k: 'technical logs',
                            v: 'server logs retained 90 days for security and debugging, then auto-deleted',
                        },
                        {
                            k: 'session rows',
                            v: 'live up to 30 days (cookie max-age) or until revoked; idle accounts with no session activity for 24 months are deleted automatically',
                        },
                        {
                            k: 'support emails',
                            v: 'retained as long as necessary; deleted on request',
                        },
                    ],
                },
            ],
        },
        {
            id: 'data-security',
            heading: 'data security',
            hint: 'reasonable safeguards · no warranty',
            blocks: [
                {
                    kind: 'bullets',
                    items: [
                        'HTTPS encryption for all data in transit',
                        'Secure hosting with regular security updates',
                        'Rate limiting and abuse monitoring',
                    ],
                },
                {
                    kind: 'para',
                    text: 'No method of transmission or storage is 100% secure. We use reasonable measures but **do not warrant the security of your data and are not liable for unauthorized access, loss, or theft** — see the [Terms of Service](/terms). If we become aware of a breach of personal data we hold, we will notify affected users and any competent supervisory authority as required by applicable law, including the 72-hour window under Article 33 of the UK & EU GDPR.',
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
        'summary: minimal data, privacy-preserving analytics, never custody of funds, user control of information.',
};

export const protocolProfile = { terms, privacy };
