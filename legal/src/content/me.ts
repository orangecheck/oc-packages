/**
 * @orangecheck/legal — `me` profile.
 *
 * ochk.app (its API at me.ochk.io): a consumer Bitcoin-backed identity that will pay users in sats.
 * orangecheck holds what users earn while it is in testing, no KYC. This is
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
    '**ochk.app is a commercial product operated by orangecheck.** It is distinct from the non-custodial orangecheck protocol sites; the Terms at [ochk.io/terms](https://ochk.io/terms) do not govern ochk.app. These Terms do. Its API is served at me.ochk.io, from the same accounts and records: these Terms govern the Service at either address, and “ochk.app” in them means both.';

const terms: DocSpec = {
    kind: 'terms',
    eyebrow: 'terms',
    title: 'Terms of service',
    description:
        'The terms governing your use of ochk.app and its API at me.ochk.io — a Bitcoin-backed identity that will pay you in sats. orangecheck holds what you earn while ochk.app is in testing, and will pay it to a Lightning wallet you choose. No KYC.',
    metaTitle: 'Terms of Service — ochk.app',
    metaDescription:
        'Terms of service for ochk.app: a Bitcoin-backed identity that will pay users in sats. orangecheck holds what users earn while ochk.app is in testing, and will pay it to a Lightning wallet they choose. No KYC.',
    effective: '2026-05-15',
    updated: '2026-11-11',
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
                    text: 'ochk.app is an identity you use to sign in across participating sites ("integrators"). When an integrator records a billable event for an action you authorize, a share of the fee will flow back to you in sats. Your identity works across the orangecheck family. Every paid event on your account has a receipt, signed by us, and anyone holding one and the public key we publish can check its signature offline, without asking us; a receipt sent to Bitcoin for a timestamp also checks against Bitcoin once it is anchored. If you back your account, it is tied to bitcoin you hold, and that bitcoin stays in your wallet.',
                },
                {
                    kind: 'para',
                    text: 'ochk.app is **not a bank, exchange, broker, or wallet provider.** It is an identity and reputation service through which you earn sats. **While ochk.app is in testing, orangecheck operates every role in paying you what you earn, including custody of the balance it will pay you.** That is a stage, not the design — see the custody section below for what holds today.',
                },
            ],
        },
        {
            id: 'accounts',
            heading: 'accounts & identity',
            hint: 'four ways to sign in',
            blocks: [
                {
                    kind: 'para',
                    text: 'You may create an identity four ways: with **email** (a one-time code), **Google**, **GitHub**, or **a Bitcoin wallet** (you sign with BIP-322 — full self-custody of your signing key). With email, Google or GitHub you hold no key of your own, so orangecheck holds your signing key. However you sign in, while ochk.app is in testing orangecheck holds what you earn; see custody below. Each way produces a stable, opaque `did:oc` identifier. No password is ever stored.',
                },
                {
                    kind: 'para',
                    text: 'You are responsible for the security of the wallet, device, email account, or recovery mnemonic associated with your identity. Anyone with your keys or recovery factor can act as you. orangecheck cannot recover an account, reverse a sign-in, or restore a lost key or mnemonic.',
                },
            ],
        },
        eligibility,
        {
            id: 'earning',
            heading: 'earning sats',
            hint: 'what you earn from billable events',
            blocks: [
                {
                    kind: 'stub',
                    text: 'The economics of earning sats on ochk.app — how billable events earn you sats, the fee split between you, the integrating site, federation operators, and orangecheck, the timing of credits, and the conditions under which earnings may be withheld, delayed, clawed back, or reversed (including for suspected abuse or wash-trading) — are being finalized for publication before general availability. Until then, earning behavior is governed by the published abuse limits in the section below and the descriptions on [how it works](/how) and [the earn page](/earn). This section will be completed following review by counsel.',
                },
            ],
        },
        {
            id: 'custody',
            heading: 'custody & payouts',
            hint: 'orangecheck-held while in testing · paid out to a wallet you choose',
            blocks: [
                {
                    kind: 'para',
                    text: 'Custody depends on how you sign in, and the honest answer differs today from the design.\n\n**If you sign in with BIP-322, you hold your own keys.** They never leave your device. orangecheck verifies signatures and relays envelopes; it cannot move the funds in your wallet. That is true now and does not change.\n\n**What you earn is a different matter.** It is a balance orangecheck owes you until it is paid out to the destination you bind. While ochk.app is in testing orangecheck holds those sats for every user, however they sign in.\n\n**If you sign in with email, Google or GitHub, orangecheck currently holds the key that will pay you.** The design is a Fedimint federation: independent guardians hold the bitcoin under a threshold scheme, and orangecheck’s executor holds your claim on it, as ecash, until it is paid out to a Lightning wallet you choose. That federation does not exist yet: there are no independent guardians today, and while ochk.app is in testing the signing key for the paying rail is operated by orangecheck. So during this period orangecheck is a custodian, of the signing keys of people who sign in with email, Google or GitHub and of what every user has earned, and the party that will move the money once payouts open.\n\nWe state that plainly rather than describing the destination as though it were the present. **The live status of the paying rail — which posture is in force, what bounds it, and what has actually settled — is published on [the custody page](/custody) and machine-readable at `/api/federations`.** Those surfaces are computed from the system rather than written by hand, so they cannot drift from this document the way a fixed sentence would.',
                },
                {
                    kind: 'stub',
                    text: 'The complete custody disclosure — the federation threshold model and its failure modes, what each guardian can and cannot do, the durability of your balance if a federation or orangecheck ceases operations, and the allocation of risk between you, the federation, and orangecheck — is being finalized for publication before general availability. The honest current-state engineering account is published on the [security page](/security). This section will be completed following review by counsel.',
                },
            ],
        },
        {
            id: 'fees-payouts',
            heading: 'fees, payouts & taxes',
            blocks: [
                {
                    kind: 'stub',
                    text: 'Platform fees, payout mechanics and minimums, supported payout rails, currency-conversion handling, and the allocation of tax-reporting and tax-payment responsibility for sats you receive are being finalized for publication before general availability. You are advised that the sats you earn may be taxable income in your jurisdiction and that you are responsible for your own tax compliance. This section will be completed following review by counsel.',
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
                    text: 'Sites that integrate ochk.app through its API at me.ochk.io get their own subject id for the events they report. Signing in gives every site the same orangecheck id (did:oc), so sites that compare ids can tell it is you, and, if you back your account, what backs it, never the coin itself. Anything more a site gets only if you share it with that site: your Bitcoin address, your email, numbers about your activity across apps, or statements other apps have made about you. The [privacy policy](/privacy#scoped-identity) lists each. Integrators independently decide whether and how to trust your identity, including whether to admit, gate, or reject you. orangecheck is not a party to, and accepts no liability for, an integrator’s decisions or an integrator’s own terms, pricing, or conduct.',
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
                    text: 'Nothing ochk.app provides is financial, investment, legal, or tax advice. ochk.app does not guarantee any level of earnings; what you earn depends on integrator activity outside orangecheck’s control.',
                },
                { kind: 'subhead', text: 'regulatory status' },
                {
                    kind: 'stub',
                    text: 'ochk.app is designed so that independent Fedimint federations hold the bitcoin behind what people earn, while orangecheck’s executor holds each person’s claim on it and pays it out. **Those federations do not exist yet. While ochk.app is in testing, orangecheck itself custodies what every user earns, and will be the one that transmits it**, because it is operating every role in the system in order to prove it works before third parties take any of them. Self-custody (BIP-322) users keep their own keys, which orangecheck never holds; what they earn is held by orangecheck until it is paid out, as it is for every user. The full regulatory analysis of both the testing posture and the designed end state — including orangecheck’s position under the U.S. Bank Secrecy Act money-transmission rules, the FATF Recommendations, the EU MiCA Regulation, and applicable U.S. state money-transmitter regimes, and the corresponding licensing posture — is being prepared and will be published before general availability. This section will be completed following review by counsel.',
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
                    text: '**Your right:** stop using ochk.app at any time; you may delete your identity on [your Account page](/me/account#delete). **Our right:** suspend or terminate access with or without cause, including for abuse or legal risk. Deleting your identity does not settle a balance orangecheck owes you. While payouts are in testing there is no cash-out to start yourself: if your balance is above zero, [contact us](/contact) before you delete, and we settle it by hand first. Hashes anchored to Bitcoin and commitments published to Nostr are immutable and cannot be deleted by orangecheck; neither names you. The disclaimer, liability, indemnification, governing-law, and dispute provisions survive.',
                },
            ],
        },
        changesToTerms,
        disputeResolution,
        miscellaneous,
    ],
    summary:
        'summary: an identity that will pay you in sats. if you sign in with your own bitcoin wallet, you keep your keys; if you sign in with email, google or github, orangecheck holds the key that will pay you. either way, while ochk.app is in testing orangecheck holds what you have earned until it is paid out. money, custody, fee, and regulatory terms are being finalized — see the marked sections.',
};

const privacy: DocSpec = {
    kind: 'privacy',
    eyebrow: 'privacy',
    title: 'Privacy policy',
    description:
        'How ochk.app and its API at me.ochk.io handle your data: no KYC, no PII required, what orangecheck keeps about you, and who sees it.',
    metaTitle: 'Privacy Policy — ochk.app',
    metaDescription:
        'ochk.app privacy policy. No KYC, no PII required, and what orangecheck keeps about you.',
    effective: '2026-05-15',
    updated: '2026-11-11',
    preamble: [
        {
            kind: 'callout',
            text: "**What changed, 8 October to 11 November 2026.** We corrected this policy where it did not say what is kept, who sees it, or what deleting does to a balance. Newest first; the [changelog](https://github.com/orangecheck/oc-packages/blob/main/legal/CHANGELOG.md) lists every change.",
        },
        {
            kind: 'bullets',
            items: [
                { k: "11 November", v: "a guardian application's answers are held for the review. The operator registry publishes the operator key of every accepted application and when it was accepted, and a federation charter the operator key of each seated guardian; nothing else from an application is published yet. The policy lists what a site can ask you to share, each of ochk.app's cookies and both of its page counters, what ochk.app keeps in your browser outside cookies (an operator key record in IndexedDB only if you make, restore or import one), and names records it left out: passkeys, a coin backing your account, your Google or GitHub id, the hashes kept beside your email, a session's id and the roster id that links accounts signed in from one browser, the site you first signed up through, and OC Chat devices." },
                { k: "8 November", v: "while payouts are in testing, a balance above zero is settled by hand before your account is deleted. There is no cash-out to start yourself: contact us first." },
                { k: "29 October", v: "the contact form sends your email address, an optional name, the topic and your message to our inbox through our email provider (Resend)." },
                { k: "27 and 28 October", v: "a guardian application holds the questionnaire's answers. The policy says which records a deletion keeps, and that cached copies expire within a day." },
                { k: "26 October", v: "a session record keeps no IP address, and the sign-in log keeps it for 90 days." },
                { k: "25 October", v: "me.ochk.io records which sites you sign in to or share data with, and when. No site sees that record." },
                { k: "24 October", v: "signing in gives every site the same did:oc." },
                { k: "23 October", v: "an account a site makes for you through orangecheck Connect keeps a hash of the site's id for you, a keyed hash of your email if the site sent one, when it was made, whether you agreed to earn, and what it earned." },
                { k: "19 October", v: "ochk.app is the Service, and me.ochk.io is its API." },
                { k: "15 October", v: "ochk.app's own cookies are listed: __Host-oc_session, and __Host-oc_oauth for at most ten minutes during a Google or GitHub sign-in." },
                { k: "8 October", v: "a session record keeps your user-agent, and an email is personal data." },
            ],
        },
        {
            kind: 'callout',
            text: 'This policy covers the Service at both of its addresses, ochk.app and its API at me.ochk.io: one account, one store of records, one operator; “ochk.app” below means both. Its product is identity that will pay you; its privacy posture is what makes it distinct from Sign in with Google. For a side-by-side comparison you can falsify, see [the privacy comparison](/trust#privacy).',
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
                            v: 'a Bitcoin signature needs no personal data; an email code, Google or GitHub sign-in stores your email address, encrypted, with hashes of it, and Google or GitHub also your account id there',
                        },
                        {
                            k: 'what sites get',
                            v: 'each site gets its own subject id for events, but signing in gives every site the same orangecheck id (did:oc), so sites that compare ids can tell it is you, and, if you back your account, what backs it, never the coin itself; anything more only if you share it with that site',
                        },
                        {
                            k: 'no advertising',
                            v: 'no third-party ad identity, no behavioural ad targeting, no data sale — ever',
                        },
                        {
                            k: 'deletable',
                            v: 'you can delete your account on your Account page: your sign-in closes and your data is erased, except the few records named under identity & account deletion',
                        },
                    ],
                },
            ],
        },
        {
            id: 'what-oc-stores',
            heading: 'what orangecheck stores',
            hint: 'records, not private keys',
            blocks: [
                {
                    kind: 'para',
                    text: 'These are records orangecheck keeps about you on ochk.io, where you sign in, and on me.ochk.io. None of them is a private key: the keys orangecheck holds for you are named under [custody](/terms#custody) in the Terms.',
                },
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'account row',
                            v: 'an opaque account id (did:oc), optional display name and Nostr npub, which of our sites you first signed up through, and timestamps. No password hash, no private key, no mnemonic.',
                        },
                        {
                            k: 'how you sign in',
                            v: 'a Bitcoin address you prove with a signature, stored as is (it is already public on-chain); or, for an email code, Google or GitHub, the email address, encrypted, with a keyed hash of it so we can find your account. An unkeyed hash of it is kept beside them until a planned change removes it: anyone holding a copy of the database could test a list of addresses against that one. For Google or GitHub we also store that provider’s id for your account, unencrypted, so a changed email still reaches the same account.',
                        },
                        {
                            k: 'passkeys',
                            v: 'for each passkey you add: its credential id and public key, the label you give it, the kind of authenticator and the transports it reported, whether it checked it was you, a use counter, and when it was added, last used and removed.',
                        },
                        {
                            k: 'session record',
                            v: 'a hash of the session token, the session’s id, the account id, the user-agent of the device that opened it, and timestamps. Sessions opened in the same browser share a roster id, so we can tell which of your accounts were signed in from it. The token itself lives only in your browser.',
                        },
                        {
                            k: 'a coin backing your account',
                            v: 'if you back your account with a coin: its address, outpoint and amount, the block height it confirmed at, the backing message you signed and your signature, and when we last found it unspent, or saw it released or spent. Earlier backings stay with your account. What a site learns of it is under what sites get.',
                        },
                        {
                            k: 'OC Chat devices',
                            v: 'for each chat.ochk.io device ochk.io vouches for: its device and Nostr public keys, when it vouched, and the sign-in that asked (the session’s id and its roster id); for a device you revoke, the signed revocation, which is also published to Nostr relays.',
                        },
                        {
                            k: 'sign-in log',
                            v: 'each sign-in and each identity you link or remove, with the IP address and user-agent at the time, kept for security; the IP address is cleared after 90 days.',
                        },
                        {
                            k: 'event envelopes',
                            v: 'per billable event: a content-addressed, signed record of what was authorized, by whom, and the fee breakdown. Used to credit what you earn.',
                        },
                        {
                            k: 'custody-state envelopes',
                            v: 'a record of each change in how your account is custodied, kept on your own identity timeline. None is made while the system is in testing.',
                        },
                        {
                            k: 'site sign-ins',
                            v: 'which live sites you signed in to or shared data with through orangecheck, and when. A site can name you as the person who earned for an event only once this record exists. No site sees it, and it is erased with your account or with that site\'s project.',
                        },
                        {
                            k: 'guardian applications',
                            v: 'an application to run a guardian, made through ochk.app or by email to apply@ochk.io, holds your answers to the operator questionnaire, which asks, among other things, for a public handle, the name of the person or organisation that will run the guardian, its jurisdiction, a public contact channel, a key fingerprint and two references. Through ochk.app it can also hold an optional handle and email address that only the reviewer sees, for the decision. The answers are held for the review. Two places publish from an application, to anyone: the operator registry at me.ochk.io/api/operator/registry lists the operator key of every accepted application, the operator id made from that key, and when it was accepted, whether or not it holds a seat; and a federation charter lists the operator key of each seated guardian. Nothing else from an application is published yet. Nothing is checked against an ID.',
                        },
                        {
                            k: 'messages you send us',
                            v: 'the contact form at ochk.app/contact sends your email address, an optional name, the topic you pick and your message to our inbox through our email provider (Resend). They are kept only as long as we need them to reply',
                        },
                        {
                            k: 'public anchors',
                            v: 'an OpenTimestamps proof over each envelope’s hash, and a salted commitment to each envelope on Nostr. Public by design, and neither names you, the site or the amount. The envelope itself is served only to whoever holds its id. A drop’s manifest is published in full: it names the site’s project, the drop’s label and window, how many events and people it counted, its fees and what its recipients were paid in all, and no person.',
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
                    text: 'Each site gets its own subject id for events: a **scoped subject**, derived from your account and that site’s project key, so the site recognizes you when you return. But signing in gives every site the same orangecheck id (did:oc), so sites that compare ids can tell it is you. If you back your account with a coin, signing in also tells the site the amount and age floors the coin meets, when it was last checked, and a number for that coin that differs from site to site (all *.ochk.io sites share one); never the coin, its address or its amount.',
                },
                {
                    kind: 'para',
                    text: 'Anything more, a site receives only if you **share it** with that site. Each share is opt-in, for one site, and revocable at any time from your account. A site can ask for:',
                },
                {
                    kind: 'bullets',
                    items: [
                        { k: 'your Bitcoin address', v: 'the address you added to your account' },
                        { k: 'your email', v: 'the email address you added to your account' },
                        {
                            k: 'your activity',
                            v: 'six numbers, each shared on its own, none naming an app: how many events count for you across every app, how many of those you did yourself rather than an agent acting for you, the sats apps have paid you in all, how many apps have recorded events for you, when your first event was, and on how many days you have been active',
                        },
                        {
                            k: 'your statements, counted',
                            v: 'four numbers about the statements other apps have made about you: how many, how many good, from how many apps, and how many cautions',
                        },
                        {
                            k: 'your statements',
                            v: 'the statements you choose, each in full: which app made it, what it says and when it ends. A statement you refused is never shared',
                        },
                    ],
                },
                {
                    kind: 'para',
                    text: 'No share gives a site your balance, your site sign-ins or your events on other sites. Only your statements name another app, with what it said about you.',
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
                    text: 'orangecheck’s billing engine necessarily knows who earned what across integrating sites — that join is how the right wallet is credited. Today that linkage exists in plain storage on me.ochk.io infrastructure; orangecheck commits, as a **policy** matter enforced by access controls and audit logging, not to build cross-site behavioural profiles. A per-integrator blinded-identifier design that removes the linkage architecturally is active research and not yet shipped. We disclose this honestly rather than overclaim.',
                },
            ],
        },
        {
            id: 'cookies',
            heading: 'cookies',
            blocks: [
                {
                    kind: 'para',
                    text: 'On ochk.app, these cookies of its own, each set for ochk.app alone. The `__Host-` ones are Secure and SameSite=Lax, and HttpOnly, so no page script can read them, unless said otherwise.',
                },
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'your session',
                            v: '`__Host-oc_session`: the sign-in token of the account you are using, bound to ochk.app; it cannot sign you in anywhere else. Kept as long as the token is valid.',
                        },
                        {
                            k: 'other accounts',
                            v: '`__Host-oc_also_0`, `__Host-oc_also_1` and `__Host-oc_also_2`: the sign-in tokens of up to three other accounts signed in in this browser, so you can switch to one. Each is kept as long as its token is valid, and cleared when that account signs out.',
                        },
                        {
                            k: 'active account',
                            v: '`__Host-oc_active`: the did:oc of the account you are using, so the page can show that account’s places before they load. It is not HttpOnly: ochk.app’s own page script reads it. Kept as long as the session.',
                        },
                        {
                            k: 'google or github sign-in',
                            v: '`__Host-oc_oauth`: kept for at most ten minutes while you sign in with Google or GitHub, then deleted.',
                        },
                        {
                            k: 'sign-in handoff',
                            v: '`__Host-oc_handoff_guard`, `__Host-oc_handoff_` followed by the sign-in’s state, and `__Host-oc_to_io`: each kept for at most two minutes while a sign-in passes between ochk.app and ochk.io.',
                        },
                        {
                            k: 'logo',
                            v: '`oc_logo`: which of our two logos you chose, set only when you open a page with `?logo=` in its address and kept for a year; `?logo=classic` deletes it.',
                        },
                    ],
                },
                {
                    kind: 'para',
                    text: 'ochk.app also keeps these in your browser, outside cookies. Your browser sends none of them with its requests; ochk.app’s scripts read them in the page.',
                },
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'local storage',
                            v: 'your light or dark choice, under `theme`; the code tab you last picked; your alert switches on the account page and, on the balance page, when and where to suggest moving your balance, as this browser last saw them; the setup steps you ticked, in the quickstart and on each of your projects’ pages; and, for each account signed in here, which of its areas it could open when last checked, so a reload draws them at once. Every page still checks on the server.',
                        },
                        {
                            k: 'each tab',
                            v: 'what a sign-in, a sign-out, a claim, a check or a write in progress needs, until the tab closes.',
                        },
                        {
                            k: 'IndexedDB',
                            v: 'only if you make, restore or import an operator key on the operator page: the key pair, its operator id, when it was made, whether it was made in a browser or imported from the kit, and the version of the record, under `oc-operator-key`, kept for that account until you delete it there. No request carries the private key; ochk.app’s scripts read it to sign your operator actions, and show it to you only when you ask.',
                        },
                    ],
                },
                {
                    kind: 'para',
                    text: 'Page analytics on ochk.app use two counters, neither of which sets a cookie. orangecheck’s own counter at insights.ochk.io counts a visit by a hash salted daily; the salt is deleted after 48 hours, and your IP address and browser string are never stored. Our operations dashboard at overlook.technology keeps each page’s path, except pages whose address can name a person or a project, where you came from and any campaign tags, your country, region and city, and your device, browser and operating system. It counts a visitor by a hash of your IP address and browser salted daily, deletes each salt within two days, and never stores your IP address or browser string. To opt out of overlook.technology, open any page with `?ov_ignore=1`; that choice is kept in your browser’s local storage.',
                },
                {
                    kind: 'para',
                    text: 'On me.ochk.io, whichever of the cookies shared across ochk.io’s sites (Domain=.ochk.io) your browser holds. `oc_session` — the Ed25519-signed session token issued by ochk.io (HttpOnly, Secure, SameSite=None). `oc_theme`, `oc_skin`, `oc_motion` and `oc_logo` — your dark/light, appearance, reduced-motion and logo preferences, not auth-bearing. Of these, me.ochk.io sets only `oc_logo`, when you open one of its pages with `?logo=` in the address. No tracking cookies, no advertising IDs, no third-party pixels. Page analytics on me.ochk.io use two cookie-free counters, each sent the page’s origin and path and nothing more of its address than campaign tags: [Plausible](https://plausible.io/privacy) and the same orangecheck counter as on ochk.app.',
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
                        'Credit what you earn to the correct account and wallet',
                        'Detect and prevent sybil farming, wash-trading, and abuse',
                        'Operate sign-in and verification across the orangecheck family',
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
                            v: 'retained as the canonical earnings and custody-state record until your account is deleted; their hashes on Bitcoin and commitments on Nostr are immutable',
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
                            v: 'deleted, with your sign-in identities, passkeys, sessions, sign-in log, coin backings and OC Chat device records, when your account-deletion request completes; anchored and published data cannot be deleted by anyone',
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
                    text: 'HTTPS in transit; emails stored encrypted, beside the hashes named under what orangecheck stores; access to production data is allowlisted and audit-logged. No method of storage is perfectly secure — we use reasonable measures but do not warrant security; see the [Terms of Service](/terms). If we become aware of a breach of personal data we hold, we will notify affected users and any competent supervisory authority as required by applicable law.',
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
                    text: 'On [your Account page](/me/account#delete) you can delete your account. A person completes the request, and we aim to do that within 48 hours: an alert tells us when one has waited a day. Completing it closes your sign-in, so signing in again starts a new account, and erases your data on ochk.io, me.ochk.io, vault, chat and cosign, except a few records. Payment records keep their amounts and times for accounting, and our audit log and your deletion request stay, without the reason you gave. We keep a record that your account was deleted, out of public view, so sessions you already had stop working and the deletion can be shown. Each keeps your account only as a keyed id, or not at all, so the record by itself doesn\'t say whose account it was. On cosign, your messages in conversations with other people and the reports you filed stay, with your account taken off them. Backups roll off within 30 days, and copies cached by our CDN expire within a day. Deleting does not pay out sats orangecheck holds for you. While payouts are in testing there is no cash-out to start yourself: if your balance is above zero, [contact us](/contact) before you delete, and we settle it by hand first. If you run a guardian, you can delete only once your operator key holds no seat or hosted guardian, has finished any exit, created no federation that still exists, and is owed nothing. Charter signatures, incidents and amendment proposals the key signed stay public under the key, with what you wrote in them; exit records and machine reports stay visible to that federation\'s guardians and to us. Hashes anchored to Bitcoin and records published to Nostr cannot be deleted by anyone. me.ochk.io\'s own anchors name no one, but attestations, polls, pledges, stamps and a chat listing you published carry your Bitcoin address.',
                },
            ],
        },
        {
            id: 'site-made-accounts',
            heading: 'an account a site made for you',
            blocks: [
                {
                    kind: 'para',
                    text: 'A site that signs you in its own way can use orangecheck Connect to make an orangecheck account for you. For that account orangecheck keeps a hash of the id the site gave you, never the id; a keyed hash of your email address if the site sent one, never the address; when the account was made; whether the site said you agreed to earn with it; and what it earned, if the site pays. It keeps no sign-in times, because the account has no sign-in of its own. Until you agree, through the site or by claiming it, the account is for sign-in only and earns nothing.',
                },
                {
                    kind: 'para',
                    text: 'You can claim it on ochk.app with a link the site gives you, or with an email address the site verified and you hold. It then becomes part of your own account, and deleting your account deletes it. The site can delete it too, for example when you close your account with that site, unless it holds earnings: those stay yours until you claim them. After a deletion orangecheck keeps only a hash of the id the site gave you, with the site\'s app id, so the site cannot quietly make the account again; it can only when you agree again.',
                },
            ],
        },
        privacyTransfers,
        privacyRegional,
        privacyChildren,
        privacyChanges,
    ],
    summary:
        'summary: no kyc, no pii required, and what orangecheck keeps about you, who sees it, and how it is deleted.',
};

export const meProfile = { terms, privacy };
