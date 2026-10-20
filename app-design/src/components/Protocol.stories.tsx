import type { Meta, StoryObj } from '@storybook/react';
import { Anchor, Code2, FileCheck2, UserX } from 'lucide-react';

import { SiteFooter, SiteHeader } from '../chrome';
import { OCHK_IO_FOOTER, OCHK_IO_NAV } from '../family';
import { Button } from '../primitives';
import {
    Accent,
    AppGrid,
    Closing,
    CodeBlock,
    ComparisonTable,
    EndpointList,
    Faq,
    ProofStrip,
    ProtocolGrid,
    ProtocolHero,
    ProtocolNav,
    Section,
    SectionHeading,
    SignMessage,
    SpecCard,
    StepGrid,
    VerifyBox,
    VerifyReport,
    type ComparisonColumn,
    type ComparisonRow,
} from './index';

/* OC Stamp is the sample protocol: every block below is a part of ochk.io/stamp. */
const meta: Meta = { title: 'Protocol', parameters: { fullBleed: true } };
export default meta;

const ADDRESS = 'bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t';
const HASH = 'sha256:3f9a0c5e7d1b2a4c6e8f0a1b3c5d7e9f1a2b4c6d8e0f2a4b6c8d0e2f4a6bc21e';

const ENVELOPE = `{
  "v": 1,
  "kind": "stamp",
  "id": "86020d78db788237…a85eeb1c",
  "content": {
    "hash": "sha256:3f9a0c5e…4a6bc21e",
    "length": 482113,
    "mime": "application/pdf"
  },
  "signer": {
    "address": "bc1q9h7g…z5e3w7t",
    "alg": "bip322"
  },
  "signed_at": "2026-10-20T09:14:02Z",
  "ots": {
    "status": "confirmed",
    "block_height": 971632
  }
}`;

const MESSAGE = `oc-stamp:v1
address: ${ADDRESS}
content_hash: ${HASH}
content_length: 482113
content_mime: application/pdf
signed_at: 2026-10-20T09:14:02Z`;

const SYSTEMS: ComparisonColumn[] = [
    { key: 'stamp', label: 'OC Stamp', highlight: true },
    { key: 'pgp', label: 'PGP' },
    { key: 'ots', label: 'OpenTimestamps alone' },
    { key: 'c2pa', label: 'C2PA' },
    { key: 'nostr', label: 'Nostr note' },
    { key: 'eas', label: 'EAS (Ethereum)' },
];

const PROPERTIES: ComparisonRow[] = [
    {
        label: 'Who signed it',
        values: { stamp: 'Yes, a Bitcoin address', pgp: 'Yes, a PGP key', ots: 'No', c2pa: 'Yes, a certificate', nostr: 'Yes, an npub', eas: 'Yes, an Ethereum key' },
    },
    {
        label: 'When it existed',
        note: 'Fixed by a public chain.',
        values: { stamp: 'Yes, a Bitcoin block', pgp: 'No', ots: 'Yes, a Bitcoin block', c2pa: 'No', nostr: 'No', eas: 'Yes, on Ethereum' },
    },
    {
        label: 'Bitcoin behind the signer',
        values: { stamp: 'Yes, if attached', pgp: 'No', ots: 'No', c2pa: 'No', nostr: 'No', eas: 'Only token-gated' },
    },
    {
        label: 'Checks offline',
        values: { stamp: 'Yes', pgp: 'Partly', ots: 'Yes', c2pa: 'Needs a certificate chain', nostr: 'Partly', eas: 'No, needs a node' },
    },
    {
        label: 'Needs no one’s permission',
        values: { stamp: 'Yes', pgp: 'Partly', ots: 'Yes', c2pa: 'No', nostr: 'Yes', eas: 'Yes' },
    },
];

export const Grid: StoryObj = {
    name: 'Protocol grid',
    render: () => (
        <Section space="sm">
            <div className="flex flex-col gap-10">
                <SectionHeading
                    eyebrow="Protocols"
                    title="Six verbs, one order."
                    lead="Each is an open spec with test vectors, an SDK and its own tools."
                    reveal={false}
                />
                <ProtocolGrid />
            </div>
        </Section>
    ),
};

export const Apps: StoryObj = {
    name: 'Apps and public goods',
    render: () => (
        <Section space="sm">
            <div className="flex flex-col gap-14">
                <div className="flex flex-col gap-8">
                    <SectionHeading
                        eyebrow="Showcase apps"
                        title="Working apps, built on the protocols."
                        lead="Each one shows a protocol doing a real job."
                        reveal={false}
                        level={3}
                    />
                    <AppGrid group="app" />
                </div>
                <div className="flex flex-col gap-8">
                    <SectionHeading eyebrow="Public goods" title="Free, and read-only." level={3} reveal={false} />
                    <AppGrid group="public-good" />
                </div>
            </div>
        </Section>
    ),
};

export const Page: StoryObj = {
    name: 'Protocol page, OC Stamp',
    render: () => (
        <div className="min-h-screen">
            <SiteHeader
                family="home"
                nav={OCHK_IO_NAV.map((n) =>
                    n.label === 'Protocols'
                        ? { ...n, active: true, children: n.children?.map((c) => ({ ...c, active: c.label === 'stamp' })) }
                        : n
                )}
                actions={
                    <Button asChild size="sm">
                        <a href="https://ochk.app/signin">Sign in</a>
                    </Button>
                }
            />
            <main id="main-content">
                <div className="oca-container pt-2">
                    <ProtocolNav current="stamp" />
                </div>
                <ProtocolHero
                    protocol="stamp"
                    title={
                        <>
                            Prove who signed it, and <Accent>when</Accent>.
                        </>
                    }
                    lead="OC Stamp signs a file’s hash with a Bitcoin address and anchors it to a block. Anyone can check it offline, for good."
                    actions={
                        <>
                            <Button asChild>
                                <a href="https://stamp.ochk.io/create">Make a stamp</a>
                            </Button>
                            <Button asChild variant="secondary">
                                <a href="https://stamp.ochk.io/verify">Verify one</a>
                            </Button>
                        </>
                    }
                    art={<CodeBlock code={ENVELOPE} caption="stamp.json" />}
                />
                <ProofStrip
                    items={[
                        { icon: <Code2 />, label: 'Open source, MIT' },
                        { icon: <UserX />, label: 'No account to check one' },
                        { icon: <FileCheck2 />, label: 'Checks offline' },
                        { icon: <Anchor />, label: 'Anchored to Bitcoin' },
                    ]}
                />
                <Section>
                    <div className="flex flex-col gap-12">
                        <SectionHeading eyebrow="How it works" title="Sign the hash. Anchor the moment." />
                        <StepGrid
                            look="plain"
                            items={[
                                { title: 'Hash it', body: 'Your browser hashes the file. The file itself never leaves it.' },
                                { title: 'Sign it', body: 'Your wallet signs the hash with your Bitcoin address, as BIP-322 defines.' },
                                { title: 'Anchor it', body: 'OpenTimestamps puts the hash in a Bitcoin block, usually within a few hours.' },
                            ]}
                        />
                    </div>
                </Section>
                <Section tone="card" className="border-y border-border">
                    <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
                        <div className="flex flex-col gap-6 lg:col-span-5">
                            <SectionHeading eyebrow="Check one" title="Paste it, and see what holds." level={3} />
                        </div>
                        <div className="flex flex-col gap-5 lg:col-span-7">
                            <VerifyBox
                                action="https://stamp.ochk.io/verify"
                                label="Stamp id, envelope or link"
                                placeholder="86020d78db78…"
                                hint="Nothing you paste is stored."
                            />
                            <SpecCard protocol="stamp" version="1.0" license="MIT" vectors={5} />
                        </div>
                    </div>
                </Section>
                <Section>
                    <div className="flex flex-col gap-10">
                        <SectionHeading
                            eyebrow="Why it exists"
                            title="Every other tool proves one of these."
                            lead="A stamp proves who and when together, and anyone can check both without asking us."
                        />
                        <ComparisonTable label="OC Stamp compared" columns={SYSTEMS} rows={PROPERTIES} />
                    </div>
                </Section>
                <Section space="sm">
                    <div className="flex flex-col gap-8">
                        <SectionHeading eyebrow="For your own tools" title="The same answers, as JSON." level={3} />
                        <EndpointList
                            label="Public endpoints"
                            items={[
                                { href: 'https://ochk.io/api/verify', label: '/api/verify', description: 'An artifact’s signature and backing, checked.' },
                                { href: 'https://ochk.io/api/discover', label: '/api/discover', description: 'What has been published for an address.' },
                            ]}
                        />
                    </div>
                </Section>
                <Section space="sm">
                    <div className="grid grid-cols-1 gap-10 lg:grid-cols-12">
                        <div className="lg:col-span-4">
                            <SectionHeading eyebrow="Questions" title="Asked often." level={3} />
                        </div>
                        <Faq
                            className="lg:col-span-8"
                            items={[
                                { q: 'Does the file leave my browser?', a: 'No. Only its SHA-256 hash is signed and anchored.' },
                                { q: 'How long until it is anchored?', a: 'Usually a few hours: the calendars batch hashes into a Bitcoin transaction.' },
                                { q: 'Can a stamp be revoked?', a: 'No. A stamp is a fact about the past, and it stays true.' },
                                { q: 'Do I need an account?', a: 'No. A Bitcoin wallet signs it; anyone can check it without one.' },
                            ]}
                        />
                    </div>
                </Section>
                <Closing
                    title={
                        <>
                            Stamp your first <Accent>file</Accent>.
                        </>
                    }
                    actions={
                        <>
                            <Button size="lg">Make a stamp</Button>
                            <Button size="lg" variant="secondary">
                                Read the spec
                            </Button>
                        </>
                    }
                />
            </main>
            <SiteFooter columns={OCHK_IO_FOOTER} family legal fineprint="Open protocols with Bitcoin behind them." />
        </div>
    ),
};

export const Spec: StoryObj = {
    name: 'Spec card',
    render: () => (
        <Section space="sm">
            <div className="flex max-w-3xl flex-col gap-6">
                <SpecCard protocol="stamp" version="1.0" license="MIT" vectors={5} />
                <SpecCard protocol="stamp" version="1.0" license="MIT" size="sm" />
            </div>
        </Section>
    ),
};

export const Verify: StoryObj = {
    name: 'Verify box',
    render: () => (
        <Section space="sm">
            <div className="grid max-w-5xl grid-cols-1 gap-6 lg:grid-cols-2">
                <VerifyBox
                    action="https://stamp.ochk.io/verify"
                    title="Check a stamp"
                    description="Paste its id or a link to it."
                    label="Stamp id or link"
                    placeholder="86020d78db78…"
                />
                <VerifyBox
                    action="https://stamp.ochk.io/verify"
                    multiline
                    title="Check an envelope"
                    description="The whole JSON, as the signer gave it to you."
                    label="Envelope"
                    placeholder={'{ "v": 1, "kind": "stamp", … }'}
                    submitLabel="Verify envelope"
                />
            </div>
        </Section>
    ),
};

export const Compare: StoryObj = {
    name: 'Comparison table',
    render: () => (
        <Section space="sm">
            <ComparisonTable label="OC Stamp compared" columns={SYSTEMS} rows={PROPERTIES} />
        </Section>
    ),
};

export const Report: StoryObj = {
    name: 'Verify report',
    render: () => (
        <Section space="sm">
            <div className="flex max-w-3xl flex-col gap-8">
                <VerifyReport
                    verdict="good"
                    title={
                        <>
                            Signed by <span className="whitespace-nowrap">bc1q9h7g…z5e3w7t</span>, before block 971,632.
                        </>
                    }
                    summary="The signature is valid and the hash is in a Bitcoin block."
                    checks={[
                        { label: 'Envelope is well formed', state: 'ok', note: 'oc-stamp v1' },
                        { label: 'Id matches the content', state: 'ok' },
                        { label: 'Signed by the address', state: 'ok', note: 'BIP-322, native segwit' },
                        { label: 'Anchored to Bitcoin', state: 'ok', note: 'Block 971,632 · 20 Oct 2026, 10:02' },
                        { label: 'Bitcoin behind the signer', state: 'skipped', note: 'This stamp carries no attestation.' },
                    ]}
                    facts={[
                        { label: 'Content hash', value: HASH, mono: true },
                        { label: 'File', value: 'application/pdf · 482 KB' },
                        { label: 'Signed at', value: '20 Oct 2026, 09:14 UTC' },
                    ]}
                    notChecked={[
                        'That the file you have is the one that was stamped. Drop it here to compare.',
                        'Who controls the address today.',
                    ]}
                    actions={
                        <>
                            <Button variant="secondary" size="sm">
                                Download the envelope
                            </Button>
                            <Button variant="ghost" size="sm">
                                Check another
                            </Button>
                        </>
                    }
                />
                <VerifyReport
                    verdict="caution"
                    title="Signed, not yet anchored."
                    summary="The signature is valid. The timestamp proof is pending; it usually confirms within a few hours."
                    checks={[
                        { label: 'Envelope is well formed', state: 'ok' },
                        { label: 'Signed by the address', state: 'ok' },
                        { label: 'Anchored to Bitcoin', state: 'pending', note: 'Sent to four calendars at 09:14 UTC' },
                    ]}
                />
                <VerifyReport
                    verdict="caution"
                    title="Signed, with no timestamp yet."
                    summary="Signed by bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297. Nothing has been sent to a calendar, so nothing anchors it to a block."
                    checks={[
                        { label: 'Envelope is well formed', state: 'ok' },
                        { label: 'Signed by the address', state: 'ok', note: 'BIP-322, taproot' },
                        { label: 'Anchored to Bitcoin', state: 'none', note: 'This stamp carries no timestamp.' },
                        { label: 'Bitcoin behind the signer', state: 'none', note: 'No attestation is bound to it.' },
                    ]}
                />
                <VerifyReport
                    verdict="refused"
                    title="This stamp does not check out."
                    summary="The signature does not match the address in the envelope."
                    checks={[
                        { label: 'Envelope is well formed', state: 'ok' },
                        { label: 'Signed by the address', state: 'fail', note: 'E_BAD_SIGNATURE' },
                        { label: 'Anchored to Bitcoin', state: 'unchecked', note: 'Not checked after a failed signature.' },
                    ]}
                />
            </div>
        </Section>
    ),
};

export const Sign: StoryObj = {
    name: 'Sign a message',
    render: () => (
        <Section space="sm">
            <div className="max-w-xl rounded-[1.25rem] border border-border bg-card p-6 md:p-8">
                <SignMessage
                    lead="Sign the stamp with the address it names. Nothing is sent until you confirm."
                    address={ADDRESS}
                    message={MESSAGE}
                    wallets={
                        <>
                            <Button>Sign with Xverse</Button>
                            <Button variant="secondary">Sign with Leather</Button>
                        </>
                    }
                    submitLabel="Stamp it"
                    secondary={<Button variant="ghost">Back</Button>}
                    onSignature={() => undefined}
                />
            </div>
            {/* One 64-character id to sign: it wraps on a phone; Copy takes it exactly. A legacy signature is named. */}
            <div className="mt-8 max-w-xl rounded-[1.25rem] border border-border bg-card p-6 md:p-8">
                <SignMessage
                    lead="Sign the stamp's id with a legacy signature: this address's wallet cannot make a BIP-322 one."
                    address="1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2"
                    message="86020d78db788237e9f0c1b2a3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a85eeb1c"
                    scheme="legacy"
                    submitLabel="Stamp it"
                    onSignature={() => undefined}
                />
            </div>
        </Section>
    ),
};
