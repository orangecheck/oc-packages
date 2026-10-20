import type { Meta, StoryObj } from '@storybook/react';
import { BadgeCheck, CheckCircle, Compass, FileText, Inbox, Plus, Search as SearchIcon, Terminal } from 'lucide-react';
import { useState } from 'react';

import { SessionAccountView, SiteHeader, ToolShell } from '../chrome';
import {
    Button,
    DensityProvider,
    Field,
    Input,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '../primitives';
import {
    AnchorStatus,
    ArtifactView,
    BlockCountdown,
    BlockHeight,
    CopyButton,
    createStateBadge,
    DataTable,
    DropZone,
    FilterChips,
    FormSection,
    HashChip,
    KeyValueList,
    Meter,
    PageHeader,
    SignMessage,
    StatCard,
    StatGrid,
    TextLink,
    ToolGrid,
    VerifyReport,
    type ToolItem,
} from './index';

/* OC Stamp and OC Attest are the samples: a stamp being made and checked, the attest dashboard. */
const meta: Meta = { title: 'Tools', parameters: { fullBleed: true } };
export default meta;

const ADDRESS = 'bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t';
const ENVELOPE = JSON.stringify({
    v: 1,
    kind: 'stamp',
    id: '86020d78db788237e9f0c1b2a3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a85eeb1c',
    content: { hash: 'sha256:3f9a0c5e7d1b2a4c6e8f0a1b3c5d7e9f1a2b4c6d8e0f2a4b6c8d0e2f4a6bc21e', length: 482113, mime: 'application/pdf' },
    signer: { address: ADDRESS, alg: 'bip322' },
    signed_at: '2026-10-20T09:14:02Z',
    sig: { alg: 'bip322', value: 'AkcwRAIgW2…pQ5Xw==' },
    ots: { status: 'confirmed', block_height: 971632 },
});

const stampTools = (active: string): ToolItem[] => [
    { href: '/create', label: 'Create', icon: <Plus />, description: 'Sign a file’s hash and anchor it to Bitcoin.', active: active === 'create' },
    { href: '/verify', label: 'Verify', icon: <CheckCircle />, description: 'Check who signed it and which block holds it.', active: active === 'verify' },
    { href: '/playground', label: 'Playground', icon: <Terminal />, description: 'The canonical message and id, live in your browser.', active: active === 'playground' },
];

const attestTools = (active: string): ToolItem[] => [
    { href: '/create', label: 'Create', icon: <Plus />, description: 'Show that an address holds bitcoin, and for how long.', active: active === 'create' },
    { href: '/verify', label: 'Verify', icon: <CheckCircle />, description: 'Check an attestation against the chain.', active: active === 'verify' },
    { href: '/discover', label: 'Discover', icon: <Compass />, description: 'Browse public attestations.', active: active === 'discover' },
    { href: '/playground', label: 'Playground', icon: <Terminal />, description: 'Build the message and id by hand.', active: active === 'playground' },
];

const signedIn = (
    <SessionAccountView
        state="in"
        name="you@example.com"
        signInHref="https://ochk.io/signin"
        items={[{ label: 'Your stamps', href: '/dashboard', icon: <FileText /> }]}
    />
);

export const Create: StoryObj = {
    name: 'Tool shell: create',
    render: function Render() {
        const [file, setFile] = useState<{ name: string; size: number; type: string } | null>({
            name: 'annual-report-2026.pdf',
            size: 482113,
            type: 'application/pdf',
        });
        return (
            <ToolShell protocol="stamp" tools={stampTools('create')} account={signedIn}>
                <div className="flex flex-col gap-8">
                    <PageHeader
                        eyebrow="OC Stamp"
                        title="Create a stamp"
                        description="Prove who signed a file, and when. The file never leaves your browser."
                    />
                    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
                        <div className="flex flex-col gap-4">
                            <FormSection
                                n={1}
                                title="What you are stamping"
                                status="done"
                                hint="Its SHA-256 is what gets signed."
                                action={
                                    <Button size="sm" variant="secondary">
                                        Change file
                                    </Button>
                                }
                            >
                                <DropZone
                                    file={file}
                                    onFile={(f) => setFile({ name: f.name, size: f.size, type: f.type })}
                                    onClear={() => setFile(null)}
                                    onText={() => {}}
                                    hint="Any file. Large files hash in a few seconds."
                                />
                            </FormSection>
                            <FormSection n={2} title="Who signs" status="current" hint="A Bitcoin address that can sign with BIP-322.">
                                <Field label="Address">
                                    <Input defaultValue={ADDRESS} spellCheck={false} className="font-mono" />
                                </Field>
                                <Field label="Network" hint="Mainnet anchors to Bitcoin; signet is for trying it out.">
                                    <Select defaultValue="mainnet">
                                        <SelectTrigger>
                                            <SelectValue />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="mainnet">Mainnet</SelectItem>
                                            <SelectItem value="signet">Signet</SelectItem>
                                        </SelectContent>
                                    </Select>
                                </Field>
                            </FormSection>
                            <FormSection n={3} title="Sign it" status="upcoming">
                                <SignMessage
                                    address={ADDRESS}
                                    message={`oc-stamp:v1\naddress: ${ADDRESS}\ncontent_hash: sha256:3f9a0c5e…4a6bc21e\ncontent_length: 482113\ncontent_mime: application/pdf\nsigned_at: 2026-10-20T09:14:02Z`}
                                    wallets={
                                        <>
                                            <Button size="sm" variant="secondary">Sign with UniSat</Button>
                                            <Button size="sm" variant="secondary">Sign with Xverse</Button>
                                        </>
                                    }
                                    onSignature={() => {}}
                                    submitLabel="Create the stamp"
                                />
                            </FormSection>
                        </div>
                        <aside className="flex flex-col gap-4">
                            <KeyValueList
                                items={[
                                    { label: 'File', value: 'annual-report-2026.pdf' },
                                    { label: 'Size', value: '471 KB' },
                                    { label: 'SHA-256', value: <HashChip value="3f9a0c5e7d1b2a4c6e8f0a1b3c5d7e9f1a2b4c6d8e0f2a4b6c8d0e2f4a6bc21e" /> },
                                ]}
                            />
                            <p className="text-[0.875rem] leading-relaxed text-muted-foreground">
                                After signing, the stamp goes to two OpenTimestamps calendars and is anchored within about an hour.{' '}
                                <TextLink href="https://ochk.io/docs/stamp/ots">How anchoring works</TextLink>
                            </p>
                        </aside>
                    </div>
                </div>
            </ToolShell>
        );
    },
};

const ROWS = [
    { id: 'a1', address: ADDRESS, sats: '0.4210 BTC', days: 412, state: 'active' as const, seen: '20 Oct 2026' },
    { id: 'a2', address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', sats: '1.0000 BTC', days: 1093, state: 'active' as const, seen: '19 Oct 2026' },
    { id: 'a3', address: 'bc1p5d7rjq7g6rdk2yhzks9smlaqtedr4dekq08ge8ztwac72sfr9rusxg3297', sats: '0.0500 BTC', days: 31, state: 'moved' as const, seen: '12 Oct 2026' },
    { id: 'a4', address: 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq', sats: '0.2500 BTC', days: 0, state: 'expired' as const, seen: '2 Oct 2026' },
];

const AttestState = createStateBadge({
    active: { label: 'Active', tone: 'good', hint: 'The coins are unspent and old enough.' },
    moved: { label: 'Coins moved', tone: 'attention', hint: 'The coins behind it were spent.' },
    expired: { label: 'Expired', tone: 'quiet' },
});

export const Dashboard: StoryObj = {
    name: 'Tool shell: dashboard with a rail',
    render: function Render() {
        const [filter, setFilter] = useState<'all' | 'active' | 'moved' | 'expired'>('all');
        const rows = ROWS.filter((r) => filter === 'all' || r.state === filter);
        return (
            <ToolShell
                protocol="attest"
                tools={attestTools('')}
                rail
                railFooter={
                    <>
                        <a href="https://ochk.io/docs/attest">Docs</a>
                        <a href="https://github.com/orangecheck/oc-attest-protocol">The spec</a>
                    </>
                }
                account={<SessionAccountView state="out" signInHref="https://ochk.io/signin" />}
            >
                <div className="flex flex-col gap-8">
                    <PageHeader eyebrow="OC Attest" title="Dashboard" description="Your attestations, and what each one shows." />
                    <StatGrid>
                        <StatCard label="Attestations" value="4" raw={4} />
                        <StatCard label="Bitcoin behind them" value="1.7210 BTC" raw={1.721} />
                        <StatCard label="Longest held" value="1,093 days" raw={1093} hint="Since block 814,210" />
                    </StatGrid>
                    <ToolGrid tools={attestTools('')} />
                    <div className="flex flex-col gap-3">
                        <FilterChips
                            label="Show"
                            value={filter}
                            onChange={setFilter}
                            options={[
                                { value: 'all', label: 'All', count: 4 },
                                { value: 'active', label: 'Active', count: 2 },
                                { value: 'moved', label: 'Coins moved', count: 1 },
                                { value: 'expired', label: 'Expired', count: 1 },
                            ]}
                        />
                        <DataTable
                            caption="Attestations"
                            rows={rows}
                            rowKey={(r) => r.id}
                            columns={[
                                { key: 'address', header: 'Address', primary: true, cell: (r) => <HashChip value={r.address} explorer="address" copy={false} /> },
                                { key: 'sats', header: 'Held', numeric: true, cell: (r) => r.sats },
                                { key: 'days', header: 'Days unspent', numeric: true, cell: (r) => r.days.toLocaleString('en-US') },
                                { key: 'state', header: 'State', cell: (r) => <AttestState state={r.state} /> },
                                { key: 'seen', header: 'Checked', wide: true, cell: (r) => r.seen },
                            ]}
                        />
                    </div>
                </div>
            </ToolShell>
        );
    },
};

export const Verify: StoryObj = {
    name: 'Tool shell: verify',
    render: () => (
        <ToolShell protocol="stamp" tools={stampTools('verify')} account={<SessionAccountView state="checking" signInHref="https://ochk.io/signin" />}>
            <div className="mx-auto flex max-w-[48rem] flex-col gap-6">
                <PageHeader eyebrow="OC Stamp" title="Verify a stamp" description="Drop a .stamp file, paste an envelope, or open a share link." />
                <VerifyReport
                    verdict="good"
                    title="Signed by this address, in block 971,632."
                    summary="The signature and the anchor both check out against Bitcoin."
                    checks={[
                        { label: 'The id matches the envelope', state: 'ok' },
                        {
                            label: 'BIP-322 signature',
                            state: 'ok',
                            note: (
                                <>
                                    Signed by <span className="break-all font-mono">{ADDRESS}</span>
                                </>
                            ),
                        },
                        { label: 'The file matches the hash', state: 'ok', note: 'annual-report-2026.pdf, 471 KB' },
                        { label: 'Anchored in a Bitcoin block', state: 'ok', note: 'Block 971,632 · 20 Oct 2026, 10:02 UTC' },
                        { label: 'Stake behind the signer', state: 'none', note: 'No OC Attest is bound to this stamp.' },
                    ]}
                    notChecked={['Whether the signer is who they say they are off-chain.', 'What the file means. A stamp proves who and when, not that it is true.']}
                />
                <AnchorStatus state="anchored" blockHeight={971632} blockTime={1792490520} />
                <ArtifactView content={ENVELOPE} title="Stamp envelope" filename="annual-report-2026.pdf.stamp" maxLines={14} />
            </div>
        </ToolShell>
    ),
};

const PledgeState = createStateBadge({
    open: { label: 'Open', tone: 'neutral' },
    kept: { label: 'Kept', tone: 'good' },
    broken: { label: 'Broken', tone: 'bad' },
    lapsed: { label: 'Lapsed', tone: 'quiet' },
    disputed: { label: 'Disputed', tone: 'attention' },
});

export const Parts: StoryObj = {
    name: 'Tool parts',
    render: () => (
        <div className="oca-container grid grid-cols-1 gap-10 py-10 lg:grid-cols-2">
            <section className="flex flex-col gap-5">
                <h2 className="oca-title">Anchors</h2>
                <AnchorStatus state="anchored" blockHeight={971632} blockTime={1792490520} />
                <AnchorStatus state="pending" submittedAt={1792487642} calendar="https://alice.btc.calendar.opentimestamps.org" />
                <AnchorStatus state="unverified" blockHeight={971632} />
                <AnchorStatus state="none" />
                <AnchorStatus state="fail" blockHeight={971630} />
            </section>
            <section className="flex flex-col gap-5">
                <h2 className="oca-title">Blocks</h2>
                <p className="text-[0.9375rem]">
                    The stamp is in <BlockHeight height={971632} label />.
                </p>
                <BlockCountdown target={972000} tip={971632} from={971200} />
                <BlockCountdown target={972000} tip={972004} reached="Revealed" />
                <BlockCountdown target={980064} tip={null} />
            </section>
            <section className="flex flex-col gap-5">
                <h2 className="oca-title">Meters</h2>
                <Meter label="Turnout, by weight" value={6200000} max={10000000} figure="62%" />
                <Meter label="Raised for the audit" value={1200000} ghost={500000} max={2000000} figure="1.2M of 2M sats" tone="brand" />
                <Meter label="Strength" value={3} max={4} figure="Strong" size="sm" />
            </section>
            <section className="flex flex-col gap-5">
                <h2 className="oca-title">States, filters, ids</h2>
                <div className="flex flex-wrap gap-2">
                    {(['open', 'kept', 'broken', 'lapsed', 'disputed'] as const).map((s) => (
                        <PledgeState key={s} state={s} />
                    ))}
                </div>
                <FilterChips
                    label="Pledges"
                    multiple
                    value={['open', 'disputed']}
                    onChange={() => {}}
                    options={[
                        { value: 'open', label: 'Open', count: 12 },
                        { value: 'kept', label: 'Kept', count: 48 },
                        { value: 'broken', label: 'Broken', count: 3 },
                        { value: 'disputed', label: 'Disputed', count: 1 },
                    ]}
                />
                <div className="flex flex-col gap-2 text-[0.9375rem]">
                    <span className="flex items-center gap-2">
                        Address <HashChip value={ADDRESS} explorer="address" />
                    </span>
                    <span className="flex items-center gap-2">
                        Anchoring tx <HashChip value="9c4b0f6a1e2d3c4b5a69788796a5b4c3d2e1f0a9b8c7d6e5f4a3b2c1d0e9f8a7" explorer="tx" />
                    </span>
                    <span className="flex items-center gap-2">
                        Recovery code, cleared from the clipboard after 30 seconds
                        <CopyButton value="ochk-rc-7f3a-91de-22c0" label="Copy recovery code" clearAfter={30_000} />
                    </span>
                </div>
            </section>
            <section className="flex flex-col gap-5 lg:col-span-2">
                <h2 className="oca-title">Drop zone</h2>
                <div className="grid grid-cols-1 items-start gap-5 md:grid-cols-2">
                    <DropZone onFile={() => {}} onText={() => {}} hint="Any file. It is hashed here, never uploaded." />
                    <DropZone
                        onFile={() => {}}
                        file={{ name: 'release-v2.4.0.tar.gz', size: 48_211_337, type: 'application/gzip' }}
                        progress={0.42}
                    />
                </div>
                <DropZone onFile={() => {}} accept=".stamp,application/json" title="Drop a .stamp file" error="That is not a stamp envelope: it has no sig field." />
            </section>
        </div>
    ),
};

export const Density: StoryObj = {
    name: 'Density',
    render: () => {
        const sample = (title: string) => (
            <section className="flex min-w-0 flex-col gap-5">
                <h2 className="oca-title">{title}</h2>
                <Field label="Envelope id">
                    <Input defaultValue="86020d78db788237e9f0c1b2a3d4e5f6" className="font-mono" />
                </Field>
                <StatGrid>
                    <StatCard label="Stamps" value="128" raw={128} />
                    <StatCard label="Anchored" value="121" raw={121} />
                    <StatCard label="Pending" value="7" raw={7} />
                </StatGrid>
                <KeyValueList
                    items={[
                        { label: 'Signer', value: ADDRESS, mono: true },
                        { label: 'Block', value: '971,632' },
                    ]}
                />
                <DataTable
                    caption="Recent stamps"
                    rows={ROWS.slice(0, 3)}
                    rowKey={(r) => r.id}
                    columns={[
                        { key: 'a', header: 'Signer', primary: true, cell: (r) => <HashChip value={r.address} copy={false} /> },
                        { key: 'd', header: 'Days', numeric: true, cell: (r) => r.days },
                    ]}
                />
            </section>
        );
        return (
            <div className="oca-container grid grid-cols-1 gap-12 py-10 lg:grid-cols-2">
                {sample('Comfortable: a public page')}
                <DensityProvider density="compact">{sample('Compact: a tool')}</DensityProvider>
            </div>
        );
    },
};

export const Session: StoryObj = {
    name: 'Account control',
    render: () => (
        <div className="flex flex-col">
            {(['checking', 'out', 'in', 'unknown'] as const).map((state) => (
                <div key={state} className="border-b border-border">
                    <SiteHeader
                        variant="tool"
                        product="stamp"
                        family="stamp"
                        nav={stampTools('create').map((t) => ({ href: t.href, label: t.label, active: t.active }))}
                        actions={
                            <>
                                <span className="text-[0.8125rem] text-muted-foreground max-sm:hidden">{state}</span>
                                {/* In place: this site's /signin, returning to the page it was opened from. */}
                                <SessionAccountView state={state} name="you@example.com" signInPath="/signin" />
                            </>
                        }
                    />
                </div>
            ))}
        </div>
    ),
};

export const App: StoryObj = {
    name: 'Tool shell: app',
    render: () => (
        <ToolShell
            protocol="lock"
            variant="app"
            tools={[
                { href: '/app', label: 'Inbox', icon: <Inbox />, active: true },
                { href: '/unlock', label: 'Unlock', icon: <BadgeCheck /> },
                { href: '/playground', label: 'Playground', icon: <SearchIcon /> },
            ]}
            account={signedIn}
        >
            <div className="flex min-h-0 flex-1">
                <div className="hidden w-80 shrink-0 flex-col border-r border-border md:flex">
                    {['Sealed for you · 2', 'From bc1qxy2k…hx0wlh', 'Release keys, 2026'].map((t, i) => (
                        <div key={t} className={i === 0 ? 'border-b border-border bg-accent px-5 py-4' : 'border-b border-border px-5 py-4'}>
                            <p className="text-[0.9375rem] font-medium">{t}</p>
                            <p className="text-[0.8125rem] text-muted-foreground">Sealed to {ADDRESS.slice(0, 10)}…</p>
                        </div>
                    ))}
                </div>
                <div className="flex min-w-0 flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
                    <p className="oca-title-sm">Sealed for you</p>
                    <p className="oca-body max-w-sm">Only the holder of this address can open it. The page fills the window and scrolls inside.</p>
                </div>
            </div>
        </ToolShell>
    ),
};
