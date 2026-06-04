/**
 * @orangecheck/legal — `fleet` profile.
 *
 * fleet.ochk.io: enterprise managed infrastructure on top of OC Agent and
 * OC Pledge. B2B; bills via Stripe and Lightning; holds operator PII
 * (email, billing address) and an SLA commitment. Stubs cover billing, the
 * SLA document, sub-processor list, and the enterprise MSA / DPA.
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
    '**OrangeCheck Fleet is a commercial product operated by OrangeCheck**, available at fleet.ochk.io. It is distinct from the non-custodial OrangeCheck protocol sites. Where an Enterprise customer has executed a separate Master Services Agreement, that agreement controls; otherwise these Terms govern.';

const terms: DocSpec = {
    kind: 'terms',
    eyebrow: 'terms',
    title: 'Terms of service',
    description:
        'The terms governing use of OrangeCheck Fleet — enterprise managed infrastructure for OC Agent and OC Pledge. No custody of customer keys or funds.',
    metaTitle: 'Terms of Service — OrangeCheck Fleet',
    metaDescription:
        'Terms of service for OrangeCheck Fleet (fleet.ochk.io): enterprise managed infrastructure for OC Agent and OC Pledge. No custody of keys or funds.',
    effective: '2026-05-15',
    updated: '2026-05-15',
    preamble: [
        {
            kind: 'callout',
            emphatic: true,
            text: 'By accessing or using OrangeCheck Fleet, you agree to be bound by these Terms on behalf of yourself and any organization you represent. If you do not agree, do not use the Service. These Terms contain a binding-arbitration, class-action, and jury-trial waiver and important limitations on liability.',
        },
        { kind: 'callout', text: COMMERCIAL_NOTE },
    ],
    sections: [
        {
            id: 'overview',
            heading: 'overview',
            hint: 'what fleet is',
            blocks: [
                {
                    kind: 'para',
                    text: 'OrangeCheck Fleet is managed infrastructure for organizations deploying AI agents under the OC Agent and OC Pledge protocols. Fleet issues, scopes, and revokes agent delegations, records action receipts, and produces auditable evidence bundles.',
                },
                {
                    kind: 'para',
                    text: 'Fleet holds **no customer private keys, no customer funds, and no custodial wallet of any kind.** Signing happens in the customer’s wallet; bonded reputation stake is an attestation of unspent funds, never escrow. Fleet operates no token or points balance.',
                },
            ],
        },
        {
            id: 'accounts',
            heading: 'accounts & operators',
            blocks: [
                {
                    kind: 'para',
                    text: 'A customer account is operated by one or more authorized individuals. You are responsible for the acts and omissions of everyone you authorize, for keeping credentials secure, and for ensuring the individuals you authorize have authority to bind your organization.',
                },
            ],
        },
        {
            id: 'plans-billing',
            heading: 'plans, billing & payment',
            hint: 'stripe + lightning',
            blocks: [
                {
                    kind: 'para',
                    text: 'Fleet offers a free Community tier and paid Pro and Enterprise tiers. Paid tiers are billed in either Bitcoin (Lightning) or US dollars (card / ACH via Stripe, our payment processor).',
                },
                {
                    kind: 'stub',
                    text: 'The full commercial terms — current pricing, what each tier includes, the billing cycle, overage rates and metering, taxes, renewal and cancellation behavior, and the refund policy — are being finalized for publication. Current pricing is shown on /pricing. Card and ACH payments are processed by Stripe under Stripe’s own terms. This section will be completed following review by counsel.',
                },
            ],
        },
        {
            id: 'service-levels',
            heading: 'service levels',
            hint: 'uptime · support response',
            blocks: [
                {
                    kind: 'stub',
                    text: 'Fleet’s service-level commitments — target uptime, the support-response times by tier, the measurement methodology, exclusions, and any service credits — are being finalized and will be published as a referenced Service Level Agreement. Until then, support-response targets are described on /pricing. This section will be completed following review by counsel.',
                },
            ],
        },
        {
            id: 'customer-data',
            heading: 'customer data',
            blocks: [
                {
                    kind: 'para',
                    text: 'Fleet holds operator account metadata (email, billing address, plan tier), the public Bitcoin addresses you bind agents to, OC Agent action envelopes, OpenTimestamps proofs, and operational logs (90-day retention). Fleet does **not** hold raw action inputs beyond hashes unless you opt in. Processing of personal data is described in the [Privacy Policy](/privacy).',
                },
                {
                    kind: 'stub',
                    text: 'Enterprise customers that process personal data through Fleet may require a Data Processing Agreement. A standard DPA, including the sub-processor list and the international-transfer mechanism, is being finalized and will be made available to Enterprise customers. This section will be completed following review by counsel.',
                },
            ],
        },
        acceptableUse,
        intellectualProperty,
        {
            id: 'enterprise-msa',
            heading: 'enterprise agreements',
            blocks: [
                {
                    kind: 'stub',
                    text: 'Enterprise-tier customers may execute a Master Services Agreement that supplements or supersedes these Terms — covering negotiated SLAs, the DPA, security commitments, self-hosting, indemnities, and liability terms specific to the engagement. The standard MSA template is being finalized. Where an executed MSA exists, it controls over any conflicting provision of these Terms. This section will be completed following review by counsel.',
                },
            ],
        },
        {
            id: 'confidentiality',
            heading: 'confidentiality',
            blocks: [
                {
                    kind: 'para',
                    text: 'Each party may receive non-public information of the other. The receiving party will use it only to perform under these Terms, protect it with at least reasonable care, and not disclose it except to personnel and contractors bound by comparable obligations. This does not apply to information that is public, independently developed, or rightfully received from a third party.',
                },
            ],
        },
        {
            id: 'disclaimers',
            heading: 'disclaimers & warranties',
            hint: 'as-is · compliance posture',
            blocks: [
                {
                    kind: 'callout',
                    emphatic: true,
                    text: 'EXCEPT AS EXPRESSLY STATED IN AN EXECUTED MASTER SERVICES AGREEMENT, THE SERVICE IS PROVIDED "AS IS" AND "AS AVAILABLE", WITH ALL FAULTS AND WITHOUT WARRANTY OF ANY KIND. TO THE MAXIMUM EXTENT PERMITTED BY LAW, ORANGECHECK DISCLAIMS ALL WARRANTIES, EXPRESS, IMPLIED, AND STATUTORY — INCLUDING MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, TITLE, NON-INFRINGEMENT, AND ACCURACY.',
                },
                {
                    kind: 'para',
                    text: 'Any compliance certification described as "in progress" (including SOC 2) is a statement of intent, not a warranty, until completed and the report issued. Fleet does not provide legal, financial, or regulatory-compliance advice.',
                },
            ],
        },
        limitationOfLiability,
        indemnification,
        eligibility,
        {
            id: 'termination',
            heading: 'termination',
            blocks: [
                {
                    kind: 'para',
                    text: '**Your right:** stop using Fleet and cancel a paid plan as described in the billing terms. **Our right:** suspend or terminate access for non-payment, breach, or legal or security risk. On termination you may export your action envelopes and audit bundles, which verify offline independently of Fleet. The confidentiality, disclaimer, liability, indemnification, governing-law, and dispute provisions survive.',
                },
            ],
        },
        changesToTerms,
        disputeResolution,
        miscellaneous,
    ],
    summary:
        'summary: managed agent infrastructure with no custody of customer keys or funds. billing, sla, dpa, and the enterprise msa are being finalized — see the marked sections.',
};

const privacy: DocSpec = {
    kind: 'privacy',
    eyebrow: 'privacy',
    title: 'Privacy policy',
    description:
        'How OrangeCheck Fleet handles personal data — operator account information and the metadata required to run managed agent infrastructure. No customer keys, no customer funds.',
    metaTitle: 'Privacy Policy — OrangeCheck Fleet',
    metaDescription:
        'OrangeCheck Fleet privacy policy. Operator account data and orchestration metadata only; no customer keys, no customer funds, no raw action inputs.',
    effective: '2026-05-15',
    updated: '2026-05-15',
    preamble: [
        {
            kind: 'callout',
            text: 'This policy covers personal data OrangeCheck processes as a **controller** for the Fleet account relationship — operator and billing information. Where Fleet processes personal data **on a customer’s behalf** as a processor, the customer’s Data Processing Agreement governs that processing.',
        },
    ],
    sections: [
        {
            id: 'what-we-collect',
            heading: 'information we collect',
            blocks: [
                {
                    kind: 'bullets',
                    items: [
                        {
                            k: 'operator account data',
                            v: 'the email address and name of authorized operators',
                        },
                        {
                            k: 'billing information',
                            v: 'billing address and plan tier; card and ACH details are collected and held by Stripe, our payment processor, not by OrangeCheck',
                        },
                        {
                            k: 'orchestration metadata',
                            v: 'public Bitcoin addresses you bind agents to, OC Agent action envelopes, and OpenTimestamps proofs',
                        },
                        {
                            k: 'operational logs',
                            v: 'request and SLA-accounting logs sufficient for abuse response, retained 90 days',
                        },
                    ],
                },
                {
                    kind: 'para',
                    text: 'Fleet does not collect customer private keys, customer funds, or raw action inputs beyond hashes (unless a customer opts in).',
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
                        'Provision and operate managed agent infrastructure',
                        'Bill paid plans and account for service levels',
                        'Detect and respond to abuse and security incidents',
                        'Provide support and communicate service notices',
                    ],
                },
            ],
        },
        {
            id: 'sub-processors',
            heading: 'sub-processors',
            blocks: [
                {
                    kind: 'para',
                    text: 'Fleet relies on a small set of sub-processors — including a payment processor (Stripe) and hosting and infrastructure providers.',
                },
                {
                    kind: 'stub',
                    text: 'The complete, current sub-processor list — each provider, its role, and its processing location — together with the mechanism for advance notice of changes is being finalized and will be published and referenced from the Data Processing Agreement. This section will be completed following review by counsel.',
                },
            ],
        },
        {
            id: 'cookies',
            heading: 'cookies & analytics',
            blocks: [
                {
                    kind: 'para',
                    text: 'Essential cookies for authentication and a theme preference. Page analytics use [Plausible](https://plausible.io/privacy) — cookie-free, no PII, aggregate only — alongside our own first-party, cookieless analytics (oc insights): no cookies, no cross-site identity, IP hashed and immediately discarded, and Do-Not-Track / Global Privacy Control honored. No advertising or tracking cookies.',
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
                            k: 'operational logs',
                            v: 'retained 90 days, then auto-deleted',
                        },
                        {
                            k: 'account & billing records',
                            v: 'retained for the life of the account and as required for accounting, tax, and audit obligations',
                        },
                        {
                            k: 'action envelopes',
                            v: 'retained for the life of the account; exportable by the customer at any time',
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
                    text: 'HTTPS in transit, access controls on production data, and a bounded blast radius by design — Fleet structurally cannot hold customer keys or funds. A SOC 2 examination is in progress; until the report is issued it is a statement of intent, not a warranty. We use reasonable measures but do not warrant security; see the [Terms of Service](/terms). We notify affected customers and any competent authority of a personal-data breach as required by applicable law.',
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
        'summary: operator and billing data plus orchestration metadata; no customer keys, no customer funds. card payments are held by stripe. dpa and sub-processor list are being finalized.',
};

export const fleetProfile = { terms, privacy };
