import type { Meta, StoryObj } from '@storybook/react';
import {
    Archive,
    ArrowLeft,
    ChevronRight,
    Copy,
    ExternalLink,
    Globe,
    KeyRound,
    Lock,
    MoreHorizontal,
    Pencil,
    Plus,
    Rocket,
    ShieldCheck,
    Star,
    Trash2,
    Users,
    Wallet,
} from 'lucide-react';
import { useState } from 'react';

import { PaneHeader } from '../chrome';
import {
    Badge,
    Button,
    Card,
    DialogHost,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    prompt,
} from '../primitives';
import {
    Avatar,
    ChoiceCard,
    ChoiceGroup,
    ComparisonTable,
    CommandDialog,
    CountdownRing,
    ListCard,
    ListRow,
    LockedPreview,
    Meter,
    Monogram,
    Notice,
    PlanCard,
    Sats,
    SectionTitle,
    type SearchGroup,
} from './index';

/* vault and btc are the samples: a code, plans, commands, what a sign-in opens. */
const meta: Meta = { title: 'App parts' };
export default meta;

const ENTRIES = ['github.com', 'mail.proton.me', 'kraken.com', 'bitcointalk.org', 'ochk.app'];

export const Commands: StoryObj = {
    name: 'Command palette',
    render: function Render() {
        const [open, setOpen] = useState(false);
        const [last, setLast] = useState('nothing yet');
        const onQuery = (q: string): SearchGroup[] => [
            {
                label: q ? 'Entries' : 'Recent',
                results: ENTRIES.filter((e) => !q || e.includes(q.toLowerCase()))
                    .slice(0, q ? 30 : 3)
                    .map((e) => ({ id: e, href: `#${e}`, title: e, icon: <KeyRound />, meta: 'Login' })),
            },
            {
                label: 'Actions',
                results: [
                    { id: 'new', title: 'New entry', icon: <Plus />, run: () => setLast('New entry') },
                    { id: 'lock', title: 'Lock the vault', icon: <Lock />, run: () => setLast('Lock the vault') },
                ].filter((a) => !q || a.title.toLowerCase().includes(q.toLowerCase())),
            },
        ];
        return (
            <div className="flex flex-col items-start gap-3">
                <Button variant="secondary" onClick={() => setOpen(true)}>
                    Open the palette (⌘K)
                </Button>
                <p className="oca-body">Last action run: {last}.</p>
                <CommandDialog onQuery={onQuery} open={open} onOpenChange={setOpen} onSelect={(r) => setLast(`opened ${r.href}`)} />
            </div>
        );
    },
};

export const Code: StoryObj = {
    name: 'One-time code',
    render: () => (
        <div className="flex max-w-sm flex-col gap-6">
            <div className="flex items-center justify-between rounded-2xl border border-border bg-card px-4 py-3">
                <span className="font-mono text-[1.125rem] tracking-[0.12em] oca-tabular">482 913</span>
                <span className="flex items-center gap-3">
                    {/* Follows the clock in 30-second windows, as the code does. */}
                    <CountdownRing period={30} />
                    <Button size="sm" variant="ghost" aria-label="Copy code">
                        <Copy />
                    </Button>
                </span>
            </div>
            <div className="flex items-center gap-6">
                <CountdownRing period={30} remaining={21} />
                <CountdownRing period={30} remaining={4} />
                <CountdownRing period={30} remaining={12} size={28} showSeconds={false} />
            </div>
        </div>
    ),
};

const PLANS = [
    { key: 'local', name: 'Local', subtitle: 'One browser, no sync.', price: 'Free', features: ['Unlimited entries', 'Passkeys and TOTP'] },
    { key: 'monthly', name: 'Monthly', subtitle: 'Sync across your devices.', price: <Sats value={21000} />, period: 'a month', footnote: '≈ $14', features: ['Everything in Local', 'Encrypted sync', 'One-time shares'] },
    { key: 'annual', name: 'Annual', subtitle: 'Two months free.', price: <Sats value={210000} />, period: 'a year', footnote: '≈ $140', features: ['Everything in Monthly', 'Priority recovery'], highlight: true },
    { key: 'family', name: 'Family', subtitle: 'Up to five people.', price: <Sats value={420000} />, period: 'a year', footnote: '≈ $280', features: ['Everything in Annual', 'Shared vaults'] },
];

export const Plans: StoryObj = {
    name: 'Plans',
    render: () => (
        <div className="flex flex-col gap-8">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                {PLANS.map((p) => (
                    <PlanCard
                        key={p.key}
                        name={p.name}
                        subtitle={p.subtitle}
                        price={p.price}
                        period={p.period}
                        footnote={p.footnote}
                        features={p.features}
                        highlight={p.highlight}
                        badge={p.key === 'local' ? 'Your plan' : p.highlight ? 'Recommended' : undefined}
                        badgeTone={p.key === 'local' ? 'success' : 'brand'}
                        action={
                            p.key === 'local' ? (
                                <Button variant="secondary" disabled>
                                    Included
                                </Button>
                            ) : (
                                <Button variant={p.highlight ? 'primary' : 'secondary'}>Pay with bitcoin</Button>
                            )
                        }
                    />
                ))}
            </div>
            <ComparisonTable
                label="What each plan includes"
                columns={PLANS.map((p) => ({ key: p.key, label: p.name, highlight: p.highlight }))}
                rows={[
                    { label: 'Encrypted sync', values: { local: 'No', monthly: 'Yes', annual: 'Yes', family: 'Yes' } },
                    { label: 'One-time shares', values: { local: 'No', monthly: 'Yes', annual: 'Yes', family: 'Yes' } },
                    { label: 'People', values: { local: '1', monthly: '1', annual: '1', family: 'Up to 5' } },
                ]}
            />
        </div>
    ),
};

export const Locked: StoryObj = {
    name: 'Locked preview',
    render: () => (
        <div className="flex max-w-2xl flex-col gap-10">
            <LockedPreview
                title="Your watchlist"
                description="Sign in to keep a list of addresses and get a note when one moves. It's free."
                action={<Button>Sign in</Button>}
            >
                <ul className="divide-y divide-border rounded-2xl border border-border bg-card">
                    {['bc1qxy2k…hx0wlh', 'bc1p5d7r…g3297', '3J98t1Wp…WNLy', 'bc1qar0s…mdq', '1BvBMSEY…NVN2'].map((a, i) => (
                        <li key={a} className="flex items-center justify-between px-4 py-3 text-[0.9375rem]">
                            <span className="flex items-center gap-2 font-mono">
                                <Star aria-hidden className="size-4 text-muted-foreground" />
                                {a}
                            </span>
                            <span className="text-muted-foreground oca-tabular">{(i + 1) * 0.21} BTC</span>
                        </li>
                    ))}
                </ul>
            </LockedPreview>
            <LockedPreview title="Shared vaults" description="On the Family plan." action={<Button variant="secondary">See the plans</Button>} />
        </div>
    ),
};

export const Strength: StoryObj = {
    name: 'Meter with a verdict',
    render: () => (
        <div className="flex max-w-sm flex-col gap-5">
            <Meter value={1} max={4} label="Strength" figure="Weak" tone="bad" size="sm" />
            <Meter value={2} max={4} label="Strength" figure="Fair" tone="caution" size="sm" />
            <Meter value={4} max={4} label="Strength" figure="Very strong" tone="good" size="sm" />
        </div>
    ),
};

export const AskTwice: StoryObj = {
    name: 'Prompt, asked twice',
    render: function Render() {
        const [got, setGot] = useState<string | null>(null);
        return (
            <div className="flex flex-col items-start gap-3">
                <Button
                    onClick={async () => {
                        const v = await prompt({
                            title: 'Set a backup passphrase',
                            message: 'You need it to restore the vault on a new device. We cannot recover it.',
                            label: 'Passphrase',
                            secret: true,
                            minLength: 8,
                            confirmField: true,
                            confirmLabel: 'Set passphrase',
                        });
                        setGot(v === null ? 'cancelled' : `${v.length} characters`);
                    }}
                >
                    Set a backup passphrase
                </Button>
                {got ? <p className="oca-body">Answer: {got}.</p> : null}
                <DialogHost />
            </div>
        );
    },
};

/** A block's title, rows in one card, and a choice between cards: the parts signed-in pages kept drawing by hand. */
export const Sections: StoryObj = {
    name: 'Sections, lists, choices',
    render: function Render() {
        const [who, setWho] = useState<'builder' | 'backer' | 'both'>('builder');
        const [post, setPost] = useState('holders');
        return (
            <div className="flex max-w-[48rem] flex-col gap-12">
                <section className="flex flex-col gap-4">
                    <SectionTitle
                        title="Backers"
                        meta="3 of 40"
                        description="People who put their address behind this project."
                        action={
                            <Button size="sm" variant="secondary">
                                View all
                            </Button>
                        }
                    />
                    <ListCard>
                        {[
                            { name: 'Ada Lovelace', when: 'Backed 2 days ago', amount: '250,000 sats' },
                            { name: 'Satoshi Fan Club', when: 'Backed last week', amount: '1,000,000 sats' },
                            { name: 'bc1q9h7…e3w7t', when: 'Backed in July', amount: '50,000 sats' },
                        ].map(({ name, when, amount }) => (
                            <li key={name} className="flex items-center gap-3 px-5 py-4">
                                <Monogram name={name} size="xs" />
                                <div className="min-w-0 flex-1">
                                    <p className="truncate text-[0.9375rem] font-medium">{name}</p>
                                    <p className="text-[0.8125rem] text-muted-foreground">{when}</p>
                                </div>
                                <span className="oca-tabular text-[0.9375rem]">{amount}</span>
                            </li>
                        ))}
                    </ListCard>
                </section>
                <section className="flex flex-col gap-4">
                    <SectionTitle title="Start as" description="You can change it later." />
                    <ChoiceGroup label="Start as" value={who} onValueChange={setWho} columns={3}>
                        <ChoiceCard value="builder" icon={<Rocket />} title="A builder" description="Post what you bring and what you need." />
                        <ChoiceCard value="backer" icon={<Wallet />} title="A backer" description="Put sats behind people building." />
                        <ChoiceCard value="both" icon={<Users />} title="Both" description="Build, and back others." />
                    </ChoiceGroup>
                </section>
                <section className="flex max-w-[28rem] flex-col gap-3">
                    <SectionTitle title="Who can post" size="sm" as="h3" />
                    <ChoiceGroup label="Who can post" value={post} onValueChange={setPost} size="sm">
                        <ChoiceCard value="anyone" icon={<Globe />} title="Anyone" description="Any signed-in address." />
                        <ChoiceCard value="holders" icon={<KeyRound />} title="Holders" description="An address holding at least 100,000 sats." />
                        <ChoiceCard value="me" icon={<Lock />} title="Only me" />
                    </ChoiceGroup>
                </section>
                <SectionTitle title="Delete this project" tone="danger" description="Its page and every cosign on it go. This cannot be undone." action={<Button variant="danger" size="sm">Delete</Button>} />
            </div>
        );
    },
};

/* A picture for the avatar story: drawn here, so the story loads nothing. */
const FACE =
    'data:image/svg+xml;utf8,' +
    encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffb37a"/><stop offset="1" stop-color="#c2410c"/></linearGradient></defs><rect width="64" height="64" fill="url(#g)"/><circle cx="32" cy="26" r="11" fill="#fff4ea"/><path d="M12 60c3-12 11-18 20-18s17 6 20 18z" fill="#fff4ea"/></svg>'
    );

/** What can be done to a thread: a menu, so the arrow keys and Escape work, not a popover of buttons. */
function ThreadActions({ name }: { name: string }) {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Actions for ${name}`} className="text-muted-foreground max-md:size-11">
                    <MoreHorizontal />
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-48">
                <DropdownMenuItem>
                    <Pencil /> Rename
                </DropdownMenuItem>
                <DropdownMenuItem>
                    <Copy /> Copy address
                </DropdownMenuItem>
                <DropdownMenuItem>
                    <Archive /> Archive
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem destructive>
                    <Trash2 /> Forget
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

const THREADS = [
    { id: 'bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t', name: 'Ada Lovelace', last: 'The keys are in the usual place.', when: '2m', unread: 2, src: FACE },
    { id: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh', name: 'Satoshi Fan Club', last: 'You: see you at block 972,000', when: '1h', unread: 0 },
    { id: 'did:oc:7f3a91de22c0', name: null, last: 'wants to reach you', when: 'Tue', unread: 0 },
    { id: 'bc1qbroken', name: 'Hal', last: 'Running bitcoin', when: 'Mon', unread: 0, src: 'https://invalid.example/missing.png' },
];

/** Rows in a card and in a pane, their menus, people's avatars, a notice with an icon. */
export const Rows: StoryObj = {
    name: 'Rows, menus, people',
    render: function Render() {
        const [open, setOpen] = useState(THREADS[0]!.id);
        return (
            <div className="flex max-w-[60rem] flex-col gap-12">
                <section className="flex flex-col gap-4">
                    <SectionTitle title="Messages" meta="4 threads" />
                    <ListCard>
                        {THREADS.map((t) => (
                            <ListRow
                                key={t.id}
                                href={`#${t.id}`}
                                leading={<Avatar seed={t.id} name={t.name} src={t.src} />}
                                title={t.name ?? 'Someone new'}
                                meta={t.when}
                                description={t.last}
                                unread={t.unread > 0}
                                trailing={
                                    t.unread > 0 ? (
                                        <Badge tone="brand">
                                            {t.unread}
                                            <span className="sr-only"> unread</span>
                                        </Badge>
                                    ) : (
                                        <ChevronRight aria-hidden className="size-4 text-muted-foreground" />
                                    )
                                }
                            />
                        ))}
                    </ListCard>
                </section>
                <section className="flex flex-col gap-4">
                    <SectionTitle title="Your steps" description='size="lg": a step to read, not a row to scan. The value at 1.125rem, room around it, hairlines inset to the text.' />
                    <ListCard>
                        {(
                            [
                                ['Sign in', 'Next', '1 · Bitcoin address', 'A second way in is also your way back.', 'Add a second way in'],
                                ['Back it', null, 'Not yet', null, 'Back your account'],
                                ['Get paid', 'In testing', 'No app pays you yet.', 'When one does, each event lands in Activity with a receipt anyone can check.', 'See an example receipt'],
                                ['Own it', null, 'orangecheck holds what you earn, for now', null, 'Who holds it'],
                            ] as const
                        ).map(([label, badge, value, note, act], i) => (
                            <ListRow
                                key={label}
                                size="lg"
                                lines="all"
                                eyebrow={
                                    <span className="flex flex-wrap items-center gap-2">
                                        {label}
                                        {badge ? <Badge tone={i === 0 ? 'brand' : 'muted'}>{badge}</Badge> : null}
                                    </span>
                                }
                                title={value}
                                description={note ?? undefined}
                                action={
                                    <Button size="sm" variant={i === 0 ? 'primary' : 'secondary'}>
                                        {act}
                                    </Button>
                                }
                            />
                        ))}
                    </ListCard>
                </section>
                <section className="flex flex-col gap-4">
                    <SectionTitle title="A list in a card" description="Card flush: the list runs to the card's edges, its rows lined up with the card's text, not a card inside a card." />
                    <Card flush className="flex flex-col gap-4">
                        <h3 className="oca-title-sm">System health</h3>
                        <p className="text-[0.875rem] text-muted-foreground">What each part said a minute ago.</p>
                        <ListCard>
                            {['Relay', 'Executor', 'Mint'].map((t) => (
                                <ListRow key={t} title={t} description="Answering in 120 ms" trailing={<Badge tone="success">up</Badge>} />
                            ))}
                        </ListCard>
                        <p className="text-[0.8125rem] text-muted-foreground">Checked every minute.</p>
                    </Card>
                </section>
                <section className="flex flex-col gap-4">
                    <SectionTitle title="Signed for you" description="A line over the title, two under it, and a text action: beside them from sm, under them on a phone." />
                    <ListCard>
                        <ListRow
                            href="#lumen"
                            leading={<Avatar seed="lumen" name="Lumen Notes" />}
                            eyebrow="Signed · 21 Oct"
                            title="Lumen Notes"
                            meta="2 min ago"
                            description="Asked to read your identity"
                            detail="From notes.example, key 86020d78"
                            action={
                                <Button size="sm" variant="secondary">
                                    Revoke
                                </Button>
                            }
                        />
                        <ListRow
                            leading={<Avatar seed="guardian-2" name="Guardian two" />}
                            eyebrow="Guardian 2 of 4"
                            title="Did not answer the last round"
                            description="Last seen 14 minutes ago"
                            action={
                                <Button size="sm" variant="secondary">
                                    Retry this guardian
                                </Button>
                            }
                        />
                        {/* A title that is one long token: stackBelow="sm" gives it the whole row on a phone, the badge under it. */}
                        <ListRow
                            lines="all"
                            stackBelow="sm"
                            title="bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7tqzs2x9fhd5n6y8ue0cle"
                            description="Eligible: 0.5 BTC held since block 814,210"
                            trailing={<Badge tone="success">Eligible</Badge>}
                        />
                        {/* A wide end: beside the text on a desk, under it on a phone, never squeezing the title to a word. */}
                        <ListRow
                            leading={<Avatar seed="xaxis" name="xaxis" />}
                            title="xaxis"
                            description="Holds 0.5 BTC, unspent since block 814,210; signed with the address it names"
                            trailing={
                                <>
                                    <Badge tone="success">Confirmed</Badge>
                                    <Button size="icon-sm" variant="ghost" aria-label="Copy the proof">
                                        <Copy />
                                    </Button>
                                    <Button size="icon-sm" variant="ghost" aria-label="Open the proof">
                                        <ExternalLink />
                                    </Button>
                                </>
                            }
                        />
                    </ListCard>
                </section>
                <section className="flex flex-col gap-3">
                    <SectionTitle title="In a pane" size="sm" as="h3" description="A thread list beside an open thread: the current row lifts, the menu shows on hover from md." />
                    <div className="flex h-[26rem] overflow-hidden rounded-[1.25rem] border border-border bg-background">
                        <div className="flex w-full max-w-[22rem] flex-col border-r border-border">
                            <PaneHeader>
                                <span className="oca-title-sm flex-1">Messages</span>
                                <Button variant="ghost" size="icon" aria-label="New thread" className="max-md:size-11">
                                    <Plus />
                                </Button>
                            </PaneHeader>
                            <ul className="flex flex-col gap-1 overflow-y-auto p-2">
                                {THREADS.map((t) => (
                                    <ListRow
                                        key={t.id}
                                        variant="pane"
                                        onSelect={() => setOpen(t.id)}
                                        current={open === t.id}
                                        leading={<Avatar seed={t.id} name={t.name} src={t.src} size="md" />}
                                        title={t.name ?? 'Someone new'}
                                        meta={t.when}
                                        description={t.last}
                                        unread={t.unread > 0}
                                        actions={<ThreadActions name={t.name ?? 'this thread'} />}
                                        revealActions="hover"
                                    />
                                ))}
                            </ul>
                        </div>
                        <div className="hidden min-w-0 flex-1 flex-col sm:flex">
                            <PaneHeader>
                                <Button variant="ghost" size="icon" aria-label="Back" className="md:hidden">
                                    <ArrowLeft />
                                </Button>
                                <Avatar seed={open} name={THREADS.find((t) => t.id === open)?.name} src={THREADS.find((t) => t.id === open)?.src} size="xs" />
                                <span className="truncate text-[0.9375rem] font-medium">{THREADS.find((t) => t.id === open)?.name ?? 'Someone new'}</span>
                            </PaneHeader>
                            <div className="flex flex-1 items-center justify-center p-6 text-center text-[0.9375rem] text-muted-foreground">The thread opens here.</div>
                        </div>
                    </div>
                </section>
                <section className="flex flex-col gap-4">
                    <SectionTitle title="Read in full" size="sm" as="h3" description='lines="all": a query and its note wrap whole; the picture and the end stay level with the title.' />
                    <ListCard>
                        <ListRow
                            onSelect={() => {}}
                            lines="all"
                            title="Open pledges from one address"
                            meta="3"
                            description={'pledge.query(address="bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t", status="open")\nEvery open pledge from this address, newest first.'}
                            trailing={<ChevronRight aria-hidden className="size-4 text-muted-foreground" />}
                        />
                    </ListCard>
                </section>
                <section className="flex flex-col gap-4">
                    <SectionTitle title="People" size="sm" as="h3" description="A picture when there is one; initials on their own tint; a person when there is no name. A picture that fails to load falls back." />
                    <div className="flex flex-wrap items-end gap-4">
                        {(['2xs', 'xs', 'sm', 'md', 'lg'] as const).map((size) => (
                            <Avatar key={size} seed="bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t" name="Ada Lovelace" size={size} />
                        ))}
                        <Avatar seed="x" src={FACE} size="lg" />
                        <Avatar seed="did:oc:7f3a91de22c0" size="lg" />
                        <Avatar seed="bc1qbroken" name="Hal" src="https://invalid.example/missing.png" size="lg" />
                    </div>
                    <div className="flex flex-wrap gap-2">
                        {['Ada Lovelace', 'Satoshi N', 'Hal Finney', 'Nick Szabo', 'Wei Dai', 'Adam Back', 'Len Sassaman', 'Zooko'].map((n) => (
                            <Avatar key={n} seed={n} name={n} size="md" />
                        ))}
                    </div>
                </section>
                <section className="flex flex-col gap-3">
                    <Notice icon={<ShieldCheck />} title="End to end">
                        Only you and Ada hold the keys to this thread. orangecheck cannot read it.
                    </Notice>
                    <Notice tone="warning" icon={<Lock />} title="Set a passphrase first">
                        A passphrase you forget cannot be reset. Export a backup before you turn the lock on.
                    </Notice>
                </section>
            </div>
        );
    },
};
