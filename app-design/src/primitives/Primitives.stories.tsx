import type { Meta, StoryObj } from '@storybook/react';
import { ArrowRight, CircleUser, LogOut, Wallet } from 'lucide-react';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';

import {
    Accordion,
    AccordionItem,
    Badge,
    Button,
    Card,
    CardDescription,
    CardNumeral,
    CardTitle,
    Checkbox,
    confirm,
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogHost,
    DialogTitle,
    DialogTrigger,
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
    Field,
    Input,
    Kbd,
    Label,
    Pagination,
    prompt,
    QrCode,
    RadioGroup,
    RadioGroupItem,
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    Skeleton,
    Spinner,
    StatusBadge,
    StatusDot,
    Switch,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    Textarea,
    toast,
    Toaster,
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from './index';

const meta: Meta = { title: 'Primitives' };
export default meta;

export const Buttons: StoryObj = {
    render: () => (
        <div className="flex flex-col gap-8">
            <div className="flex flex-wrap items-center gap-3">
                <Button size="lg">hello@ochk.io</Button>
                <Button size="lg" variant="secondary">
                    ochk.io/docs
                </Button>
                <Button>Create account</Button>
                <Button variant="secondary">See how it works</Button>
                <Button variant="ghost">Cancel</Button>
                <Button variant="link">Read the spec</Button>
                <Button variant="danger">Revoke</Button>
                <Button loading>Signing</Button>
                <Button disabled>Disabled</Button>
                <Button size="sm">
                    Continue <ArrowRight />
                </Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-[1.25rem] bg-brand p-8">
                <Button variant="primary">Book a call</Button>
                <Button variant="secondary">Read the docs</Button>
            </div>
            <div className="flex flex-wrap items-center gap-3 rounded-[1.25rem] bg-oca-ink p-8">
                <Button variant="onInk">Integrate</Button>
                <Button variant="onInkOutline">GitHub</Button>
            </div>
        </div>
    ),
};

export const Badges: StoryObj = {
    render: () => (
        <div className="flex flex-wrap items-center gap-2">
            <Badge>in testing</Badge>
            <Badge>on the path</Badge>
            <Badge tone="muted">draft</Badge>
            <Badge tone="brand">new</Badge>
            <Badge tone="success">
                <StatusDot tone="success" /> live
            </Badge>
            <Badge tone="warning">held</Badge>
            <Badge tone="danger">failed</Badge>
            <Badge tone="info">signet</Badge>
            <Badge tone="ink">owner</Badge>
        </div>
    ),
};

export const Cards: StoryObj = {
    render: () => (
        <div className="grid gap-5 md:grid-cols-3">
            <Card className="flex flex-col gap-3">
                <CardNumeral>01</CardNumeral>
                <CardTitle>Sign in</CardTitle>
                <CardDescription>The way they always do. Email or a wallet. Nothing new to learn.</CardDescription>
            </Card>
            <Card className="flex flex-col gap-3" interactive>
                <CardNumeral>02</CardNumeral>
                <CardTitle>
                    Earn <Badge>in testing</Badge>
                </CardTitle>
                <CardDescription>Small amounts for things they already do online, shared by your app.</CardDescription>
            </Card>
            <Card tone="ink" className="flex flex-col gap-3">
                <CardTitle className="text-oca-ink-title">A direct line</CardTitle>
                <p className="text-oca-ink-muted">You talk to the person who built it. Not a sales team.</p>
            </Card>
        </div>
    ),
};

export const Forms: StoryObj = {
    render: function FormsStory() {
        const [on, setOn] = useState(true);
        const [suggest, setSuggest] = useState(false);
        return (
            <Card className="flex max-w-xl flex-col gap-6">
                <Field label="Project name" hint="What your users will see.">
                    <Input placeholder="Lumen Notes" />
                </Field>
                <Field label="Payout address" error="That isn't a Bitcoin or Lightning address.">
                    <Input defaultValue="not-an-address" />
                </Field>
                <Field
                    label="Invite an operator"
                    hint="Their account id. They can copy it from their Account page."
                    action={<Button variant="secondary">Invite</Button>}
                >
                    <Input placeholder="Account id" />
                </Field>
                <Field label="Your Bitcoin address" hint="Focus it: the suggestion anchors under the input, not under this hint.">
                    {(control) => (
                        <div className="relative">
                            <Input
                                {...control}
                                defaultValue="bc1q9h"
                                className="font-mono"
                                autoComplete="off"
                                onFocus={() => setSuggest(true)}
                                onBlur={() => setSuggest(false)}
                            />
                            <div
                                hidden={!suggest}
                                role="listbox"
                                aria-label="Suggestions"
                                className="absolute inset-x-0 top-[calc(100%+4px)] z-10 rounded-xl border border-border bg-popover p-1 shadow-md"
                            >
                                <div role="option" aria-selected className="flex justify-between rounded-lg bg-accent px-3 py-2 text-[0.8125rem]">
                                    use your address <span className="font-mono">bc1q9h7g…z5e3w7t</span>
                                </div>
                            </div>
                        </div>
                    )}
                </Field>
                <Field label="Why you're asking">
                    <Textarea placeholder="One or two sentences." />
                </Field>
                <Field label="Network">
                    <Select defaultValue="signet">
                        <SelectTrigger>
                            <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="signet">signet (testing)</SelectItem>
                            <SelectItem value="bitcoin">bitcoin (mainnet)</SelectItem>
                        </SelectContent>
                    </Select>
                </Field>
                <div className="flex items-center gap-3">
                    <Switch id="notify" checked={on} onCheckedChange={setOn} />
                    <Label htmlFor="notify">Email me when a payout lands</Label>
                </div>
                <div className="flex items-center gap-3">
                    <Checkbox id="agree" defaultChecked />
                    <Label htmlFor="agree">I've read what's true today</Label>
                </div>
                <RadioGroup defaultValue="monthly" aria-label="Cadence">
                    {['weekly', 'monthly'].map((v) => (
                        <div key={v} className="flex items-center gap-3">
                            <RadioGroupItem value={v} id={`r-${v}`} />
                            <Label htmlFor={`r-${v}`}>{v}</Label>
                        </div>
                    ))}
                </RadioGroup>
            </Card>
        );
    },
};

export const Overlays: StoryObj = {
    render: () => (
        <TooltipProvider>
            <div className="flex flex-wrap items-center gap-3">
                <Dialog>
                    <DialogTrigger asChild>
                        <Button>Open dialog</Button>
                    </DialogTrigger>
                    <DialogContent>
                        <DialogHeader>
                            <DialogTitle>Bind a payout address</DialogTitle>
                            <DialogDescription>
                                Payouts go here. You can change it later; the change is recorded.
                            </DialogDescription>
                        </DialogHeader>
                        <Field label="Address">
                            <Input placeholder="bc1q… or name@domain" />
                        </Field>
                        <DialogFooter>
                            <Button variant="secondary">Cancel</Button>
                            <Button>Bind</Button>
                        </DialogFooter>
                    </DialogContent>
                </Dialog>
                <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                        <Button variant="secondary">Menu</Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                        <DropdownMenuItem>
                            <Wallet /> Balance
                        </DropdownMenuItem>
                        <DropdownMenuItem>
                            <CircleUser /> Account
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem destructive>
                            <LogOut /> Sign out
                        </DropdownMenuItem>
                    </DropdownMenuContent>
                </DropdownMenu>
                <Tooltip>
                    <TooltipTrigger asChild>
                        <Button variant="ghost">Hover me</Button>
                    </TooltipTrigger>
                    <TooltipContent>Held by orangecheck today</TooltipContent>
                </Tooltip>
            </div>
        </TooltipProvider>
    ),
};

export const TabsAndFeedback: StoryObj = {
    name: 'Tabs and feedback',
    render: () => (
        <div className="flex flex-col gap-10">
            <Tabs defaultValue="earnings">
                <TabsList>
                    <TabsTrigger value="earnings">Earnings</TabsTrigger>
                    <TabsTrigger value="payouts">Payouts</TabsTrigger>
                    <TabsTrigger value="alerts">Alerts</TabsTrigger>
                </TabsList>
                <TabsContent value="earnings" className="oca-body">
                    Pill tabs switch a view in place.
                </TabsContent>
            </Tabs>
            <Tabs defaultValue="overview" look="line">
                <TabsList>
                    <TabsTrigger value="overview">Overview</TabsTrigger>
                    <TabsTrigger value="keys">Keys</TabsTrigger>
                    <TabsTrigger value="events">Events</TabsTrigger>
                    <TabsTrigger value="billing">Billing</TabsTrigger>
                </TabsList>
            </Tabs>
            {/* Six layers wrap on a phone rather than scroll; each panel stays mounted, as a canvas must. */}
            <Tabs defaultValue="nodes">
                <TabsList wrap>
                    {['Nodes', 'Blocks', 'Mempool', 'Lightning', 'Mining', 'Fees'].map((t) => (
                        <TabsTrigger key={t} value={t.toLowerCase()}>
                            {t}
                        </TabsTrigger>
                    ))}
                </TabsList>
                {['nodes', 'blocks', 'mempool', 'lightning', 'mining', 'fees'].map((t) => (
                    <TabsContent key={t} value={t} keepMounted className="oca-body">
                        The {t} layer. It stays mounted while another shows.
                    </TabsContent>
                ))}
            </Tabs>
            <div className="flex flex-wrap items-center gap-6">
                <Spinner label="Loading" />
                <Skeleton className="h-6 w-40" />
                <Kbd>⌘K</Kbd>
                <span className="inline-flex items-center gap-2 text-sm">
                    <StatusDot tone="success" pulse /> executor running
                </span>
            </div>
        </div>
    ),
};

export const States: StoryObj = {
    name: 'Disabled, loading, scrolling tabs, level fields',
    render: () => (
        <div className="flex max-w-3xl flex-col gap-10">
            <div className="flex flex-wrap gap-3">
                <Button disabled>Register key</Button>
                <Button variant="secondary" disabled>
                    Add webhook
                </Button>
                <Button variant="brand" disabled>
                    Switch to live
                </Button>
                <Button variant="danger" disabled>
                    Delete
                </Button>
            </div>
            <div className="flex flex-col gap-3">
                <Skeleton className="h-16 rounded-2xl" />
                <Skeleton className="h-16 rounded-2xl" />
            </div>
            <div className="w-[22rem] max-w-full">
                <Tabs defaultValue="overview" look="line">
                    <TabsList>
                        {['Overview', 'Sign-in', 'Paying', 'Receipts', 'Keys & webhooks', 'Release schedule'].map((t) => (
                            <TabsTrigger key={t} value={t.toLowerCase()}>
                                {t}
                            </TabsTrigger>
                        ))}
                    </TabsList>
                </Tabs>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Email">
                    <Input placeholder="you@example.com" />
                </Field>
                <Field label="Name" optional hint="How the reply should address you.">
                    <Input />
                </Field>
            </div>
        </div>
    ),
};

/** Status words for a site or feature, and for a check on an artifact. Nothing else. */
export const Statuses: StoryObj = {
    name: 'Status badges',
    render: () => (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-3">
                <p className="text-[0.875rem] text-muted-foreground">A site or a feature</p>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge status="live" />
                    <StatusBadge status="testing" />
                    <StatusBadge status="not-yet" />
                    <StatusBadge status="paused" />
                </div>
            </div>
            <div className="flex flex-col gap-3">
                <p className="text-[0.875rem] text-muted-foreground">A check on a stamp, a ballot, a delegation</p>
                <div className="flex flex-wrap gap-2">
                    <StatusBadge status="good" />
                    <StatusBadge status="caution" />
                    <StatusBadge status="refused" />
                </div>
            </div>
        </div>
    ),
};

export const Paging: StoryObj = {
    name: 'Pagination',
    render: function PagingStory() {
        // From 0: page one is 0.
        const [page, setPage] = useState(1);
        const stamps = Array.from({ length: 54 }, (_, i) => `Stamp ${String(54 - i).padStart(2, '0')}`);
        return (
            <div className="flex max-w-2xl flex-col gap-4">
                <ul className="divide-y divide-border rounded-[1.25rem] border border-border bg-card">
                    {stamps.slice(page * 10, (page + 1) * 10).map((s) => (
                        <li key={s} className="px-5 py-3 text-[0.9375rem]">
                            {s}
                        </li>
                    ))}
                </ul>
                <Pagination label="Stamps, pages" pageIndex={page} pageSize={10} total={stamps.length} onPage={setPage} />
            </div>
        );
    },
};

export const Qr: StoryObj = {
    name: 'QR code',
    render: () => (
        <div className="flex flex-wrap items-end gap-8">
            <div className="flex flex-col items-center gap-3">
                <QrCode value="bitcoin:bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t?amount=0.0005" label="Pay 50,000 sats to vault" />
                <span className="text-[0.875rem] text-muted-foreground">50,000 sats, on-chain</span>
            </div>
            <div className="flex flex-col items-center gap-3">
                <QrCode value="https://stamp.ochk.io/v?id=86020d78db788237fd13be8af76563f53ea0d0b2a81d188baacaa4d1a85eeb1c" size={140} label="Link to this stamp" />
                <span className="text-[0.875rem] text-muted-foreground">This stamp</span>
            </div>
        </div>
    ),
};

export const Asking: StoryObj = {
    name: 'Confirm and prompt',
    render: function AskingStory() {
        const [answer, setAnswer] = useState('Nothing asked yet.');
        return (
            <div className="flex flex-col gap-6">
                <DialogHost />
                <div className="flex flex-wrap gap-3">
                    <Button
                        variant="danger"
                        onClick={async () => {
                            const yes = await confirm({
                                title: 'Revoke this delegation?',
                                message: 'The agent stops being able to act for you at once. A revocation cannot be undone.',
                                confirmLabel: 'Revoke',
                                destructive: true,
                            });
                            setAnswer(yes ? 'Revoked.' : 'Kept.');
                        }}
                    >
                        Revoke delegation
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={async () => {
                            const name = await prompt({
                                title: 'Name this key',
                                label: 'Name',
                                placeholder: 'Build server',
                                hint: 'Only you see it.',
                                minLength: 2,
                                confirmLabel: 'Save',
                            });
                            setAnswer(name === null ? 'Cancelled.' : `Named “${name}”.`);
                        }}
                    >
                        Name a key
                    </Button>
                    <Button
                        variant="secondary"
                        onClick={async () => {
                            const pass = await prompt({
                                title: 'Unlock the vault',
                                label: 'Passphrase',
                                secret: true,
                                validate: (v) => (v.length < 8 ? 'That is shorter than any passphrase vault accepts.' : null),
                                confirmLabel: 'Unlock',
                            });
                            setAnswer(pass === null ? 'Still locked.' : 'Unlocked.');
                        }}
                    >
                        Unlock
                    </Button>
                </div>
                <p className="oca-body" aria-live="polite">
                    {answer}
                </p>
            </div>
        );
    },
};

export const Disclosure: StoryObj = {
    name: 'Accordion',
    render: () => (
        <div className="max-w-2xl">
            <Accordion single>
                <AccordionItem title="What does a stamp prove?" defaultOpen>
                    That a Bitcoin address signed these exact bytes, and that they existed before a given block.
                </AccordionItem>
                <AccordionItem title="Does the file leave my browser?">No. Only its SHA-256 hash is signed and anchored.</AccordionItem>
                <AccordionItem title="Can a stamp be revoked?">No. A stamp is a fact about the past; it stays true.</AccordionItem>
            </Accordion>
        </div>
    ),
};

/** Toasts take the page's mode from next-themes: the Toaster is passed nothing. */
export const Toasts: StoryObj = {
    render: (_, { globals }) => {
        const mode = globals.mode === 'dark' ? 'dark' : 'light';
        return (
            // The site's ThemeProvider, set here from the toolbar's mode.
            <ThemeProvider key={mode} attribute="data-oca-story-theme" defaultTheme={mode} enableSystem={false} storageKey="oca-story-theme">
                <Button onClick={() => toast('Saved', { description: 'The stamp is on Nostr.' })}>Show a toast</Button>
                <Toaster />
            </ThemeProvider>
        );
    },
};
