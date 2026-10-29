/**
 * @orangecheck/legal — `protocol` profile.
 *
 * The non-custodial family: the ochk.io umbrella, the six verb sites
 * (attest, lock, vote, stamp, agent, pledge), the docs at ochk.io/docs, and
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
    'These Terms govern the **non-custodial** OrangeCheck family: [ochk.io](https://ochk.io), including its documentation at [ochk.io/docs](https://ochk.io/docs); the verb sites — OC Attest, OC Lock, OC Vote, OC Stamp, OC Agent, OC Pledge; and [chat.ochk.io](https://chat.ochk.io), [cosign.ochk.io](https://cosign.ochk.io), [btc.ochk.io](https://btc.ochk.io) and [globe.ochk.io](https://globe.ochk.io). The commercial products **ochk.app** and **vault.ochk.io** each publish their own Terms; these Terms do not govern your use of those products.';

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
    updated: '2026-10-29',
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
                {
                    kind: 'para',
                    text: 'OrangeCheck also runs **chat.ochk.io**, an end-to-end-encrypted messenger; **cosign.ochk.io**, where builders post projects and others join or back them, with any payment going directly from one person to another; **btc.ochk.io**, a read-only Bitcoin market desk; and **globe.ochk.io**, a read-only view of the Bitcoin network.',
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
                    text: 'Most of the Service works without registration. Optional sign-in proves one of: a Bitcoin address (a BIP-322 signature), an email inbox (a one-time code), or a Google or GitHub account. No password is ever created. A session is a server-side row plus an `HttpOnly; Secure; SameSite=None` cookie on `.ochk.io`, revoked when you sign out or the cookie expires.',
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
                            k: 'opentimestamps calendars',
                            v: "when you claim an OC Chat @handle, your browser sends the claim's fingerprint (a SHA-256 hash) to the OpenTimestamps calendars at alice.btc.calendar.opentimestamps.org, bob.btc.calendar.opentimestamps.org and finney.calendar.eternitywall.com, and reads your address's coins and block headers from mempool.space; each of these sees your IP address and when you asked.",
                        },
                        {
                            k: 'payments between people',
                            v: "postage on chat.ochk.io, and backing, zaps and bounties on cosign.ochk.io, are Lightning payments you make directly to the other person's wallet. OrangeCheck never holds them, cannot reverse them, and is not a party to them.",
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
                    text: 'The protocol sites, the documentation, cosign.ochk.io, btc.ochk.io and globe.ochk.io are free to use, and so is chat.ochk.io. chat.ochk.io also lists an optional paid plan, Personal: when its checkout is open, you pay the price shown before you pay, in advance, for a fixed period, and it does not renew on its own. You are responsible for Bitcoin network fees on any transactions you initiate and for your own ISP and wallet-provider costs. Other paid functionality, if introduced, will be announced with advance notice; the commercial products **ochk.app** and **vault.ochk.io** carry their own pricing and Terms.',
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
                    text: "Nothing OrangeCheck provides — artifacts, metrics, scores, identity bindings, btc.ochk.io's market data, charts and written market commentary (some of it written by an AI model), or other output — is financial, investment, legal, tax, KYC, AML, sanctions, or regulatory-compliance advice. Obtain independent professional advice before relying on the Service for any decision.",
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
    updated: '2026-10-29',
    preamble: [
        {
            kind: 'callout',
            text: 'This policy covers the **non-custodial** OrangeCheck family — [ochk.io](https://ochk.io), including its documentation at [ochk.io/docs](https://ochk.io/docs), the six verb sites, and [chat.ochk.io](https://chat.ochk.io), [cosign.ochk.io](https://cosign.ochk.io), [btc.ochk.io](https://btc.ochk.io) and [globe.ochk.io](https://globe.ochk.io). The commercial products ochk.app and vault.ochk.io publish their own privacy policies covering the additional data their products handle.',
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
                            v: 'most of the Service needs no sign-in; optional sign-in uses a Bitcoin signature, an email code, or Google/GitHub — never a password',
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
                    text: '**Bitcoin addresses and signatures** are processed client-side to generate a cryptographic proof; this data is public by design. **Identity bindings** you add are included in the signed message and are public. **Messages you send us** — through the contact form or by email — reach our inbox through our email provider (Resend) and are kept only as long as we need them to reply.',
                },
                { kind: 'subhead', text: 'if you sign in' },
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'account',
                            v: 'an opaque `did:oc` identifier, an optional display name and Nostr npub, and when the account was created and last signed in',
                        },
                        {
                            k: 'how you sign in',
                            v: 'a Bitcoin address you prove with a signature (stored as is — it is public on-chain anyway); or, for an email code, Google or GitHub, the verified email address — encrypted at rest, plus a one-way hash of it so we can find your account. For Google or GitHub we also store that provider\'s id for your account, unencrypted, so a changed email still reaches the same account',
                        },
                        {
                            k: 'passkeys',
                            v: 'for each passkey you register: its public key, a label, the transports it reported, and when it was added and last used',
                        },
                        {
                            k: 'each session',
                            v: 'a hash of the session token, the full user-agent string of the device that opened it, and timestamps',
                        },
                        {
                            k: 'sign-in log',
                            v: 'each sign-in and each identity you link or remove, with the IP address and user-agent at the time — kept for security; the IP address is cleared after 90 days',
                        },
                        {
                            k: 'accounts in one browser',
                            v: 'sessions opened in the same browser share a roster id, so we can tell which of your accounts were signed in from it; and which of our sites you first signed up through',
                        },
                        {
                            k: 'a coin backing your account',
                            v: "if you back your account with a coin: its address, outpoint and amount, the backing message you signed, and when we last found it unspent, or saw it released or spent. We read the coin from mempool.space. Earlier backings stay with your account. Sites you sign in to get only amount and age floors and a number that differs from site to site (all *.ochk.io sites share one), never the coin",
                        },
                        {
                            k: 'OC Chat devices',
                            v: "for each chat.ochk.io device we vouch for: its device and Nostr public keys, when we vouched, and the sign-in that asked; for a device you revoke, the signed revocation, which we also publish to Nostr relays",
                        },
                        {
                            k: 'btc.ochk.io alerts',
                            v: 'the market thresholds you save on btc.ochk.io (up to 25), stored with your account',
                        },
                        {
                            k: 'when you first sign in',
                            v: 'OrangeCheck’s operators get an email, sent through our email provider (Resend), naming your `did:oc` and the identity you signed in with: your Bitcoin address or your email address',
                        },
                        { k: 'never', v: 'a password, a private key, or a seed phrase' },
                    ],
                },
                { kind: 'subhead', text: 'who at OrangeCheck can see it' },
                {
                    kind: 'para',
                    text: "OrangeCheck's operators can see your account, including your email address decrypted, in an owner-only console: its account list shows each account's email, and looking up one account asks for a written reason. A lookup's record has its details about you cleared after 90 days; the reason stays.",
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
                { kind: 'subhead', text: 'sent from your browser to others' },
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'an OC Chat @handle claim',
                            v: "your browser sends the claim's fingerprint (a SHA-256 hash) to the OpenTimestamps calendars at alice.btc.calendar.opentimestamps.org, bob.btc.calendar.opentimestamps.org and finney.calendar.eternitywall.com, and reads your address's coins and block headers from mempool.space; each of these sees your IP address and when you asked. We send them nothing about you ourselves.",
                        },
                        {
                            k: 'relay.ochk.io',
                            v: "the Nostr relay we run (strfry on Fly.io, in Frankfurt). Your browser connects to it to read and publish signed records; our sites also publish the same records to public relays run by others (see the Terms). It keeps each record it accepts until the same key replaces it with a newer version or the record's own expiry passes: records are public, copied each day to a public archive on GitHub (where earlier versions stay), and otherwise deleted only after a lawful takedown request, which does not remove the copies elsewhere. Each record is stored with a pseudonym of the IP address it came from, made with a key that is kept only in memory and replaced each UTC day, so the relay can limit how much one source writes; your IP address itself is never stored, and the pseudonym is never served or archived. Our hosting provider (Fly.io) carries each connection to it and handles your IP address to do so, for its own short retention window; we keep no separate copy. Our host's connection logs for the relay can hold your IP address and connection times; they are kept for 7 days.",
                        },
                    ],
                },
                { kind: 'subhead', text: 'cookies & analytics' },
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'oc_session',
                            v: 'your sign-in, set by ochk.io for every `*.ochk.io` site: HttpOnly; Secure; SameSite=None; Domain=.ochk.io; 30 days',
                        },
                        {
                            k: 'oc_oauth_state',
                            v: 'only during a Google or GitHub sign-in: HttpOnly; SameSite=Lax; 10 minutes; deleted when the sign-in completes',
                        },
                        {
                            k: 'oc_theme · oc_skin · oc_motion',
                            v: 'your light/dark, appearance and reduced-motion choices (Domain=.ochk.io); not used to identify you',
                        },
                    ],
                },
                {
                    kind: 'para',
                    text: 'A browser tab may also keep its own copy of a sign-in token in session storage, cleared when the tab closes. We use [Plausible Analytics](https://plausible.io/privacy) — cookie-free, no personal data, aggregate statistics only — alongside our own first-party, cookieless analytics (oc insights): no cookies, no cross-site identity, your IP address is hashed and immediately discarded (never stored), and Do-Not-Track / Global Privacy Control signals are honored. No advertising or tracking cookies.',
                },
            ],
        },
        {
            id: 'chat-cosign-btc-globe',
            heading: 'chat, cosign, btc and globe',
            hint: 'what each of these sites keeps',
            blocks: [
                { kind: 'subhead', text: 'chat.ochk.io' },
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'messages',
                            v: 'end-to-end encrypted. Our server holds a message only as ciphertext, under a per-conversation id that names neither person, until the recipient picks it up: for up to 14 days, or 365 days on the Personal plan. A delivered message is deleted 24 hours after the recipient confirms it. We cannot read message content',
                        },
                        {
                            k: 'on your device',
                            v: 'your messages, contacts and settings are kept in your browser. Lock this device with a passphrase to encrypt your device key and messages there',
                        },
                        {
                            k: 'sending limits',
                            v: 'a count of messages sent per hour, under a keyed id made from your account, dropped after a day. chat.ochk.io stores no IP address',
                        },
                        {
                            k: 'the Personal plan',
                            v: 'if you buy it: your account id, the plan, when you paid and until when, the amount and the invoice id. The invoice our payment processor (BTCPay) holds says what was sold, not who bought it',
                        },
                        {
                            k: 'published to Nostr',
                            v: 'your device records, public channel posts (which are not encrypted), and a directory listing if you choose to be listed are public and stay on the relays. Direct messages travel encrypted',
                        },
                        {
                            k: 'sent from your browser',
                            v: 'chain data from mempool.space and blockstream.info, the drand network for messages that open at a future block, the OpenTimestamps calendars named above for a handle claim, and the Nostr relays you use; each sees your IP address',
                        },
                        {
                            k: 'analytics',
                            v: 'none',
                        },
                        {
                            k: 'deletion',
                            v: 'deleting your account deletes chat.ochk.io\'s other records of you; Personal plan payment records stay for accounting under a keyed id, not your account id. Messages waiting for pickup expire on their own, and what is on Nostr relays stays',
                        },
                    ],
                },
                { kind: 'subhead', text: 'cosign.ochk.io' },
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'what you post',
                            v: 'your profile, projects, updates, cosigns and vouches are public on cosign.ochk.io',
                        },
                        {
                            k: 'messages',
                            v: "**not end-to-end encrypted.** They are stored on our servers, and OrangeCheck's operators can read them",
                        },
                        {
                            k: 'reports and notifications',
                            v: 'a report you file keeps you as its reporter, the subject and your reason. Notifications are shown in the app only; a read one is deleted after 30 days and any after 90',
                        },
                        {
                            k: 'payments between people',
                            v: 'we record each Lightning payment for display (amount, time, status and the receiving Lightning address); the money goes directly between people and cosign never holds it',
                        },
                        {
                            k: 'abuse limits',
                            v: 'counts of writes per account, per IP address and per network, under keyed ids, dropped after 2 days. No IP address is stored',
                        },
                        {
                            k: 'deletion',
                            v: 'deleting your account deletes your profile, projects and the rest, except that your messages in conversations with other people, the reports you filed, and payment records stay, with your account taken off them',
                        },
                    ],
                },
                { kind: 'subhead', text: 'btc.ochk.io' },
                {
                    kind: 'para',
                    text: 'btc.ochk.io keeps only the alert thresholds you save, with your account, and deletes them when your account is deleted. Its planner and paper desk stay in your browser. Its market commentary is written each hour by an AI model provider (Anthropic) from market data and the web searches it runs; nothing about you is sent.',
                },
                { kind: 'subhead', text: 'globe.ochk.io' },
                {
                    kind: 'para',
                    text: 'globe.ochk.io stores nothing about you. Your browser fetches live network data directly from mempool.space, which sees your IP address.',
                },
                {
                    kind: 'para',
                    text: 'cosign.ochk.io, btc.ochk.io and globe.ochk.io use the cookie-free analytics described below.',
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
            hint: 'scheduled and on-write deletion · permanent public artifacts',
            blocks: [
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'public artifacts',
                            v: 'permanent and publicly shareable; data published to Nostr cannot be deleted by OrangeCheck',
                        },
                        {
                            k: 'request logs',
                            v: 'held by our hosting provider (Vercel) for its own short retention window; we keep no separate copy',
                        },
                        {
                            k: 'relay.ochk.io connections',
                            v: 'handled by our hosting provider (Fly.io) for its own short retention window; its connection logs for the relay can hold your IP address and connection times for 7 days, and we keep no separate copy',
                        },
                        {
                            k: 'sessions',
                            v: 'deleted when you sign out; a session that expires after 30 days is deleted the next time anyone signs in',
                        },
                        {
                            k: 'IP addresses in the sign-in log',
                            v: 'cleared after 90 days; the entries themselves stay until your account is deleted',
                        },
                        {
                            k: 'email sign-in codes',
                            v: 'the code itself is never stored and expires after 10 minutes; the record that it was used is deleted when it is spent, or with the next code anyone asks for after it expires; per-address and per-network send counts, kept as keyed hashes, are dropped after a day',
                        },
                        {
                            k: 'account, sign-in identities, passkeys, sign-in log, coin backings, OC Chat device records and btc.ochk.io alerts',
                            v: 'deleted when your account-deletion request completes; file one in your account settings, or ask at [[PRIVACY_CONTACT]]. A revocation already published to Nostr relays stays there, and a marker under a hash of your account id, which refuses your old sessions, lasts until they would have expired',
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
