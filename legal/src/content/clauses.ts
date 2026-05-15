/**
 * @orangecheck/legal — shared core clause library.
 *
 * Sections here are byte-identical across every profile once tokens resolve.
 * Profiles import them by name and arrange them around profile-specific
 * sections. Anything that genuinely differs per product (overview, fees,
 * data collection, money movement) is NOT here — it lives in the profile file.
 */

import type { Section } from '../types';

/* ───────────────────────────  TERMS  ─────────────────────────── */

export const eligibility: Section = {
    id: 'eligibility',
    heading: 'eligibility',
    blocks: [
        {
            kind: 'bullets',
            items: [
                'You must be at least 13 (or the age of digital consent in your jurisdiction)',
                'You must have the legal capacity to enter into a binding contract',
                'You must not be prohibited from using the Service under applicable law',
                'You must comply with all applicable laws and regulations',
            ],
        },
    ],
};

export const acceptableUse: Section = {
    id: 'acceptable-use',
    heading: 'acceptable use',
    hint: 'permitted · prohibited',
    blocks: [
        { kind: 'subhead', text: 'prohibited — illegal' },
        {
            kind: 'bullets',
            items: [
                'Any unlawful purpose',
                'Violating any applicable laws or regulations',
                'Fraud, money laundering, or financial crimes',
                'Infringing intellectual property rights',
            ],
        },
        { kind: 'subhead', text: 'prohibited — harmful' },
        {
            kind: 'bullets',
            items: [
                'Harass, threaten, or harm others',
                'Impersonate any person or entity',
                'Misrepresent your identity or affiliation',
                'Assert control of a Bitcoin address, identity, or handle you do not control',
            ],
        },
        { kind: 'subhead', text: 'prohibited — technical abuse' },
        {
            kind: 'bullets',
            items: [
                'Interfere with or disrupt the Service or its servers',
                'Attempt unauthorized access to any account, system, or data',
                'Automated scraping or harvesting without permission',
                'Introduce viruses, malware, or malicious code',
                'Circumvent security features or rate limits',
            ],
        },
        {
            kind: 'para',
            text: 'We reserve the right to investigate and act against anyone who violates these prohibitions — including terminating access and reporting to law enforcement.',
        },
    ],
};

export const intellectualProperty: Section = {
    id: 'intellectual-property',
    heading: 'intellectual property',
    blocks: [
        { kind: 'subhead', text: "[[ENTITY]]'s rights" },
        {
            kind: 'para',
            text: 'The Service and its content (excluding user-generated content) are protected by copyright, trademark, patent, and other IP laws — including the OrangeCheck name, logos, branding, site design, software, code, algorithms, and documentation.',
        },
        { kind: 'subhead', text: 'your license' },
        {
            kind: 'para',
            text: 'You receive a limited, non-exclusive, non-transferable, revocable license to access and use the Service subject to these Terms. You may not sell, sublicense, or use the Service to build a competing product.',
        },
        { kind: 'subhead', text: 'your content' },
        {
            kind: 'para',
            text: 'You retain ownership of content you submit (feedback, support requests, integration material). You grant us a worldwide, non-exclusive, royalty-free license to operate and improve the Service using that content. You are responsible for your content.',
        },
        { kind: 'subhead', text: 'open source' },
        {
            kind: 'para',
            text: 'OrangeCheck protocol specifications and the `@orangecheck/*` packages are released under open-source licenses (MIT unless stated otherwise). Those portions are governed by their own license terms; these Terms govern the hosted service.',
        },
    ],
};

export const limitationOfLiability: Section = {
    id: 'liability',
    heading: 'limitation of liability',
    hint: 'maximum legal cap',
    blocks: [
        {
            kind: 'callout',
            emphatic: true,
            text: 'TO THE FULLEST EXTENT PERMITTED BY APPLICABLE LAW, IN NO EVENT SHALL [[ENTITY]], ITS AFFILIATES, OFFICERS, DIRECTORS, EMPLOYEES, AGENTS, LICENSORS, CONTRIBUTORS, OR SUPPLIERS BE LIABLE FOR ANY DAMAGES ARISING OUT OF OR RELATED TO THE SERVICE, THESE TERMS, OR YOUR USE OR INABILITY TO USE THE SERVICE — WHETHER BASED ON CONTRACT, TORT (INCLUDING NEGLIGENCE), STATUTE, INDEMNITY, OR ANY OTHER LEGAL THEORY — EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGES.',
        },
        { kind: 'subhead', text: 'excluded damages' },
        {
            kind: 'para',
            text: 'This exclusion covers, without limitation: **direct**, indirect, incidental, special, consequential, exemplary, punitive, reliance, and cover damages; and **loss of Bitcoin, sats, cryptocurrency, tokens, assets, funds, private keys, seed phrases, passwords, data, profits, revenue, goodwill, reputation, business opportunity, anticipated savings, or use**.',
        },
        { kind: 'subhead', text: 'hard cap' },
        {
            kind: 'para',
            text: 'If, notwithstanding the above, a court of competent jurisdiction finds [[ENTITY]] liable to you, our **aggregate liability for all claims arising out of or related to the Service or these Terms is capped at the greater of (a) US$100 or (b) the total amount you actually paid [[ENTITY]] in the twelve (12) months immediately preceding the event giving rise to the claim**.',
        },
        { kind: 'subhead', text: 'essential purpose · jurisdictional floor' },
        {
            kind: 'para',
            text: 'These limitations form an essential basis of the bargain and apply even if a limited remedy fails of its essential purpose. Some jurisdictions do not allow certain exclusions; there, the limitations apply to the maximum extent permitted by law and the remainder of these Terms stays in full force.',
        },
    ],
};

export const indemnification: Section = {
    id: 'indemnification',
    heading: 'indemnification',
    blocks: [
        {
            kind: 'para',
            text: "You agree to indemnify, defend, and hold harmless [[ENTITY]] and its affiliates from any claims, liabilities, damages, losses, costs, and expenses (including reasonable attorneys' fees) arising from:",
        },
        {
            kind: 'bullets',
            items: [
                'Your use or misuse of the Service',
                'Your violation of these Terms',
                'Your violation of any law or regulation',
                'Your violation of any third-party rights',
                'Content you submit or share',
                'Your negligence or willful misconduct',
            ],
        },
    ],
};

export const termination: Section = {
    id: 'termination',
    heading: 'termination',
    blocks: [
        {
            kind: 'para',
            text: '**Your right:** stop using the Service at any time. **Our right:** suspend or terminate access with or without cause or notice — including if you violate these Terms, pose a security or legal risk, or we discontinue the Service.',
        },
        { kind: 'subhead', text: 'effect of termination' },
        {
            kind: 'bullets',
            items: [
                'Your right to use the Service immediately ceases',
                'We may delete your account and operational data (subject to legal requirements)',
                'Content already published to public networks (Bitcoin, Nostr) cannot be deleted by [[ENTITY]]',
                'Surviving sections: intellectual property, disclaimers, liability, indemnification, governing law, dispute resolution',
            ],
        },
    ],
};

export const changesToTerms: Section = {
    id: 'changes',
    heading: 'changes',
    blocks: [
        { kind: 'subhead', text: 'to the service' },
        {
            kind: 'para',
            text: 'We may modify, suspend, or discontinue the Service at any time, with or without notice. We are not liable for any modification, suspension, or discontinuation.',
        },
        { kind: 'subhead', text: 'to these terms' },
        {
            kind: 'bullets',
            items: [
                'We will update the "last updated" date',
                'For material changes, we will provide notice on the website (and by email where we hold one)',
                'Changes become effective when posted',
                'Continued use after changes constitutes acceptance',
            ],
        },
    ],
};

export const disputeResolution: Section = {
    id: 'disputes',
    heading: 'dispute resolution',
    hint: 'informal → arbitration',
    blocks: [
        { kind: 'subhead', text: 'informal resolution' },
        {
            kind: 'para',
            text: 'Before filing a claim, contact us at [[CONTACT]] to attempt to resolve the dispute informally.',
        },
        { kind: 'subhead', text: 'arbitration · class-action waiver · jury waiver' },
        {
            kind: 'callout',
            emphatic: true,
            text: 'DISPUTES ARISING OUT OF OR RELATED TO THESE TERMS OR THE SERVICE SHALL BE RESOLVED BY FINAL AND BINDING INDIVIDUAL ARBITRATION, EXCEPT AS SPECIFIED BELOW. YOU AND [[ENTITY]] EXPRESSLY WAIVE THE RIGHT TO A TRIAL BY JURY AND THE RIGHT TO PARTICIPATE IN ANY CLASS, COLLECTIVE, CONSOLIDATED, MASS, OR REPRESENTATIVE ACTION. ARBITRATION IS ON AN INDIVIDUAL BASIS ONLY.',
        },
        {
            kind: 'bullets',
            items: [
                'Administered by the American Arbitration Association under its then-current Commercial or Consumer Arbitration Rules (whichever applies)',
                'Seat of arbitration: [[ARBITRATION_SEAT]] — or, at either party’s election, conducted remotely by video',
                'Single neutral arbitrator; decision final and binding, enforceable in any court of competent jurisdiction',
                'The arbitrator — not any court — decides threshold questions of arbitrability, including the validity and scope of this clause',
            ],
        },
        { kind: 'subhead', text: 'exceptions to arbitration' },
        {
            kind: 'bullets',
            items: [
                'Small-claims court actions (if eligible and filed individually)',
                'Injunctive or equitable relief to protect intellectual property or confidential information',
                'Any claim that cannot lawfully be arbitrated under applicable law',
            ],
        },
        { kind: 'subhead', text: 'one-year limit to bring claims' },
        {
            kind: 'para',
            text: 'To the fullest extent permitted by law, any claim arising out of or relating to the Service or these Terms must be commenced **within one (1) year** after it accrues, or it is permanently barred.',
        },
        { kind: 'subhead', text: 'opt-out of arbitration' },
        {
            kind: 'para',
            text: 'You may opt out by sending written notice to [[CONTACT]] within 30 days of first using the Service, including your name, the date you first used the Service, and a clear statement that you wish to opt out. Opting out does not affect the class-action or jury-trial waivers.',
        },
        { kind: 'subhead', text: 'governing law' },
        {
            kind: 'para',
            text: 'These Terms are governed by the laws of the State of [[GOVERNING_LAW]], without regard to conflict-of-law principles, and, where applicable, the U.S. Federal Arbitration Act (9 U.S.C. §§ 1–16). For users in the EEA, UK, or Switzerland, mandatory consumer-protection laws of your country of residence may apply and nothing here overrides those rights.',
        },
        { kind: 'subhead', text: 'entity of record' },
        {
            kind: 'callout',
            text: 'OrangeCheck is, at the date of this document, operated as the unincorporated project "[[ENTITY_LONG]]". References to "[[ENTITY]]" mean that project and the operators acting on its behalf; upon formation of a formal legal entity, that entity becomes the party of record and these Terms — including the arbitration and governing-law provisions — bind it as successor without further notice.',
        },
    ],
};

export const miscellaneous: Section = {
    id: 'miscellaneous',
    heading: 'miscellaneous',
    blocks: [
        {
            kind: 'bullets',
            items: [
                {
                    k: 'entire agreement',
                    v: 'these terms + the privacy policy are the entire agreement and supersede any prior agreement on the same subject',
                },
                {
                    k: 'severability',
                    v: 'if a provision is invalid or unenforceable it is severed and the remainder stays in full force',
                },
                {
                    k: 'waiver',
                    v: 'failure to enforce a provision is not a waiver of the right to enforce it later',
                },
                {
                    k: 'assignment',
                    v: 'you may not assign these terms without our consent; we may assign freely in a merger, acquisition, or sale of assets',
                },
                {
                    k: 'no agency',
                    v: 'nothing here creates a partnership, joint venture, employment, agency, or fiduciary relationship',
                },
                {
                    k: 'force majeure',
                    v: 'we are not liable for delays or failures caused by events beyond our reasonable control — including network failures, Nostr relay outages, Bitcoin network conditions, government action, or natural disaster',
                },
                {
                    k: 'notices',
                    v: 'to you via email, the Service, or the website; to us at [[CONTACT]]',
                },
                {
                    k: 'electronic acceptance',
                    v: 'your use of the Service is electronic acceptance of these terms under applicable e-signature laws',
                },
            ],
        },
        { kind: 'subhead', text: 'sanctions, export controls, and prohibited jurisdictions' },
        {
            kind: 'para',
            text: 'You represent and warrant that you are not, and are not acting on behalf of, any person or entity that is:',
        },
        {
            kind: 'bullets',
            items: [
                'Located in, organized under the laws of, or ordinarily resident in any country or territory subject to comprehensive U.S., U.N., E.U., or U.K. sanctions',
                "Identified on the U.S. Treasury OFAC Specially Designated Nationals list, Consolidated Sanctions List, or any other U.S. government restricted-party list",
                'Identified on any U.K. HMT, E.U., U.N., or other applicable consolidated sanctions list',
                'Otherwise subject to a sanctions, export-control, or anti-terrorism restriction that would prohibit your use of the Service',
            ],
        },
        {
            kind: 'para',
            text: 'You agree to comply with all applicable export-control laws, including the U.S. Export Administration Regulations. A breach of this section is a material breach of these Terms.',
        },
    ],
};

/* ───────────────────────────  PRIVACY  ─────────────────────────── */

export const privacyRights: Section = {
    id: 'your-rights',
    heading: 'your rights',
    hint: 'access · correction · deletion',
    blocks: [
        {
            kind: 'bullets',
            items: [
                {
                    k: 'access & portability',
                    v: 'request a copy of your personal information in a machine-readable format',
                },
                {
                    k: 'correction',
                    v: 'request correction of inaccurate or incomplete information',
                },
                {
                    k: 'deletion',
                    v: 'request deletion of personal information we hold (data published to public networks cannot be deleted by us — see retention)',
                },
                {
                    k: 'objection',
                    v: 'object to or restrict processing in certain circumstances',
                },
                {
                    k: 'withdraw consent',
                    v: 'withdraw consent where consent is the legal basis for processing',
                },
            ],
        },
        { kind: 'para', text: 'To exercise any right, email [[PRIVACY_CONTACT]]. We respond within 30 days.' },
    ],
};

export const privacyRegional: Section = {
    id: 'regional-rights',
    heading: 'regional rights',
    hint: 'ccpa · gdpr · uk · other',
    blocks: [
        { kind: 'subhead', text: 'california (ccpa / cpra)' },
        {
            kind: 'bullets',
            items: [
                'Right to know the categories of personal information collected',
                'Right to delete and to correct your personal information',
                'Right to opt out of sale or sharing — we do not sell or share personal information',
                'Right to limit use of sensitive personal information — we do not collect sensitive PI as defined by the CPRA',
                'Right to non-discrimination for exercising your rights',
            ],
        },
        { kind: 'subhead', text: 'europe (gdpr) & united kingdom (uk gdpr)' },
        {
            kind: 'bullets',
            items: [
                {
                    k: 'legal basis',
                    v: 'consent, contract performance, legitimate interests (security, abuse prevention, service improvement), and legal obligations',
                },
                {
                    k: 'your rights',
                    v: 'access, rectification, erasure, restriction, portability, objection, and withdrawal of consent',
                },
                {
                    k: 'supervisory authority',
                    v: 'right to lodge a complaint with your local EU/EEA data-protection authority, or the UK ICO',
                },
                {
                    k: 'eu/uk representative',
                    v: 'if and when required, we will designate an Article 27 representative and publish the details here',
                },
            ],
        },
        { kind: 'subhead', text: 'other jurisdictions' },
        {
            kind: 'para',
            text: 'If you reside in a jurisdiction with a comprehensive privacy law — including Brazil (LGPD), Canada (PIPEDA / Law 25), Australia, Japan (APPI), South Korea (PIPA), Switzerland (FADP), or any U.S. state privacy law — you have the equivalent rights of access, correction, deletion, portability, and objection. Email [[PRIVACY_CONTACT]] and we will honour applicable rights under the law of your residence.',
        },
    ],
};

export const privacyChildren: Section = {
    id: 'childrens-privacy',
    heading: "children's privacy",
    blocks: [
        {
            kind: 'para',
            text: '[[PRODUCT]] is not intended for children under 13 (or the applicable age of digital consent in your jurisdiction). We do not knowingly collect personal information from children. If you believe we have, email [[PRIVACY_CONTACT]] immediately and we will delete it.',
        },
    ],
};

export const privacyTransfers: Section = {
    id: 'international-transfers',
    heading: 'international transfers',
    blocks: [
        {
            kind: 'para',
            text: 'OrangeCheck is operated from the United States. If you access [[PRODUCT]] from elsewhere, your information may be transferred to, stored, and processed in the US or other countries where our service providers operate. For users in the EEA, UK, or Switzerland, we rely on appropriate safeguards for international transfers.',
        },
    ],
};

export const privacyChanges: Section = {
    id: 'policy-changes',
    heading: 'changes to this policy',
    blocks: [
        {
            kind: 'bullets',
            items: [
                'We will update the "last updated" date above',
                'For material changes, we will provide prominent notice on the website',
                'Continued use after changes constitutes acceptance',
            ],
        },
    ],
};

/* Security disclosure content lives in the standalone `<SecurityDisclosure>`
 * component (src/security.tsx), not in the document engine. */
