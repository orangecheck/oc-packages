/**
 * @orangecheck/legal — `me` profile.
 *
 * me.ochk.io: a consumer Bitcoin-backed identity that pays users in sats.
 * Federation-custodied by default, self-custody graduation, no KYC. This is
 * the only profile where value flows TO the user, so the money, custody, and
 * regulated-activity sections are rendered as counsel-review stubs per the
 * "structure + stubs" directive — the surrounding contract is complete.
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
    '**me.ochk.io is a commercial product operated by OrangeCheck.** It is distinct from the non-custodial OrangeCheck protocol sites; the Terms at [ochk.io/terms](https://ochk.io/terms) do not govern me.ochk.io. These Terms do.';

const terms: DocSpec = {
    kind: 'terms',
    eyebrow: 'terms',
    title: 'Terms of service',
    description:
        'The terms governing your use of me.ochk.io — a Bitcoin-backed identity that pays you in sats. Federation-custodied by default, self-custody graduation, no KYC.',
    metaTitle: 'Terms of Service — me.ochk.io',
    metaDescription:
        'Terms of service for me.ochk.io: a Bitcoin-backed identity that pays users in sats. Federation custody, graduation to self-custody, no KYC.',
    effective: '2026-05-15',
    updated: '2026-05-15',
    preamble: [
        {
            kind: 'callout',
            emphatic: true,
            text: 'By accessing or using me.ochk.io, you agree to be bound by these Terms. If you do not agree, do not use the Service. These Terms contain a binding-arbitration, class-action, and jury-trial waiver and important limitations on liability.',
        },
        { kind: 'callout', text: COMMERCIAL_NOTE },
    ],
    sections: [
        {
            id: 'overview',
            heading: 'overview',
            hint: 'what me.ochk.io is',
            blocks: [
                {
                    kind: 'para',
                    text: 'me.ochk.io is an identity you use to sign in across participating sites ("integrators"). When an integrator records a billable event for an action you authorize, a share of the fee flows back to you in sats. Your identity is anchored in Bitcoin, verifiable offline, and portable across the OrangeCheck family.',
                },
                {
                    kind: 'para',
                    text: 'me.ochk.io is **not a bank, exchange, broker, or wallet provider.** It is an identity and reputation service with an attached cashback mechanism. OrangeCheck does not hold your funds — see section on custody below.',
                },
            ],
        },
        {
            id: 'accounts',
            heading: 'accounts & identity',
            hint: 'two sign-in paths',
            blocks: [
                {
                    kind: 'para',
                    text: 'You may create an identity two ways: **BIP-322** (you sign with your own Bitcoin wallet — full self-custody) or **email-OTP** (a one-time code; a federation-custodied wallet provisions in your browser). Both produce a stable, opaque `did:oc` identifier. No password is ever stored.',
                },
                {
                    kind: 'para',
                    text: 'You are responsible for the security of the wallet, device, email account, or recovery mnemonic associated with your identity. Anyone with your keys or recovery factor can act as you. OrangeCheck cannot recover an account, reverse a sign-in, or restore a lost key or mnemonic.',
                },
            ],
        },
        eligibility,
        {
            id: 'earning',
            heading: 'earning sats',
            hint: 'cashback on billable events',
            blocks: [
                {
                    kind: 'stub',
                    text: 'The economics of earning sats on me.ochk.io — how billable events generate cashback, the fee split between you, the integrating site, federation operators, and OrangeCheck, the timing of credits, and the conditions under which earnings may be withheld, delayed, clawed back, or reversed (including for suspected abuse or wash-trading) — are being finalized for publication before general availability. Until then, earning behavior is governed by the published abuse limits in the section below and the descriptions on /how and /earn. This section will be completed following review by counsel.',
                },
            ],
        },
        {
            id: 'custody',
            heading: 'custody & graduation',
            hint: 'federation-custodied · self-custody exit',
            blocks: [
                {
                    kind: 'para',
                    text: 'me.ochk.io is **non-custodial with respect to OrangeCheck**: OrangeCheck holds no private keys and no federation key shares, and cannot move your funds. BIP-322 users hold their own wallet. For email-OTP users, a Fedimint **federation** — run by independent guardian operators, never OrangeCheck — holds funds under a threshold scheme. You may **graduate** to full self-custody at any time.',
                },
                {
                    kind: 'stub',
                    text: 'The complete custody disclosure — the federation threshold model and its failure modes, what each guardian can and cannot do, the durability of your balance if a federation or OrangeCheck ceases operations, the mechanics and timing of graduation, and the allocation of risk between you, the federation, and OrangeCheck — is being finalized for publication before general availability. The honest current-state engineering account is published at /security. This section will be completed following review by counsel.',
                },
            ],
        },
        {
            id: 'fees-payouts',
            heading: 'fees, payouts & taxes',
            blocks: [
                {
                    kind: 'stub',
                    text: 'Platform fees, payout mechanics and minimums, supported payout rails, currency-conversion handling, and the allocation of tax-reporting and tax-payment responsibility for sats you receive are being finalized for publication before general availability. You are advised that cashback received may be taxable income in your jurisdiction and that you are responsible for your own tax compliance. This section will be completed following review by counsel.',
                },
            ],
        },
        {
            id: 'no-kyc',
            heading: 'no kyc, no pii',
            blocks: [
                {
                    kind: 'para',
                    text: 'me.ochk.io **does not perform Know-Your-Customer checks** and does not require your legal name, government ID, or physical address. Sybil resistance is achieved through protocol composition — BIP-322 sat-bond attestation, paid-action history, and integrator-defined gates — not identity verification. You must not use me.ochk.io to evade a KYC, AML, or sanctions obligation that applies to you elsewhere.',
                },
            ],
        },
        {
            id: 'abuse-limits',
            heading: 'abuse, sybil resistance & rate limits',
            blocks: [
                {
                    kind: 'para',
                    text: 'me.ochk.io publishes its abuse limits openly so legitimate users can see they are well below them. The canonical, current values are on the [/security](/security) page. Activity that exceeds a review threshold may be held for human review; activity assessed as sybil farming, wash-trading, or collusion between an integrator and a user may have earnings withheld or reversed and the identity suspended.',
                },
                {
                    kind: 'bullets',
                    items: [
                        'Do not operate multiple identities to multiply new-account bonuses',
                        'Do not collude with an integrating site to manufacture billable events',
                        'Do not script or automate actions to inflate earnings',
                        'Do not misrepresent a real user action as authorized when it was not',
                    ],
                },
            ],
        },
        acceptableUse,
        {
            id: 'integrators',
            heading: 'integrators & relying parties',
            blocks: [
                {
                    kind: 'para',
                    text: 'Sites that integrate me.ochk.io receive a **per-integrator scoped identifier** for you, not your master identity — they cannot correlate you across sites unless you explicitly grant a scope. Integrators independently decide whether and how to trust your identity, including whether to admit, gate, or reject you. OrangeCheck is not a party to, and accepts no liability for, an integrator’s decisions or an integrator’s own terms, pricing, or conduct.',
                },
            ],
        },
        intellectualProperty,
        {
            id: 'disclaimers',
            heading: 'disclaimers & warranties',
            hint: 'as-is · regulatory status',
            blocks: [
                {
                    kind: 'callout',
                    emphatic: true,
                    text: 'THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITH ALL FAULTS AND WITHOUT WARRANTY OF ANY KIND. TO THE MAXIMUM EXTENT PERMITTED BY LAW, ORANGECHECK DISCLAIMS ALL WARRANTIES, EXPRESS, IMPLIED, AND STATUTORY — INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, AND ACCURACY.',
                },
                {
                    kind: 'para',
                    text: 'Nothing me.ochk.io provides is financial, investment, legal, or tax advice. me.ochk.io does not guarantee any level of earnings; cashback depends on integrator activity outside OrangeCheck’s control.',
                },
                { kind: 'subhead', text: 'regulatory status' },
                {
                    kind: 'stub',
                    text: 'me.ochk.io facilitates cashback that is custodied and disbursed by independent Fedimint federations; OrangeCheck does not itself custody, transmit, or take possession of user funds. The full regulatory analysis of this arrangement — including OrangeCheck’s position under the U.S. Bank Secrecy Act money-transmission rules, the FATF Recommendations, the EU MiCA Regulation, and applicable U.S. state money-transmitter regimes, and the corresponding licensing posture — is being prepared and will be published before general availability. This section will be completed following review by counsel.',
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
                    text: '**Your right:** stop using me.ochk.io at any time; you may delete your identity from `/me/settings`. **Our right:** suspend or terminate access with or without cause, including for abuse or legal risk. Before deletion you should sweep any federation-custodied balance to self-custody (the graduate flow) — anchored events on Bitcoin and Nostr-published envelopes are immutable and cannot be deleted by OrangeCheck. The disclaimer, liability, indemnification, governing-law, and dispute provisions survive.',
                },
            ],
        },
        changesToTerms,
        disputeResolution,
        miscellaneous,
    ],
    summary:
        'summary: an identity that pays you in sats. orangecheck holds no keys and no funds. money, custody, fee, and regulatory terms are being finalized — see the marked sections.',
};

const privacy: DocSpec = {
    kind: 'privacy',
    eyebrow: 'privacy',
    title: 'Privacy policy',
    description:
        'How me.ochk.io handles your data: no KYC, no PII required, a per-integrator scoped identity, and a documented, falsifiable account of every record OrangeCheck stores.',
    metaTitle: 'Privacy Policy — me.ochk.io',
    metaDescription:
        'me.ochk.io privacy policy. No KYC, no PII required, per-integrator scoped identity, and a full account of what OrangeCheck stores.',
    effective: '2026-05-15',
    updated: '2026-05-15',
    preamble: [
        {
            kind: 'callout',
            text: 'me.ochk.io’s product is identity that pays you; its privacy posture is what makes it distinct from Sign in with Google. For a side-by-side comparison you can falsify, see [the privacy comparison](/privacy-compare).',
        },
    ],
    sections: [
        {
            id: 'at-a-glance',
            heading: 'at a glance',
            hint: 'no kyc · no pii · scoped identity',
            blocks: [
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'no kyc',
                            v: 'me.ochk.io never collects your legal name, government ID, or physical address',
                        },
                        {
                            k: 'no pii at signup',
                            v: 'you sign up with a Bitcoin signature or an email/phone one-time code — your choice',
                        },
                        {
                            k: 'scoped identity',
                            v: 'integrating sites receive a per-site identifier, not your master identity; they cannot correlate you across sites',
                        },
                        {
                            k: 'no advertising',
                            v: 'no third-party ad identity, no behavioural ad targeting, no data sale — ever',
                        },
                        {
                            k: 'deletable',
                            v: 'you can permanently revoke your identity from /me/settings',
                        },
                    ],
                },
            ],
        },
        {
            id: 'what-oc-stores',
            heading: 'what orangecheck stores',
            hint: 'metadata only · none enables fund movement',
            blocks: [
                {
                    kind: 'para',
                    text: 'The list below is what an auditor would find in OrangeCheck’s production infrastructure. Every item is metadata; none of it lets OrangeCheck sign on your behalf.',
                },
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'account row',
                            v: 'opaque did_oc, optional display name and Nostr npub, timestamps. The underlying email is encrypted at rest; a BIP-322 address is stored plaintext (it is already public on-chain). No password hash, no private key, no mnemonic.',
                        },
                        {
                            k: 'session record',
                            v: 'the session JWT id, account id, and issue/revoke timestamps. The session token itself lives only as a cookie in your browser.',
                        },
                        {
                            k: 'event envelopes',
                            v: 'per billable event: a content-addressed, signed record of what was authorized, by whom, and the fee breakdown. Used to route cashback.',
                        },
                        {
                            k: 'custody-state envelopes',
                            v: 'a record of each federation ⇄ self-custody transition (graduation), surfaced on your own identity timeline.',
                        },
                        {
                            k: 'public anchors',
                            v: 'OpenTimestamps proofs and Nostr-published event roots — public by design, verifiable against Bitcoin without OrangeCheck online',
                        },
                    ],
                },
            ],
        },
        {
            id: 'scoped-identity',
            heading: 'per-integrator identity & scopes',
            blocks: [
                {
                    kind: 'para',
                    text: 'Each integrating site receives a deterministic **scoped subject** derived from your master identity and that site’s project key. Scoped subjects are stable per-site (the integrator recognizes a returning user) but unlinkable across sites (two integrators cannot collude to correlate you). An integrator only ever receives your master Bitcoin address, email, or attestation tier if you **explicitly grant that scope** for that site — each scope is opt-in, per-site, and revocable at any time from `/me/identity`.',
                },
                {
                    kind: 'para',
                    text: 'Integrators never receive your event history with other sites, your wallet balance, your connected-sites list, or any cross-integrator data, regardless of scopes granted.',
                },
            ],
        },
        {
            id: 'cross-site-graph',
            heading: 'the cross-site events graph',
            hint: 'honest current state',
            blocks: [
                {
                    kind: 'para',
                    text: 'OrangeCheck’s billing engine necessarily knows which user earned which cashback across integrating sites — that join is how the right wallet is credited. Today that linkage exists in plain storage on me.ochk.io infrastructure; OrangeCheck commits, as a **policy** matter enforced by access controls and audit logging, not to build cross-site behavioural profiles. A per-integrator blinded-identifier design that removes the linkage architecturally is active research and not yet shipped. We disclose this honestly rather than overclaim.',
                },
            ],
        },
        {
            id: 'cookies',
            heading: 'cookies',
            blocks: [
                {
                    kind: 'para',
                    text: 'Two cookies. `oc_session` — the Ed25519-signed session token issued by ochk.io (HttpOnly, Secure, SameSite=Lax, Domain=.ochk.io). `oc_theme` — your dark/light preference, not auth-bearing. No tracking cookies, no advertising IDs, no third-party pixels. Page analytics use [Plausible](https://plausible.io/privacy) — cookie-free, no PII, aggregate only.',
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
                        'Route cashback to the correct identity and wallet',
                        'Detect and prevent sybil farming, wash-trading, and abuse',
                        'Operate sign-in and verification across the OrangeCheck family',
                        'Fix bugs, improve the Service, and respond to support requests',
                    ],
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
                            k: 'event & rebind envelopes',
                            v: 'retained as the canonical earnings and custody-state record; anchored copies on Bitcoin and Nostr are immutable',
                        },
                        {
                            k: 'technical logs',
                            v: 'retained 90 days for security and debugging, then auto-deleted',
                        },
                        {
                            k: 'session records',
                            v: 'retained until the session is revoked or expires',
                        },
                        {
                            k: 'account row',
                            v: 'deleted on request via the account-deletion flow, subject to the immutability of anchored data',
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
                    text: 'HTTPS in transit; emails encrypted at rest; access to production data is allowlisted and audit-logged. No method of storage is perfectly secure — we use reasonable measures but do not warrant security; see the [Terms of Service](/terms). If we become aware of a breach of personal data we hold, we will notify affected users and any competent supervisory authority as required by applicable law.',
                },
            ],
        },
        privacyRights,
        {
            id: 'deletion',
            heading: 'identity & account deletion',
            blocks: [
                {
                    kind: 'para',
                    text: 'From `/me/settings → advanced → delete` you can permanently revoke your OrangeCheck identity. A federation-custodied balance must be swept to your own wallet first (the graduate flow). OrangeCheck deletes the operational records it holds about you; events already anchored to Bitcoin headers or published to Nostr are immutable public records of fee flows and cannot be deleted by anyone.',
                },
            ],
        },
        privacyTransfers,
        privacyRegional,
        privacyChildren,
        privacyChanges,
    ],
    summary:
        'summary: no kyc, no pii required, a per-integrator scoped identity, and a documented account of every record orangecheck stores.',
};

export const meProfile = { terms, privacy };
