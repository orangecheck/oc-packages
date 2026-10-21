import type { Meta, StoryObj } from '@storybook/react';
import { Anchor, BookOpen, FileCheck2, Terminal } from 'lucide-react';

import { DocsShell, type DocsNavSection } from '../chrome';
import { createMdxComponents } from '../mdx';
import { Button } from '../primitives';
import {
    ApiTable,
    Breadcrumbs,
    Callout,
    CardGrid,
    CodeBlock,
    CodeTabs,
    Diagram,
    DocsPager,
    InstallTabs,
    LinkCard,
    OnThisPage,
    ProtocolGrid,
    SearchDialog,
    SpecCard,
    Step,
    Steps,
    TextLink,
    type SearchGroup,
} from './index';

/* OC Stamp's docs are the sample: the quickstart, its SDK, its envelope. */
const meta: Meta = { title: 'Docs', parameters: { fullBleed: true } };
export default meta;

const M = createMdxComponents({ mermaid: () => import('mermaid') });

const NAV: DocsNavSection[] = [
    {
        label: 'Getting started',
        items: [
            { href: '/', label: 'Overview' },
            { href: '/getting-started/which-protocol', label: 'Which protocol do I need?' },
            { href: '/getting-started/quickstart', label: 'Quickstart' },
        ],
    },
    {
        label: 'OC Attest',
        items: [
            { href: '/attest', label: 'Overview' },
            { href: '/attest/quickstart', label: 'Quickstart' },
            { href: '/attest/gate', label: 'Gate a route' },
        ],
    },
    {
        label: 'OC Stamp',
        items: [
            { href: '/stamp', label: 'Overview' },
            { href: '/stamp/why', label: 'Why OC Stamp' },
            { href: '/stamp/quickstart', label: 'Quickstart' },
            { href: '/stamp/how-it-works', label: 'How it works' },
            { href: '/stamp/envelope', label: 'Envelope format' },
            { href: '/stamp/ots', label: 'OpenTimestamps' },
            { href: '/stamp/nostr', label: 'Nostr publication' },
            { href: '/stamp/security', label: 'Security posture' },
            { href: '/stamp/spec', label: 'Specification' },
        ],
    },
    {
        label: 'orangecheck · ochk.app',
        items: [
            { href: '/me', label: 'Overview', badge: 'testing' },
            { href: '/me/quickstart', label: 'Quickstart' },
        ],
    },
    {
        label: 'SDKs',
        items: [
            { href: '/sdk', label: 'All packages' },
            { href: '/sdk/stamp-core/README', label: '@orangecheck/stamp-core' },
            { href: '/sdk/stamp-ots/README', label: '@orangecheck/stamp-ots' },
        ],
    },
    { label: 'Reference', items: [{ href: '/reference/glossary', label: 'Glossary' }, { href: '/reference/error-codes', label: 'Error codes' }] },
];

const STAMP_SDK = `import { stamp } from '@orangecheck/stamp-core';
import { submitToCalendars, toStampOts } from '@orangecheck/stamp-ots';

// 1. Build a signed stamp envelope.
const env = await stamp({
    content: new TextEncoder().encode('hello stamp'),
    mime: 'text/plain',
    signer: {
        address: 'bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t',
        signMessage: async (msg) => walletSignBIP322(msg),
    },
});

// 2. Anchor to Bitcoin (a pending proof, confirmed within the hour).
const proof = await submitToCalendars(env.id);
const anchored = { ...env, ots: toStampOts(proof) };`;

const VERIFY = `import { verify } from '@orangecheck/stamp-core';

const result = await verify({
    envelope: anchored,
    content: bytes, // optional: checks the bytes match
    verifyBip322: async (msg, sig, addr) => myVerifier(msg, sig, addr),
});
if (!result.ok) throw new Error(result.reason);`;

const SEARCH: Record<string, SearchGroup[]> = {
    stamp: [
        {
            label: 'OC Stamp',
            results: [
                {
                    id: 'q',
                    href: '/stamp/quickstart',
                    title: 'Quickstart',
                    excerptHtml: 'Go from a file on your disk to a published, verifiable <mark>stamp</mark> in under a minute.',
                },
                {
                    id: 'e',
                    href: '/stamp/envelope',
                    title: 'Envelope format',
                    excerptHtml: 'A <mark>stamp</mark> envelope is self-contained JSON: the content hash, the signer, the signature and the anchor.',
                },
                {
                    id: 'o',
                    href: '/stamp/ots',
                    title: 'OpenTimestamps',
                    excerptHtml: 'The envelope id goes to two calendars; the proof is upgraded once a Bitcoin block commits to it.',
                },
            ],
        },
        {
            label: 'SDKs',
            results: [
                {
                    id: 's',
                    href: '/sdk/stamp-core/functions/stamp',
                    title: 'Function: stamp()',
                    section: '@orangecheck/stamp-core',
                    excerptHtml: 'Build and sign a <mark>stamp</mark> envelope over any bytes.',
                },
            ],
        },
    ],
};

const searchQuery = async (q: string) => SEARCH[q.toLowerCase().startsWith('st') ? 'stamp' : ''] ?? [];

const pager = (
    <DocsPager
        prev={{ href: '/stamp/why', label: 'Why OC Stamp' }}
        next={{ href: '/stamp/how-it-works', label: 'How it works' }}
    />
);

export const Page: StoryObj = {
    name: 'Docs page',
    render: () => (
        <DocsShell
            nav={NAV}
            current="/stamp/quickstart"
            search={<SearchDialog onQuery={searchQuery} hotkey={false} />}
            actions={
                <Button asChild size="sm" variant="secondary">
                    <a href="https://ochk.app/signin">Sign in</a>
                </Button>
            }
            breadcrumbs={
                <Breadcrumbs
                    items={[{ href: '/', label: 'Docs' }, { href: '/stamp', label: 'OC Stamp' }, { label: 'Quickstart' }]}
                    action={<TextLink href="https://github.com/orangecheck/oc-docs/blob/main/src/pages/stamp/quickstart.mdx">View source</TextLink>}
                />
            }
            pager={pager}
        >
            <M.h1>Quickstart</M.h1>
            <M.p>
                <M.strong>From a file on your disk to a published, verifiable stamp in under a minute.</M.strong> You need a
                Bitcoin wallet that signs with BIP-322 and a browser. No account, no server.
            </M.p>
            <M.h2 id="hosted">Use the web client</M.h2>
            <Steps>
                <Step title="Drop the file">
                    <M.p>
                        Open <TextLink href="https://stamp.ochk.io/create">stamp.ochk.io/create</TextLink> and drop the file. Your
                        browser hashes it in place; the bytes never leave the tab.
                    </M.p>
                </Step>
                <Step title="Sign with your wallet">
                    <M.p>
                        Your wallet shows a six-line message starting with <M.code>oc-stamp:v1</M.code>. Approve it.
                    </M.p>
                </Step>
                <Step title="Anchor it to Bitcoin">
                    <M.p>
                        The envelope id goes to two OpenTimestamps calendars. The proof is pending at once and confirmed within
                        about an hour.
                    </M.p>
                </Step>
            </Steps>
            <M.h2 id="sdk">Use the SDK</M.h2>
            <InstallTabs pkg="@orangecheck/stamp-core @orangecheck/stamp-ots" />
            <CodeBlock code={STAMP_SDK} lang="ts" caption="stamp.ts" highlight="5-11" className="my-6" />
            <Callout title="Keep the envelope with the file">
                The envelope is the proof. Ship the .stamp file beside the content, or publish it to Nostr.
            </Callout>
            <M.h3 id="verify">Verify</M.h3>
            <CodeBlock code={VERIFY} lang="ts" className="my-6" />
            <M.h3 id="options">Options</M.h3>
            <ApiTable
                caption="verify() options"
                rows={[
                    { name: 'envelope', type: 'StampEnvelope', required: true, description: 'The envelope as published.' },
                    { name: 'content', type: 'Uint8Array', description: 'The bytes it covers. Without them, only the signature is checked.' },
                    { name: 'verifyBip322', type: '(msg, sig, addr) => Promise<boolean>', required: true, description: 'Your BIP-322 verifier.' },
                    { name: 'headers', type: 'BlockHeaderSource', default: 'mempool.space', description: 'Where block headers come from, to walk the anchor.' },
                ]}
            />
        </DocsShell>
    ),
};

export const Code: StoryObj = {
    name: 'Code',
    render: () => (
        <div className="oca-container flex flex-col gap-10 py-10">
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
                <CodeBlock code={STAMP_SDK} lang="ts" caption="stamp.ts" highlight="5-11" />
                <CodeBlock
                    lang="diff"
                    caption="gate.ts: require 30 days of stake"
                    code={` const ok = await gate({
     address,
-    minSats: 100_000,
+    minSats: 100_000,
+    minDays: 30,
 });`}
                />
                <CodeBlock
                    lang="json"
                    caption="stamp.json"
                    lineNumbers
                    code={`{
  "v": 1,
  "kind": "stamp",
  "id": "86020d78db788237e9f0c1b2a3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a85eeb1c",
  "content": { "hash": "sha256:3f9a0c5e…4a6bc21e", "length": 482113, "mime": "application/pdf" },
  "signer": { "address": "bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t", "alg": "bip322" },
  "ots": { "status": "confirmed", "block_height": 971632 },
  "published": true,
  "note": null
}`}
                />
                <CodeBlock
                    lang="bash"
                    caption="Terminal"
                    code={`$ npm install @orangecheck/stamp-core
$ curl -s https://stamp.ochk.io/api/verify?id=86020d78 | jq '.anchor' # the block it is in
$ OC_NETWORK=mainnet npx stamp verify report.pdf.stamp --content report.pdf`}
                />
                <CodeBlock
                    lang="tsx"
                    caption="signin.tsx"
                    code={`export default function SignIn() {
    return <OcSignIn audience="https://stamp.ochk.io" onSignedIn={() => router.push('/create')} />;
}`}
                />
                <CodeBlock
                    lang="python"
                    caption="check.py"
                    code={`from orangecheck import stamp

@dataclass
class Receipt:
    def anchored(self, height: int = 971632) -> bool:
        """True once the proof reaches a block."""
        return stamp.verify(self.envelope).block_height is not None`}
                />
            </div>
            <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-2">
                <CodeTabs
                    syncKey="request"
                    items={[
                        { label: 'curl', lang: 'bash', code: `curl -s "https://stamp.ochk.io/api/verify?id=86020d78" \\\n  -H "Accept: application/json"` },
                        { label: 'Node', lang: 'ts', code: `const res = await fetch('https://stamp.ochk.io/api/verify?id=86020d78');\nconst { anchor } = await res.json();` },
                        { label: 'Python', lang: 'python', code: `import httpx\nanchor = httpx.get("https://stamp.ochk.io/api/verify", params={"id": "86020d78"}).json()["anchor"]` },
                    ]}
                />
                <InstallTabs pkg="@orangecheck/stamp-core" />
                <CodeBlock
                    lang="yaml"
                    caption=".github/workflows/stamp.yml"
                    code={`name: stamp releases
on:
  release:
    types: [published]
jobs:
  stamp:
    runs-on: ubuntu-latest # any runner with node
    timeout-minutes: 10`}
                />
                <CodeBlock code={STAMP_SDK + '\n' + VERIFY} lang="ts" caption="Long, folded" maxLines={10} />
            </div>
        </div>
    ),
};

export const Blocks: StoryObj = {
    name: 'Docs blocks',
    render: () => (
        <div className="oca-container grid grid-cols-1 gap-12 py-10 lg:grid-cols-[minmax(0,1fr)_12rem]">
            <div className="flex min-w-0 max-w-[46rem] flex-col">
                <Breadcrumbs items={[{ href: '/', label: 'Docs' }, { href: '/stamp', label: 'OC Stamp' }, { label: 'Envelope format' }]} />
                <M.h2 id="callouts">Callouts</M.h2>
                <Callout title="The anchor is not signed">
                    The <M.code>ots</M.code> block sits outside the signature. Walk the proof to its block before you trust it.
                </Callout>
                <Callout tone="warning" title="Pending is not anchored">
                    A pending proof says a calendar has the hash. It is anchored only once a Bitcoin block commits to it.
                </Callout>
                <Callout tone="danger" title="Never re-sign a published id">
                    Changing any field changes the id. Publish a new stamp instead.
                </Callout>
                <M.blockquote>
                    <M.p>
                        <M.strong>Normative spec:</M.strong> oc-stamp-protocol/SPEC.md. If this page and the spec disagree, the spec
                        wins.
                    </M.p>
                </M.blockquote>
                <M.h2 id="table">A markdown table</M.h2>
                <M.table>
                    <thead>
                        <tr>
                            <th>Field</th>
                            <th>Type</th>
                            <th>Signed</th>
                            <th>What it holds</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td><M.code>content.hash</M.code></td>
                            <td><M.code>string</M.code></td>
                            <td>Yes</td>
                            <td>SHA-256 of the bytes, prefixed with sha256:</td>
                        </tr>
                        <tr>
                            <td><M.code>signer.address</M.code></td>
                            <td><M.code>string</M.code></td>
                            <td>Yes</td>
                            <td>The Bitcoin address that signed.</td>
                        </tr>
                        <tr>
                            <td><M.code>ots</M.code></td>
                            <td><M.code>object</M.code></td>
                            <td>No</td>
                            <td>The OpenTimestamps proof and the block it reached.</td>
                        </tr>
                    </tbody>
                </M.table>
                <M.h2 id="cards">Where to go next</M.h2>
                <CardGrid>
                    <LinkCard href="/stamp/quickstart" icon={<Terminal />} title="Quickstart" description="A file to a verifiable stamp in a minute." />
                    <LinkCard href="/stamp/envelope" icon={<FileCheck2 />} title="Envelope format" description="Every field, what it covers, what it does not." />
                    <LinkCard href="/stamp/ots" icon={<Anchor />} title="OpenTimestamps" description="How a hash reaches a Bitcoin block." />
                    <LinkCard
                        href="https://github.com/orangecheck/oc-stamp-protocol"
                        icon={<BookOpen />}
                        title="The spec"
                        description="SPEC.md, test vectors and the threat model."
                    />
                </CardGrid>
                <M.h2 id="api">API table</M.h2>
                <ApiTable
                    caption="stamp() options"
                    rows={[
                        { name: 'content', type: 'Uint8Array', required: true, description: 'The bytes to stamp. Only their hash is signed.' },
                        { name: 'mime', type: 'string', default: "'application/octet-stream'", description: 'What the bytes are.' },
                        { name: 'signer', type: 'StampSigner', required: true, description: 'The address and a function that signs with it.' },
                        { name: 'publishedAt', type: 'Date', deprecated: true, description: 'Use signedAt. Read for old envelopes only.' },
                        { name: 'stake', type: 'AttestRef', status: 'testing', description: 'An OC Attest to bind as the signer’s stake.' },
                    ]}
                />
                <M.h2 id="diagram">Diagram</M.h2>
                <Diagram
                    load={() => import('mermaid')}
                    caption="A stamp, from file to block"
                    // The drawn size (a drawn figure's data-size): the placeholder holds it, so nothing below moves.
                    size={[1036, 168]}
                    chart={`flowchart LR
  F[File] -->|SHA-256| H[Hash]
  H --> E[Envelope]
  W[Wallet] -->|BIP-322| E
  E -->|id| C[OTS calendars]
  C -->|within the hour| B[Bitcoin block]`}
                />
                <DocsPager
                    className="mt-12"
                    prev={{ href: '/stamp/how-it-works', label: 'How it works' }}
                    next={{ href: '/stamp/ots', label: 'OpenTimestamps', section: 'OC Stamp' }}
                />
            </div>
            <OnThisPage
                className="sticky top-6 hidden self-start lg:block"
                activeId="table"
                items={[
                    { id: 'callouts', label: 'Callouts' },
                    { id: 'table', label: 'A markdown table' },
                    { id: 'cards', label: 'Where to go next' },
                    { id: 'api', label: 'API table' },
                    { id: 'fields', label: 'Required fields', level: 3 },
                    { id: 'diagram', label: 'Diagram' },
                ]}
            />
        </div>
    ),
};

const CHARTER = '# Example charter v1 · canonical bytes\nversion: v1.0.0\nthreshold: 3-of-4\noc_is_a_guardian: false\n';

export const Reference: StoryObj = {
    name: 'SDK reference page',
    render: () => (
        // A deep page opens its package in the nav; the footer is ochk.io's, by default.
        <DocsShell nav={NAV} current="/sdk/stamp-core/interfaces/StampEnvelope" navCurrent="/sdk/stamp-core/README">
            <M.h1>Interface: StampEnvelope</M.h1>
            <M.p>
                Back to the <TextLink href="../README">package</TextLink>. A relative link resolves against this page.
            </M.p>
            <SpecCard repo="oc-stamp-protocol" kind="spec" version="v1" />
            <M.h2 id="properties">Properties</M.h2>
            <ApiTable
                nameHeader="Property"
                rows={[
                    {
                        name: 'id',
                        id: 'property-id',
                        type: 'string',
                        description: 'SHA-256 of the canonical bytes, with sig.value empty.',
                        source: <TextLink href="https://github.com/orangecheck/oc-packages/blob/main/stamp-core/src/types.ts#L18">types.ts:18</TextLink>,
                    },
                    {
                        name: 'signed_at',
                        id: 'property-signed_at',
                        type: 'string',
                        source: <TextLink href="https://github.com/orangecheck/oc-packages/blob/main/stamp-core/src/types.ts#L24">types.ts:24</TextLink>,
                    },
                    {
                        name: 'ots',
                        id: 'property-ots',
                        type: 'OtsProof | null',
                        default: 'null',
                        source: <TextLink href="https://github.com/orangecheck/oc-packages/blob/main/stamp-core/src/types.ts#L31">types.ts:31</TextLink>,
                    },
                ]}
            />
            <M.p>
                <TextLink href="#property-ots">Jump to ots</TextLink> lands on its row.
            </M.p>
            <M.h3 id="verify">verify()</M.h3>
            <M.h5>Returns</M.h5>
            <M.p>
                <M.code>Promise&lt;VerifyResult&gt;</M.code>
            </M.p>
            <M.h2 id="bytes">Canonical bytes</M.h2>
            <M.p>Copy takes the block byte for byte, its final newline too. Its SHA-256 is</M.p>
            <M.p>
                <M.code>d30be2349ad936445c8f77bb22c9658dca54c2d585e55058345634f2f2d6907e</M.code>
            </M.p>
            <CodeBlock code={CHARTER} caption="Canonical bytes" className="my-6" />
            <M.h2 id="todo">Before 1.0</M.h2>
            <M.ul className="contains-task-list">
                <M.li className="task-list-item">
                    <M.input type="checkbox" checked disabled /> Content-addressed ids
                </M.li>
                <M.li className="task-list-item">
                    <M.input type="checkbox" disabled /> A second implementation that agrees on every test vector, so a wrapped line of this
                    task starts under its text
                </M.li>
            </M.ul>
            <M.h2 id="flow">How a stamp travels</M.h2>
            <Diagram
                load={() => import('mermaid')}
                caption="A little wider than the column: it scales to fit"
                chart={`flowchart LR
  F[File] -->|SHA-256| H[Hash]
  H -->|signed| E[Envelope]
  E -->|anchored| B[Bitcoin block]`}
            />
            <M.h2 id="protocols">The other protocols</M.h2>
            <ProtocolGrid link="docs" protocols={['attest', 'lock', 'vote']} />
        </DocsShell>
    ),
};

export const Search: StoryObj = {
    name: 'Search',
    render: () => (
        <div className="oca-container flex min-h-[44rem] flex-col items-start gap-4 py-10">
            <p className="oca-body">The header&rsquo;s button; ⌘K or / opens it anywhere on the page.</p>
            <SearchDialog onQuery={searchQuery} open defaultQuery="stamp" hotkey={false} />
        </div>
    ),
};
