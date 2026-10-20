import type { Meta, StoryObj } from '@storybook/react';
import { Anchor, Code2, FileCheck2, UserX } from 'lucide-react';

import { Button } from '../primitives';
import {
    Accent,
    Closing,
    EndpointList,
    FactBlock,
    FactRows,
    LegalDocument,
    ProofStrip,
    Section,
    SectionHeading,
    TextLink,
    type LegalSource,
} from './index';

const meta: Meta = { title: 'Blocks', parameters: { fullBleed: true } };
export default meta;

export const Headings: StoryObj = {
    name: 'Section heading',
    render: () => (
        <div>
            <Section space="sm">
                <SectionHeading
                    eyebrow="How it works"
                    title="Sign the hash, anchor the moment."
                    lead="Your browser hashes the file. Your wallet signs the hash. A Bitcoin block fixes when."
                    reveal={false}
                />
            </Section>
            <Section tone="ink" space="sm">
                <SectionHeading
                    onInk
                    eyebrow="Why it exists"
                    title={
                        <>
                            Provenance that outlives <Accent>the site</Accent>.
                        </>
                    }
                    lead="PGP proves who, OpenTimestamps proves when. A stamp proves both, and checks offline."
                    reveal={false}
                />
            </Section>
            <Section space="sm">
                <SectionHeading
                    align="center"
                    level={3}
                    eyebrow="For developers"
                    title="One package, three functions."
                    lead="Build an envelope, sign it, verify it."
                    reveal={false}
                />
            </Section>
        </div>
    ),
};

export const Facts: StoryObj = {
    name: 'Facts and endpoints',
    render: () => (
        <Section space="sm">
            <div className="flex flex-col gap-16">
                <FactBlock
                    id="proves"
                    title="What a stamp proves"
                    description="Three things at once. Take any one away and what is left is a tool that already exists."
                    aside={
                        <>
                            <TextLink href="https://github.com/orangecheck/oc-stamp-protocol/blob/main/SPEC.md">The spec</TextLink>
                            <TextLink href="https://github.com/orangecheck/oc-stamp-protocol/blob/main/WHY.md">Why</TextLink>
                        </>
                    }
                >
                    <FactRows
                        label="What a stamp proves"
                        columns={2}
                        rows={[
                            {
                                key: 'authorship',
                                title: 'Who signed it',
                                figure: 'BIP-322',
                                fields: [
                                    { label: 'What proves it', value: 'A signature by the address over the stamp’s canonical message.' },
                                    { label: 'Checked against', value: 'The address itself. No server is asked.' },
                                ],
                            },
                            {
                                key: 'priority',
                                title: 'When it existed',
                                figure: 'OTS',
                                fields: [
                                    { label: 'What proves it', value: 'An OpenTimestamps proof of the content hash.' },
                                    { label: 'Checked against', value: 'A Bitcoin block header.' },
                                ],
                            },
                            {
                                key: 'stake',
                                title: 'Bitcoin behind the signer',
                                figure: 'Optional',
                                fields: [
                                    { label: 'What proves it', value: 'An OC Attest attestation for the signing address.' },
                                    { label: 'Checked against', value: 'The coins it held at the signing height.' },
                                ],
                            },
                        ]}
                    />
                </FactBlock>
                <FactBlock
                    id="endpoints"
                    title="Check it from your own tools"
                    description="The same answers this site gives, as JSON. No key, no account."
                >
                    <EndpointList
                        label="Public endpoints"
                        items={[
                            { href: 'https://ochk.io/api/check', label: '/api/check', description: 'Whether an address holds enough bitcoin, for long enough.' },
                            { href: 'https://ochk.io/api/verify', label: '/api/verify', description: 'An attestation’s signature and backing, checked.' },
                            { href: 'https://ochk.io/api/discover', label: '/api/discover', description: 'Attestations published for an address.' },
                            { href: 'https://ochk.io/.well-known/jwks.json', label: '/.well-known/jwks.json', description: 'The key every sign-in token is signed with.' },
                        ]}
                    />
                </FactBlock>
            </div>
        </Section>
    ),
};

export const ProofAndClosing: StoryObj = {
    name: 'Proof strip and closing',
    render: () => (
        <div>
            <ProofStrip
                items={[
                    { icon: <Code2 />, label: 'Open source, MIT' },
                    { icon: <UserX />, label: 'No account to check one' },
                    { icon: <FileCheck2 />, label: 'Checks offline' },
                    { icon: <Anchor />, label: 'Anchored to Bitcoin' },
                ]}
            />
            <Closing
                title={
                    <>
                        Stamp your first <Accent>file</Accent>.
                    </>
                }
                lead="It takes a wallet and a few seconds. The file never leaves your browser."
                actions={
                    <>
                        <Button size="lg">Make a stamp</Button>
                        <Button size="lg" variant="secondary">
                            Read the spec
                        </Button>
                    </>
                }
            />
        </div>
    ),
};

/** Excerpted from the family's privacy policy in @orangecheck/legal, which renders as-is. */
const PRIVACY: LegalSource = {
    eyebrow: 'privacy',
    title: 'Privacy policy',
    description: 'How orangecheck handles data across the protocol sites. No account required, minimal collection.',
    effective: '2025-09-30',
    updated: '2026-10-19',
    preamble: [
        {
            kind: 'callout',
            text: 'This policy covers [ochk.io](https://ochk.io), the six protocol sites and the docs. ochk.app and vault.ochk.io publish their own.',
        },
    ],
    sections: [
        {
            id: 'principles',
            num: '01',
            heading: 'our principles',
            hint: 'non-custodial, minimal, transparent',
            blocks: [
                {
                    kind: 'bullets',
                    items: [
                        { k: 'non-custodial', v: 'we never take custody of your Bitcoin or keys; signing happens in your wallet or browser' },
                        { k: 'minimal collection', v: 'only what the service needs; no profiles, no cross-site tracking' },
                        { k: 'optional account', v: 'most of the service needs no sign-in, and sign-in never asks for a password' },
                    ],
                },
            ],
        },
        {
            id: 'what-we-dont-do',
            num: '02',
            heading: "what we don't do",
            blocks: [
                {
                    kind: 'bullets',
                    items: [
                        'No custody of funds and no access to private keys',
                        'No selling or renting of personal information, ever',
                        'No targeted advertising and no third-party trackers',
                    ],
                },
            ],
        },
        {
            id: 'information-we-collect',
            num: '03',
            heading: 'information we collect',
            hint: 'scoped, minimal',
            blocks: [
                { kind: 'subhead', text: 'information you provide' },
                {
                    kind: 'para',
                    text: '**Bitcoin addresses and signatures** are processed in your browser to make a proof; that data is public by design. **Messages you send us** reach our inbox through our email provider and are kept only as long as we need them to reply.',
                },
                { kind: 'callout', text: 'Ask us anything at [hello@ochk.io](mailto:hello@ochk.io).', emphatic: true },
            ],
        },
    ],
    summary: 'summary: we hold no keys, sell nothing, and keep only what the service needs.',
};

export const Legal: StoryObj = {
    name: 'Legal document',
    render: () => <LegalDocument doc={PRIVACY} />,
};
