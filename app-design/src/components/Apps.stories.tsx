import type { Meta, StoryObj } from '@storybook/react';
import { Copy, Globe, KeyRound, Lock, Plus, Rocket, Star, Users, Wallet } from 'lucide-react';
import { useState } from 'react';

import { Button, DialogHost, prompt } from '../primitives';
import {
    ChoiceCard,
    ChoiceGroup,
    ComparisonTable,
    CommandDialog,
    CountdownRing,
    ListCard,
    LockedPreview,
    Meter,
    Monogram,
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
