import type { Meta, StoryObj } from '@storybook/react';

import { Button } from '../primitives';
import {
    ActivityList,
    DataTable,
    EmptyState,
    HashChip,
    KeyValueList,
    Notice,
    PackageCard,
    PageHeader,
    ProgressSteps,
    Sats,
    SatsFigure,
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
