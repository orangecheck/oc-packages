/**
 * @orangecheck/legal — `me` profile.
 *
 * ochk.app (its API at me.ochk.io): a consumer Bitcoin-backed identity that pays users in sats.
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
    '**ochk.app is a commercial product operated by OrangeCheck.** It is distinct from the non-custodial OrangeCheck protocol sites; the Terms at [ochk.io/terms](https://ochk.io/terms) do not govern ochk.app. These Terms do. Its API is served at me.ochk.io, from the same accounts and records: these Terms govern the Service at either address, and “ochk.app” in them means both.';

const terms: DocSpec = {
    kind: 'terms',
    eyebrow: 'terms',
    title: 'Terms of service',
    description:
        'The terms governing your use of ochk.app and its API at me.ochk.io — a Bitcoin-backed identity that pays you in sats. OrangeCheck-custodied during bring-up, federation custody and self-custody graduation as the destination, no KYC.',
    metaTitle: 'Terms of Service — ochk.app',
    metaDescription:
        'Terms of service for ochk.app: a Bitcoin-backed identity that pays users in sats. OrangeCheck custody during bring-up, federation custody and self-custody graduation as the destination, no KYC.',
    effective: '2026-05-15',
    updated: '2026-10-29',
    preamble: [
        {
            kind: 'callout',
            emphatic: true,
            text: 'By accessing or using ochk.app or its API at me.ochk.io, you agree to be bound by these Terms. If you do not agree, do not use the Service. These Terms contain a binding-arbitration, class-action, and jury-trial waiver and important limitations on liability.',
        },
        { kind: 'callout', text: COMMERCIAL_NOTE },
    ],
    sections: [
        {
            id: 'overview',
            heading: 'overview',
            hint: 'what ochk.app is',
            blocks: [
                {
                    kind: 'para',
                    text: 'ochk.app is an identity you use to sign in across participating sites ("integrators"). When an integrator records a billable event for an action you authorize, a share of the fee flows back to you in sats. Your identity is anchored in Bitcoin, verifiable offline, and portable across the OrangeCheck family.',
                },
                {
                    kind: 'para',
                    text: 'ochk.app is **not a bank, exchange, broker, or wallet provider.** It is an identity and reputation service with an attached cashback mechanism. **During bring-up OrangeCheck operates every role in that mechanism, including custody of the balance it pays you.** That is a stage, not the design — see the custody section below for what holds today and what replaces it.',
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
                    text: 'You may create an identity two ways: **BIP-322** (you sign with your own Bitcoin wallet — full self-custody of your signing key) or **email-OTP** (a one-time code; you hold no key of your own, so OrangeCheck holds your signing key). Either way, during bring-up OrangeCheck holds the cashback you accrue; see custody below. Both produce a stable, opaque `did:oc` identifier. No password is ever stored.',
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
                    text: 'The economics of earning sats on ochk.app — how billable events generate cashback, the fee split between you, the integrating site, federation operators, and OrangeCheck, the timing of credits, and the conditions under which earnings may be withheld, delayed, clawed back, or reversed (including for suspected abuse or wash-trading) — are being finalized for publication before general availability. Until then, earning behavior is governed by the published abuse limits in the section below and the descriptions on [how it works](/how) and [the earn page](/earn). This section will be completed following review by counsel.',
                },
            ],
        },
        {
            id: 'custody',
            heading: 'custody & graduation',
            hint: 'orangecheck-held during bring-up · federation custody and self-custody exit next',
            blocks: [
                {
                    kind: 'para',
                    text: 'Custody depends on how you sign in, and the honest answer differs today from the design.\n\n**If you sign in with BIP-322, you hold your own keys.** They never leave your device. OrangeCheck verifies signatures and relays envelopes; it cannot move the funds in your wallet. That is true now and does not change.\n\n**What you earn is a different matter.** Cashback you accrue is a balance OrangeCheck owes you until it is paid out to the destination you bind. During bring-up OrangeCheck holds those sats for every user, however they sign in.\n\n**If you sign in with email, OrangeCheck currently holds the key that pays you.** The design is that a Fedimint federation — run by independent guardian operators, not OrangeCheck — holds funds under a threshold scheme, and you may **graduate** to full self-custody at any time. That federation does not exist yet: there are no independent guardians today, and during bring-up the signing key for the paying rail is operated by OrangeCheck. So during this period OrangeCheck is a custodian, of email users’ signing keys and of every user’s accrued cashback, and the party that moves the money.\n\nWe state that plainly rather than describing the destination as though it were the present. **The live status of the paying rail — which posture is in force, what bounds it, and what has actually settled — is published on [the custody page](/custody) and machine-readable at `/api/federations`.** Those surfaces are computed from the system rather than written by hand, so they cannot drift from this document the way a fixed sentence would.',
                },
                {
                    kind: 'stub',
                    text: 'The complete custody disclosure — the federation threshold model and its failure modes, what each guardian can and cannot do, the durability of your balance if a federation or OrangeCheck ceases operations, the mechanics and timing of graduation, and the allocation of risk between you, the federation, and OrangeCheck — is being finalized for publication before general availability. The honest current-state engineering account is published on the [security page](/security). This section will be completed following review by counsel.',
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
                { kind: 'subhead', text: 'when a payout is held' },
                {
                    kind: 'para',
                    text: 'We hold a payout, and do not send it, when an earlier attempt to send it may already have gone through; while payouts are paused by a halt, a federation migration or a payout ceiling, or are not yet open to you; while the node that pays cannot cover everything owed, or its fee limit is unknown; for 24 hours after you change your payout destination; when your payout destination is no longer valid; or when our records disagree about what is owed. A paused or limited payout goes out on its own once the pause, ceiling, shortfall or 24 hours have passed; setting a new destination clears a destination hold; and a disagreement clears when we correct the record. A payout whose earlier attempt may have gone through is never retried on its own: we check the payment node, then either mark it paid with the payment\'s proof or release it to be sent again. A hold does not cancel what you are owed.',
                },
            ],
        },
        {
            id: 'no-kyc',
            heading: 'no kyc, no pii',
            blocks: [
                {
                    kind: 'para',
                    text: 'ochk.app **does not perform Know-Your-Customer checks** and does not require your legal name, government ID, or physical address to sign in, use apps or get paid. Sybil resistance is achieved through protocol composition — BIP-322 sat-bond attestation, paid-action history, and integrator-defined gates — not identity verification. You must not use ochk.app to evade a KYC, AML, or sanctions obligation that applies to you elsewhere.',
                },
            ],
        },
        {
            id: 'abuse-limits',
            heading: 'abuse, sybil resistance & rate limits',
            blocks: [
                {
                    kind: 'para',
                    text: 'ochk.app publishes its abuse limits openly so legitimate users can see they are well below them. The canonical, current values are on the [security page](/security). Activity that exceeds a review threshold may be held for human review; activity assessed as sybil farming, wash-trading, or collusion between an integrator and a user may have earnings withheld or reversed and the identity suspended.',
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
                    text: 'Sites that integrate ochk.app through its API at me.ochk.io get their own subject id for the events they report, and your Bitcoin address, email or attestation tier only if you grant that scope. Signing in gives every site the same orangecheck id (did:oc), so sites that compare ids can tell it is you. Integrators independently decide whether and how to trust your identity, including whether to admit, gate, or reject you. OrangeCheck is not a party to, and accepts no liability for, an integrator’s decisions or an integrator’s own terms, pricing, or conduct.',
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
                    text: 'Nothing ochk.app provides is financial, investment, legal, or tax advice. ochk.app does not guarantee any level of earnings; cashback depends on integrator activity outside OrangeCheck’s control.',
                },
                { kind: 'subhead', text: 'regulatory status' },
                {
                    kind: 'stub',
                    text: 'ochk.app is designed so that cashback is custodied and disbursed by independent Fedimint federations. **Those federations do not exist yet. During bring-up OrangeCheck itself custodies and transmits the cashback it pays to every user**, because it is operating every role in the system in order to prove it works before third parties take any of them. Self-custody (BIP-322) users keep their own keys, which OrangeCheck never holds; the cashback they accrue is held by OrangeCheck until it is paid out, as it is for every user. The full regulatory analysis of both the bring-up posture and the designed end state — including OrangeCheck’s position under the U.S. Bank Secrecy Act money-transmission rules, the FATF Recommendations, the EU MiCA Regulation, and applicable U.S. state money-transmitter regimes, and the corresponding licensing posture — is being prepared and will be published before general availability. This section will be completed following review by counsel.',
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
                    text: '**Your right:** stop using ochk.app at any time; you may delete your identity in [your settings](/me/settings). **Our right:** suspend or terminate access with or without cause, including for abuse or legal risk. Deleting your identity does not settle a balance OrangeCheck owes you, and during bring-up there is no sweep to self-custody to run first — no federation is bound. If your balance is above zero, bind a payout destination and instruct a cash-out before you delete, or contact us. Hashes anchored to Bitcoin and commitments published to Nostr are immutable and cannot be deleted by OrangeCheck; neither names you. The disclaimer, liability, indemnification, governing-law, and dispute provisions survive.',
                },
            ],
        },
        changesToTerms,
        disputeResolution,
        miscellaneous,
    ],
    summary:
        'summary: an identity that pays you in sats. if you sign in with your own bitcoin wallet, you keep your keys; if you sign in with email, orangecheck holds the key that pays you. either way, during bring-up orangecheck holds what you have earned until it is paid out or independent federations take it over. money, custody, fee, and regulatory terms are being finalized — see the marked sections.',
};

const privacy: DocSpec = {
    kind: 'privacy',
    eyebrow: 'privacy',
    title: 'Privacy policy',
    description:
        'How ochk.app and its API at me.ochk.io handle your data: no KYC, no PII required, and a documented, falsifiable account of every record OrangeCheck stores.',
    metaTitle: 'Privacy Policy — ochk.app',
    metaDescription:
        'ochk.app privacy policy. No KYC, no PII required, and a full account of what OrangeCheck stores.',
    effective: '2026-05-15',
    updated: '2026-10-28',
    preamble: [
        {
            kind: 'callout',
            text: 'This policy covers the Service at both of its addresses, ochk.app and its API at me.ochk.io: one account, one store of records, one operator; “ochk.app” below means both. Its product is identity that pays you; its privacy posture is what makes it distinct from Sign in with Google. For a side-by-side comparison you can falsify, see [the privacy comparison](/privacy-compare).',
        },
    ],
    sections: [
        {
            id: 'at-a-glance',
            heading: 'at a glance',
            hint: 'no kyc · no pii · what sites get',
            blocks: [
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'no kyc',
                            v: 'ochk.app never collects your legal name, government ID, or physical address from people who sign in, use apps or get paid',
                        },
                        {
                            k: 'little pii at signup',
                            v: 'a Bitcoin signature needs no personal data; an email code, Google or GitHub sign-in stores your email address, encrypted',
                        },
                        {
                            k: 'what sites get',
                            v: 'each site gets its own subject id for events, but signing in gives every site the same orangecheck id (did:oc), so sites that compare ids can tell it is you',
                        },
                        {
                            k: 'no advertising',
                            v: 'no third-party ad identity, no behavioural ad targeting, no data sale — ever',
                        },
                        {
                            k: 'deletable',
                            v: 'you can delete your account in your settings: your sign-in closes and your data is erased, except the few records named under identity & account deletion',
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
                            v: 'a hash of the session token, the account id, the user-agent of the device that opened it, and timestamps. The token itself lives only in your browser.',
                        },
                        {
                            k: 'sign-in log',
                            v: 'each sign-in and each identity you link or remove, with the IP address and user-agent at the time, kept for security; the IP address is cleared after 90 days.',
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
                            k: 'site sign-ins',
                            v: 'which live sites you signed in to or shared data with through orangecheck, and when. A site can name you as the person who earned for an event only once this record exists. No site sees it, and it is erased with your account or with that site\'s project.',
                        },
                        {
                            k: 'guardian applications',
                            v: 'an application to run a guardian, made through ochk.app or by email to apply@ochk.io, holds your answers to the operator questionnaire, which asks, among other things, for a public handle, the name of the person or organisation that will run the guardian, its jurisdiction, a public contact channel, a key fingerprint and two references. Through ochk.app it can also hold an optional handle and email address that only the reviewer sees, for the decision. The questionnaire’s handle, name, jurisdiction, contact channel and fingerprint are published in the federation charter, because guardians are named trust anchors. Nothing is checked against an ID, and nothing else is published.',
                        },
                        {
                            k: 'public anchors',
                            v: 'an OpenTimestamps proof over each envelope’s hash, and a salted commitment to each envelope on Nostr. Public by design, and neither names you, the site or the amount. The envelope itself is served only to whoever holds its id. Drop manifests, which name no one, are published in full.',
                        },
                    ],
                },
            ],
        },
        {
            id: 'scoped-identity',
            heading: 'what sites get, and scopes',
            blocks: [
                {
                    kind: 'para',
                    text: 'Each site gets its own subject id for events: a **scoped subject**, derived from your account and that site’s project key, so the site recognizes you when you return. But signing in gives every site the same orangecheck id (did:oc), so sites that compare ids can tell it is you. An integrator only ever receives your master Bitcoin address, email, or attestation tier if you **explicitly grant that scope** for that site — each scope is opt-in, per-site, and revocable at any time from your account.',
                },
                {
                    kind: 'para',
                    text: 'Integrators never receive your event history with other sites, your wallet balance, your site sign-ins, or any cross-integrator data, regardless of scopes granted.',
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
                    text: 'On ochk.app, two cookies of its own, set for ochk.app alone. `__Host-oc_session` — a sign-in token bound to ochk.app (HttpOnly, Secure, SameSite=Lax); it cannot sign you in anywhere else. `__Host-oc_oauth` — kept for at most ten minutes while you sign in with Google or GitHub, then deleted. Your light/dark choice stays in your browser’s local storage, not a cookie. Page analytics use orangecheck’s own counter at insights.ochk.io: no cookie; a visit is counted by a hash salted daily, the salt is deleted after 48 hours, and your IP address and browser string are never stored.',
                },
                {
                    kind: 'para',
                    text: 'On me.ochk.io, four cookies. `oc_session` — the Ed25519-signed session token issued by ochk.io (HttpOnly, Secure, SameSite=None, Domain=.ochk.io). `oc_theme`, `oc_skin` and `oc_motion` — your dark/light, appearance and reduced-motion preferences (Domain=.ochk.io), not auth-bearing. No tracking cookies, no advertising IDs, no third-party pixels. Page analytics use [Plausible](https://plausible.io/privacy) — cookie-free, no PII, aggregate only.',
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
                            v: 'retained as the canonical earnings and custody-state record; their hashes on Bitcoin and commitments on Nostr are immutable',
                        },
                        {
                            k: 'request logs',
                            v: 'held by our hosting provider (Vercel) for its own short retention window; we keep no separate copy',
                        },
                        {
                            k: 'session records',
                            v: 'retained until the session is revoked or expires',
                        },
                        {
                            k: 'IP addresses in the sign-in log',
                            v: 'cleared after 90 days; the entries themselves stay until your account is deleted',
                        },
                        {
                            k: 'account row',
                            v: 'deleted, with your sign-in identities, passkeys, sessions and sign-in log, when your account-deletion request completes; anchored and published data cannot be deleted by anyone',
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
                    text: 'In [your settings](/me/settings) you can delete your account. A person completes the request, and we aim to do that within 48 hours: an alert tells us when one has waited a day. Completing it closes your sign-in, so signing in again starts a new account, and erases your data on ochk.io, me.ochk.io, vault, chat and cosign, except a few records. Payment records keep their amounts and times for accounting, and our audit log and your deletion request stay, without the reason you gave. We keep a record that your account was deleted, out of public view, so sessions you already had stop working and the deletion can be shown. Each keeps your account only as a keyed id, or not at all, so the record by itself doesn\'t say whose account it was. On cosign, your messages in conversations with other people and the reports you filed stay, with your account taken off them. Backups roll off within 30 days, and copies cached by our CDN expire within a day. Deleting does not pay out sats OrangeCheck holds for you: settle a non-zero balance first. If you run a guardian, you can delete only once your operator key holds no seat or hosted guardian, has finished any exit, created no federation that still exists, and is owed nothing. Charter signatures, incidents and amendment proposals the key signed stay public under the key, with what you wrote in them; exit records and machine reports stay visible to that federation\'s guardians and to us. Hashes anchored to Bitcoin and records published to Nostr cannot be deleted by anyone. me.ochk.io\'s own anchors name no one, but attestations, polls, pledges, stamps and a chat listing you published carry your Bitcoin address.',
                },
            ],
        },
        {
            id: 'site-made-accounts',
            heading: 'an account a site made for you',
            blocks: [
                {
                    kind: 'para',
                    text: 'A site that signs you in its own way can use OrangeCheck Connect to make an orangecheck account for you. For that account OrangeCheck keeps a hash of the id the site gave you, never the id; a keyed hash of your email address if the site sent one, never the address; when the account was made; whether the site said you agreed to earn with it; and what it earned, if the site pays. It keeps no sign-in times, because the account has no sign-in of its own. Until you agree, through the site or by claiming it, the account is for sign-in only and earns nothing.',
                },
                {
                    kind: 'para',
                    text: 'You can claim it on ochk.app with a link the site gives you, or with an email address the site verified and you hold. It then becomes part of your own account, and deleting your account deletes it. The site can delete it too, for example when you close your account with that site, unless it holds earnings: those stay yours until you claim them. After a deletion OrangeCheck keeps only a hash of the id the site gave you, with the site\'s app id, so the site cannot quietly make the account again; it can only when you agree again.',
                },
            ],
        },
        privacyTransfers,
        privacyRegional,
        privacyChildren,
        privacyChanges,
    ],
    summary:
        'summary: no kyc, no pii required, and a documented account of every record orangecheck stores.',
};

export const meProfile = { terms, privacy };
