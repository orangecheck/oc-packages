import type { Meta, StoryObj } from '@storybook/react';

import { Button, StatusPill } from '../primitives';
import { useState } from 'react';

import {
    ActivityList,
    CodeBlock,
    DataTable,
    DocHeader,
    DocLayout,
    EmptyState,
    HashChip,
    KeyValueList,
    LoadingBlock,
    Monogram,
    Notice,
    PackageCard,
    PageHeader,
    PageHero,
    Prose,
    ProgressSteps,
    Sats,
    SatsFigure,
    SplitBar,
    StatCard,
    StatGrid,
    StepGrid,
    TruthTable,
    UsdApprox,
} from './index';

const meta: Meta = { title: 'Components' };
export default meta;

export const Steps: StoryObj = {
    render: () => (
        <div className="flex flex-col gap-12">
            <StepGrid
                items={[
                    { title: 'Sign in', body: 'The way they always do. Email or a wallet. Nothing new to learn.' },
                    { title: 'Earn', badge: 'in testing', body: 'Small amounts for things they already do online, shared by your app.' },
                    { title: 'Own', badge: 'on the path', body: 'Over time, it moves into a wallet they hold themselves.' },
                ]}
            />
            <StepGrid
                look="plain"
                items={[
                    { title: 'Sign one message', body: 'A user signs one message with their Bitcoin address. Nothing else to fill in.' },
                    { title: 'You set the bar', body: 'Your app checks the address held a minimum of sats, unspent, for a minimum number of days.' },
                    { title: 'Nothing moves', body: 'No sats change hands. Nobody holds them. Anyone can check the result against Bitcoin.' },
                ]}
            />
            <div className="rounded-[1.5rem] bg-oca-ink p-8">
                <StepGrid
                    look="ink"
                    items={[
                        { title: 'You shape it', body: 'What your integration needs gets built. Real needs, not guesses.' },
                        { title: 'A direct line', body: 'You talk to the person who built it. Not a sales team.' },
                        { title: 'Ready when it opens', body: 'Integrate during testing. Be live when real users arrive early next year.' },
                    ]}
                />
            </div>
        </div>
    ),
};

export const Packages: StoryObj = {
    render: () => (
        <div className="rounded-[1.5rem] bg-oca-ink p-8">
            <PackageCard
                items={[
                    { title: 'A drop-in gate', code: '@orangecheck/gate', note: 'Middleware for Express, Next, Fastify, Hono and Workers.' },
                    { title: 'A Nostr relay filter', code: '@orangecheck/relay-filter', note: 'For strfry. Turns away events from npubs with no bitcoin behind them.' },
                    { title: 'Sign in with Bitcoin', code: '<OcSignInButton />', kind: 'tag', note: 'React components, and sessions that work across your sites.' },
                    { title: 'All of it open', code: 'MIT code · CC-BY-4.0 specs', kind: 'link', note: 'TypeScript and Python SDKs. Fork it or host it yourself.' },
                ]}
            />
        </div>
    ),
};

export const Truth: StoryObj = {
    name: 'Truth table',
    render: () => (
        <TruthTable
            className="max-w-4xl"
            rows={[
                { status: 'yes', what: 'Open source. Anyone can verify it against Bitcoin.' },
                { status: 'yes', what: 'No token. No ads.' },
                { status: 'testing', what: 'Earning on me.ochk.io. Payouts run on test networks until testing ends.' },
                { status: 'testing', what: "Custody. orangecheck holds it today, then independent operators, then users' own wallets." },
                { status: 'not-yet', what: 'No KYC, verified by an outside review.' },
            ]}
        />
    ),
};

export const Money: StoryObj = {
    render: () => (
        <div className="flex flex-col gap-8">
            <SatsFigure label="Balance" value={12840} hint="held by orangecheck during testing" />
            <div className="flex flex-col gap-2 text-lg">
                <Sats value={21000} /> <Sats value={1} /> <Sats value={-2100} />
                <Sats value={8_400_000} compact /> <Sats value={250} signed />
                <span>
                    <Sats value={null} /> (never measured, not zero)
                </span>
                <UsdApprox sats={12840} usdPerBtc={68000} />
            </div>
        </div>
    ),
};

export const Data: StoryObj = {
    render: () => (
        <div className="flex flex-col gap-10">
            <PageHeader
                eyebrow="Wallet"
                title="Your balance"
                description="What you've earned, where it's held, and how to take it out."
                actions={<Button>Cash out</Button>}
            />
            <StatGrid>
                <StatCard label="Balance" value={<Sats value={12840} />} />
                <StatCard label="Earned this month" value={<Sats value={3120} />} hint="from 4 sites" />
                <StatCard label="Maturing" value={<Sats value={900} />} hint="in an open drop" />
                <StatCard label="Paid out" value={<Sats value={null} />} hint="nothing yet" />
            </StatGrid>
            <KeyValueList
                items={[
                    { label: 'Identity', value: <HashChip value="did:oc:ed30f1d9fc9acf7a88283069a2f97fc8" head={14} tail={6} /> },
                    { label: 'Payout destination', value: 'alice@getalby.com' },
                    { label: 'Network', value: 'signet (testing)' },
                ]}
            />
            <DataTable
                caption="Recent events"
                rowKey={(r) => r.id}
                columns={[
                    { key: 'site', header: 'Site', cell: (r) => r.site },
                    { key: 'what', header: 'What', cell: (r) => r.what, wide: true },
                    { key: 'sats', header: 'You earned', align: 'end', cell: (r) => <Sats value={r.sats} signed /> },
                ]}
                rows={[
                    { id: '1', site: 'chat.ochk.io', what: 'session', sats: 38 },
                    { id: '2', site: 'lumen notes', what: 'account created', sats: 210 },
                    { id: '3', site: 'stamp.ochk.io', what: 'stamp signed', sats: 28 },
                ]}
            />
            <ActivityList
                items={[
                    { id: 'a', title: 'Payout sent', meta: 'to alice@getalby.com · 2 days ago', trailing: <Sats value={-5000} /> },
                    { id: 'b', title: 'Earned on lumen notes', meta: 'account created · 5 days ago', trailing: <Sats value={210} signed /> },
                ]}
            />
            <ProgressSteps
                steps={[
                    { label: 'Sign in', state: 'done' },
                    { label: 'Bind a payout address', hint: 'Where your sats go when you cash out.', state: 'current' },
                    { label: 'First payout', state: 'upcoming' },
                ]}
            />
            <div className="grid gap-4 md:grid-cols-2">
                <Notice tone="brand" title="Earning runs on test networks">
                    Payouts use testnet sats until testing ends in February.
                </Notice>
                <Notice tone="warning" title="Payout held" action={<Button size="sm" variant="secondary">Details</Button>}>
                    We could not confirm a payout reached you. It is held until someone checks the node.
                </Notice>
            </div>
            <EmptyState title="No projects yet" action={<Button>Start a project</Button>}>
                A project gets you keys, a signing secret and a place to watch events arrive.
            </EmptyState>
        </div>
    ),
};

export const Split: StoryObj = {
    name: 'Split bar',
    render: () => (
        <div className="max-w-2xl rounded-2xl bg-brand p-8 text-brand-foreground">
            <SplitBar
                caption="Every sat an app pays for an event"
                segments={[
                    { pct: 80, label: 'Up to this much goes to the person', tone: 'card' },
                    { pct: 20, label: 'orangecheck keeps this', tone: 'ink' },
                ]}
            />
        </div>
    ),
};

export const Monograms: StoryObj = {
    name: 'Monogram',
    render: () => (
        <div className="flex flex-col gap-6">
            <div className="flex flex-wrap items-center gap-3">
                {['Lumen Notes', 'acme.dev', 'Halfway Books', 'nostr.band', '21 Futures', 'Pine & Co'].map((n) => (
                    <Monogram key={n} name={n} />
                ))}
            </div>
            <div className="flex items-center gap-3">
                <Monogram name="Lumen Notes" size="sm" />
                <Monogram name="Lumen Notes" size="md" />
                <Monogram name="Lumen Notes" size="lg" />
            </div>
        </div>
    ),
};

export const Status: StoryObj = {
    name: 'Status pill',
    render: () => (
        <div className="flex flex-col gap-4">
            <StatusPill>In testing · payouts start when testing ends</StatusPill>
            <StatusPill pulse={false}>Sign-in is live</StatusPill>
        </div>
    ),
};

export const Heroes: StoryObj = {
    name: 'Page hero and document layout',
    parameters: { fullBleed: true },
    render: () => (
        <div>
            <PageHero
                eyebrow="Who holds what"
                title="Every sat has a holder, named."
                lead="Today orangecheck holds what accrues. This page says who replaces it, and when."
                actions={
                    <>
                        <Button>See the live state</Button>
                        <Button variant="secondary">Read the plan</Button>
                    </>
                }
                art={<div className="aspect-[4/3] rounded-[1.25rem] bg-muted" />}
            >
                <StatusPill>In testing · sats accrue, payouts come later</StatusPill>
            </PageHero>
            <DocLayout
                header={
                    <DocHeader
                        eyebrow="Legal"
                        title="Privacy policy"
                        lead="What orangecheck stores, why, and for how long."
                        meta="Updated 15 October 2026"
                    />
                }
                toc={[
                    { id: 'what', label: 'What we store' },
                    { id: 'why', label: 'Why we store it' },
                    { id: 'how-long', label: 'How long we keep it' },
                ]}
            >
                <Prose>
                    {['what', 'why', 'how-long'].map((id) => (
                        <section key={id}>
                            <h2 id={id}>{id === 'what' ? 'What we store' : id === 'why' ? 'Why we store it' : 'How long we keep it'}</h2>
                            <p>
                                A paragraph of the document, set at a readable measure. The heading above is always
                                smaller than the page's own title.
                            </p>
                            <p>Another paragraph, so the table of contents has something to follow.</p>
                        </section>
                    ))}
                </Prose>
            </DocLayout>
        </div>
    ),
};

export const StatsShapes: StoryObj = {
    name: 'Stat grids: odd counts and all zero',
    render: () => (
        <div className="flex max-w-5xl flex-col gap-8">
            <StatGrid>
                <StatCard label="Balance" value={<Sats value={12840} />} raw={12840} />
                <StatCard label="Earned this month, across every site you use" value={<Sats value={3120} />} raw={3120} />
                <StatCard label="Maturing" value={<Sats value={900} />} raw={900} hint="in an open drop" />
                <StatCard label="Sites" value="3" raw={3} />
                <StatCard label="Paid out" value={<Sats value={0} />} raw={0} />
            </StatGrid>
            <StatGrid empty="Nothing billed yet. Events you fire will show here.">
                <StatCard label="Billed (7d)" value={<Sats value={0} />} raw={0} />
                <StatCard label="Billed (30d)" value={<Sats value={0} />} raw={0} />
                <StatCard label="Events" value="0" raw={0} />
            </StatGrid>
        </div>
    ),
};

export const TablePhone: StoryObj = {
    name: 'Table: widths, numbers, phone cards',
    render: () => (
        <DataTable
            caption="Audit"
            rowKey={(r) => r.id}
            columns={[
                { key: 'when', header: 'When', cell: (r) => r.when, width: '9rem' },
                { key: 'action', header: 'Action', cell: (r) => r.action, primary: true },
                {
                    key: 'target',
                    header: 'Target',
                    cell: (r) => <HashChip value={r.target} head={10} tail={6} />,
                    minWidth: '14rem',
                },
                { key: 'sats', header: 'Sats', cell: (r) => r.sats.toLocaleString('en-US'), numeric: true },
            ]}
            rows={[
                { id: '1', when: '15 Oct, 16:32', action: 'Network set to signet', target: 'oc-me-federation-bootstrap-1', sats: 0 },
                { id: '2', when: '15 Oct, 14:02', action: 'Escrow topped up', target: 'pk_test_VRBJTYIdV0i5zfuj', sats: 100000 },
            ]}
        />
    ),
};

function LoadingDemo() {
    const [key, setKey] = useState(0);
    return <LoadingBlock key={key} timeoutMs={3000} onRetry={() => setKey((k) => k + 1)} />;
}

export const CodeAndStates: StoryObj = {
    name: 'Code, notices, loading',
    render: () => (
        <div className="flex max-w-3xl flex-col gap-8">
            <CodeBlock
                caption="Node · fire an event"
                maxLines={6}
                code={[
                    "import { oc } from '@orangecheck/me-client';",
                    '',
                    'await oc.event.fire({',
                    "  project_key: 'pk_test_VRBJTYIdV0i5zfuj', subtype: 'comment.posted', signingSecret: process.env.OC_SIGNING_SECRET!,",
                    '  userAddress: user.did_oc,',
                    '  idempotencyKey: crypto.randomUUID(),',
                    '});',
                    '',
                    '// A retry with the same key never bills twice.',
                    '// The earner rides inside the bytes you sign.',
                ].join('\n')}
            />
            <Notice title="Payouts start when testing ends">Earning runs on test networks until then.</Notice>
            <Notice tone="brand" title="Escrow is low" action={<Button size="sm" variant="secondary">Top up</Button>}>
                Events stop billing when it runs out.
            </Notice>
            <Notice tone="danger" title="That key was rejected">The signature did not match the address.</Notice>
            <LoadingDemo />
        </div>
    ),
};
