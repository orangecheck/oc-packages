import type { Meta, StoryObj } from '@storybook/react';
import {
    Activity,
    Boxes,
    CircleUser,
    FileUp,
    House,
    KeyRound,
    LayoutGrid,
    LogOut,
    Search,
    ShieldCheck,
    UserRound,
    Wallet,
} from 'lucide-react';

import { OCHK_IO_NAV, SELF_HOSTED_LEGAL_LINKS } from '../family';
import { Badge, Button, Card, Field, Input, Kbd, Separator } from '../primitives';
import { Accent, ErrorPage, Notice, PageHeader, PageHero, Sats, StatCard, StatGrid, TextLink } from '../components';
import {
    AccountMenu,
    AppShell,
    OchkIoFooter,
    SignInFrame,
    SiteBanner,
    SiteFooter,
    SiteHeader,
    SkipLink,
    ThemeToggle,
} from './index';

const meta: Meta = { title: 'Chrome', parameters: { fullBleed: true } };
export default meta;

export const PublicFrame: StoryObj = {
    name: 'Public header and footer',
    render: () => (
        <div className="min-h-screen">
            <SiteHeader
                nav={[
                    { href: '/how', label: 'How it works' },
                    { href: '/apps', label: 'For apps', active: true },
                    { href: '/today', label: "What's true today" },
                ]}
                actions={
                    <>
                        <ThemeToggle />
                        <Button variant="ghost" className="hidden sm:inline-flex">
                            Sign in
                        </Button>
                        <Button>Get started</Button>
                    </>
                }
            />
            <div className="oca-container py-32 text-center oca-body">Page content</div>
            <SiteFooter
                fineprint="Sign in. Back it. Get paid. Own it."
                columns={[
                    { heading: 'Product', links: [{ href: '/how', label: 'How it works' }, { href: '/apps', label: 'For apps' }] },
                    { heading: 'Trust', links: [{ href: '/today', label: "What's true today" }, { href: '/custody', label: 'Who holds what' }] },
                    { heading: 'Open', links: [{ href: 'https://ochk.io/docs', label: 'Docs', external: true }, { href: 'https://github.com/orangecheck', label: 'GitHub', external: true }] },
                ]}
                meta="The open layer is supported by an OpenSats grant · ochk.io · github.com/orangecheck"
            />
        </div>
    ),
};

export const SignedIn: StoryObj = {
    name: 'Signed-in shell',
    render: () => (
        <AppShell
            family="me"
            nav={[
                {
                    items: [
                        { href: '/me', label: 'Home', icon: <House />, active: true },
                        { href: '/me/activity', label: 'Activity', icon: <Activity />, badge: <Badge tone="brand">3</Badge> },
                        { href: '/me/balance', label: 'Balance', icon: <Wallet /> },
                        { href: '/me/apps', label: 'Apps', icon: <LayoutGrid /> },
                        { href: '/me/account', label: 'Account', icon: <CircleUser /> },
                    ],
                },
                { label: 'Build', items: [{ href: '/projects', label: 'Projects', icon: <Boxes /> }] },
                { label: 'Run', items: [{ href: '/admin', label: 'Admin', icon: <ShieldCheck /> }] },
            ]}
            footer={<ThemeToggle />}
            account={
                <AccountMenu
                    name="you@example.com"
                    detail="Signed in with email"
                    items={[
                        { label: 'Account', href: '/me/account', icon: <CircleUser /> },
                        'separator',
                        { label: 'Sign out', onSelect: () => {}, icon: <LogOut />, destructive: true },
                    ]}
                />
            }
            banner={<Notice tone="brand" title="In testing">Earning runs on test networks until February.</Notice>}
        >
            <div className="flex flex-col gap-8">
                <PageHeader eyebrow="Home" title="Good to see you." description="Three apps paid you this week." />
                <StatGrid>
                    <StatCard label="Balance" value={<Sats value={12840} />} />
                    <StatCard label="This week" value={<Sats value={420} />} />
                    <StatCard label="Apps" value="3" />
                    <StatCard label="Paid out" value={<Sats value={null} />} />
                </StatGrid>
            </div>
        </AppShell>
    ),
};

/** Five pages: on a phone they sit in a tab bar, with no menu button. Widen past 768px for the drawer. */
export const Phone: StoryObj = {
    name: 'Signed-in shell, on a phone',
    globals: { viewport: { value: 'mobile2', isRotated: false } },
    render: () => (
        <AppShell
            nav={[
                {
                    items: [
                        { href: '/me', label: 'Home', icon: <House /> },
                        { href: '/me/activity', label: 'Activity', icon: <Activity />, active: true },
                        { href: '/me/balance', label: 'Balance', icon: <Wallet /> },
                        { href: '/me/apps', label: 'Apps', icon: <LayoutGrid />, badge: <Badge tone="brand">2</Badge> },
                        { href: '/me/account', label: 'Account', icon: <UserRound /> },
                    ],
                },
            ]}
            account={<AccountMenu name="you@example.com" detail="Signed in with email" items={[{ label: 'Account', href: '/me/account' }]} />}
        >
            <div className="flex flex-col gap-8">
                <PageHeader title="Activity" description="Every paid event, with a receipt you can check against Bitcoin." />
                <StatGrid>
                    <StatCard label="Earned" value={<Sats value={217} />} raw={217} />
                    <StatCard label="This week" value={<Sats value={42} />} raw={42} />
                </StatGrid>
                {Array.from({ length: 12 }, (_, i) => (
                    <p key={i} className="oca-body">
                        Row {i + 1}. The last one clears the tab bar when you scroll to the end.
                    </p>
                ))}
            </div>
        </AppShell>
    ),
};

export const Sections: StoryObj = {
    name: 'Signed-in shell, with sections',
    render: () => (
        <AppShell
            sections={[
                {
                    id: 'you',
                    label: 'You',
                    title: 'Your account',
                    href: '/me',
                    groups: [
                        {
                            items: [
                                { href: '/me', label: 'Home', icon: <House /> },
                                { href: '/me/activity', label: 'Activity', icon: <Activity /> },
                                { href: '/me/balance', label: 'Balance', icon: <Wallet />, active: true },
                                { href: '/me/apps', label: 'Apps', icon: <LayoutGrid /> },
                            ],
                        },
                    ],
                },
                {
                    id: 'build',
                    label: 'Build',
                    href: '/me/developer',
                    groups: [{ items: [{ href: '/me/projects', label: 'Projects', icon: <Boxes /> }] }],
                },
                {
                    id: 'operate',
                    label: 'Operate',
                    href: '/me/operator',
                    groups: [{ items: [{ href: '/me/operator', label: 'Federations', icon: <ShieldCheck /> }] }],
                },
                {
                    id: 'admin',
                    label: 'Admin',
                    href: '/me/admin',
                    groups: [{ items: [{ href: '/me/admin', label: 'Queue', icon: <ShieldCheck /> }] }],
                },
            ]}
            persistent={[
                {
                    label: 'Account',
                    items: [
                        { href: '/me/account', label: 'Account', icon: <CircleUser /> },
                        { href: '/me/account#sign-in', label: 'Ways to sign in', icon: <KeyRound /> },
                    ],
                },
            ]}
            footer={<ThemeToggle />}
            account={<AccountMenu name="you@example.com" detail="Signed in with email" items={[{ label: 'Account', href: '/me/account' }]} />}
        >
            <div className="flex flex-col gap-8">
                <PageHeader title="Balance" description="What you have earned, and who holds it until it pays out." />
                <StatGrid>
                    <StatCard label="Balance" value={<Sats value={12840} />} raw={12840} />
                    <StatCard label="This week" value={<Sats value={420} />} raw={420} />
                    <StatCard label="Paid out" value={<Sats value={null} />} raw={null} />
                </StatGrid>
            </div>
        </AppShell>
    ),
};

/* ── The family's chrome ─────────────────────────────────────────────── */

function SearchButton() {
    return (
        <>
            <button
                type="button"
                className="hidden h-10 items-center gap-2 rounded-full border border-border bg-card pl-3.5 pr-2 text-[0.9375rem] text-muted-foreground transition-colors hover:border-oca-hairline-strong hover:text-foreground lg:inline-flex"
            >
                <Search aria-hidden className="size-4" />
                Search
                <Kbd className="ml-4">⌘K</Kbd>
            </button>
            <Button variant="ghost" size="icon" aria-label="Search" className="lg:hidden">
                <Search />
            </Button>
        </>
    );
}

/** ochk.io's frame: the family menu, Protocols with its six, search, and the family footer. */
export const OchkIo: StoryObj = {
    name: 'ochk.io header and footer',
    render: () => (
        <div className="min-h-screen">
            <SkipLink />
            <SiteHeader
                family="home"
                nav={OCHK_IO_NAV.map((n) =>
                    n.label === 'Protocols'
                        ? { ...n, active: true, children: n.children?.map((c) => ({ ...c, active: c.label === 'stamp' })) }
                        : n
                )}
                search={<SearchButton />}
                actions={
                    <Button asChild size="sm">
                        <a href="https://ochk.app/signin">Sign in</a>
                    </Button>
                }
            />
            <main id="main-content">
                <PageHero
                    eyebrow="Protocol · provenance"
                    title={
                        <>
                            Prove who signed it, and <Accent>when</Accent>.
                        </>
                    }
                    lead="OC Stamp signs any file's hash with a Bitcoin address and anchors it to a block. Anyone can check it, offline."
                    actions={
                        <>
                            <Button>Make a stamp</Button>
                            <Button variant="secondary">Read the spec</Button>
                        </>
                    }
                />
            </main>
            {/* One export: the fine print, the OpenSats line and the theme switch with it. */}
            <OchkIoFooter />
        </div>
    ),
};

/** A tool: 56px, full width, the site's word beside the lockup, and the one-row footer. */
export const Tool: StoryObj = {
    name: 'Tool header and compact footer',
    render: () => (
        <div className="flex min-h-screen flex-col">
            <SiteBanner tone="brand" action={<TextLink href="https://ochk.io/status">Status</TextLink>}>
                Anchoring is slower than usual: two OpenTimestamps calendars are not answering.
            </SiteBanner>
            <SiteHeader
                variant="tool"
                product="stamp"
                family="stamp"
                home="/dashboard"
                nav={[
                    { href: '/create', label: 'Create', active: true },
                    { href: '/verify', label: 'Verify' },
                    { href: '/playground', label: 'Playground' },
                    { href: '/dashboard', label: 'Dashboard' },
                ]}
                actions={
                    <>
                        <ThemeToggle className="max-sm:hidden" />
                        <Button size="sm" variant="secondary">
                            Sign in
                        </Button>
                    </>
                }
            />
            <main id="main-content" className="flex-1">
                <div className="mx-auto flex w-full max-w-[72rem] flex-col gap-8 px-4 py-10 md:px-6 md:py-14">
                    <PageHeader
                        eyebrow="Create"
                        title="Stamp a file"
                        description="Its hash is signed with your Bitcoin address and anchored to a block. The file never leaves your browser."
                    />
                    <Card className="flex flex-col items-center gap-3 border-dashed py-14 text-center">
                        <span className="flex size-11 items-center justify-center rounded-full bg-muted text-muted-foreground">
                            <FileUp className="size-5" />
                        </span>
                        <p className="oca-title-sm">Drop a file, or choose one</p>
                        <p className="oca-body text-[0.9375rem]">Only its SHA-256 is signed. Nothing is uploaded.</p>
                    </Card>
                </div>
            </main>
            <SiteFooter compact family legal />
        </div>
    ),
};

/** A product that holds money hosts its own terms: the family footer with its own legal row. */
export const ProductFooter: StoryObj = {
    name: 'Product footer with its own legal row',
    render: () => (
        <div className="flex min-h-screen flex-col">
            <SiteHeader
                family="me"
                nav={[
                    { href: '/how', label: 'How it works' },
                    { href: '/earn', label: 'Earn' },
                    { href: '/apps', label: 'For apps' },
                    { href: '/trust', label: 'Trust' },
                ]}
                actions={<Button size="sm">Get started</Button>}
            />
            <main id="main-content" className="oca-container flex-1 py-32 text-center oca-body">
                Page content
            </main>
            <SiteFooter
                columns={[
                    { heading: 'ochk.app', links: [{ href: '/how', label: 'How it works' }, { href: '/earn', label: 'Earn' }, { href: '/apps', label: 'For apps' }] },
                    { heading: 'Trust', links: [{ href: '/trust', label: 'Trust' }, { href: '/custody', label: 'Custody' }, { href: '/status', label: 'Status' }] },
                ]}
                family
                legal={SELF_HOSTED_LEGAL_LINKS}
                fineprint="Sign in. Back it. Get paid. Own it."
            />
        </div>
    ),
};

export const Banners: StoryObj = {
    name: 'Banners and skip link',
    render: () => (
        <div className="flex min-h-screen flex-col gap-10 pb-16">
            <SkipLink href="#banners" />
            <div className="flex flex-col">
                <SiteBanner action={<TextLink href="https://ochk.io/changelog">What changed</TextLink>}>
                    The docs now live at ochk.io/docs. Old links still work.
                </SiteBanner>
                <SiteBanner tone="brand" action={<TextLink href="https://ochk.io/status">Status</TextLink>}>
                    Not fully working: Bitcoin anchoring. Stamps still sign; anchors will follow.
                </SiteBanner>
                <SiteBanner tone="danger" action={<TextLink href="https://ochk.io/status">Status</TextLink>}>
                    Down right now: sign-in. Some pages may not load.
                </SiteBanner>
            </div>
            <div id="banners" className="oca-container flex max-w-3xl flex-col gap-3">
                <p className="oca-title-sm">One strip above the header</p>
                <p className="oca-body">
                    Three tones, as a notice has. The rule that shows a banner stays in each site; the package owns
                    how it looks. Press Tab to see the skip link.
                </p>
            </div>
        </div>
    ),
};

function MockCeremony() {
    return (
        <div className="flex flex-col gap-4">
            <Button variant="secondary" className="w-full">
                Continue with Google
            </Button>
            <Button variant="secondary" className="w-full">
                Continue with GitHub
            </Button>
            <div className="flex items-center gap-3 text-[0.8125rem] text-muted-foreground">
                <Separator className="flex-1" />
                or
                <Separator className="flex-1" />
            </div>
            <Field label="Email">
                <Input type="email" placeholder="you@example.com" />
            </Field>
            <Button className="w-full">Send a code</Button>
        </div>
    );
}

export const SignIn: StoryObj = {
    name: 'Sign-in frame',
    render: () => (
        <SignInFrame
            lead="New here? Signing in creates your account."
            fineprint="Your code goes straight to orangecheck's sign-in server, ochk.io."
            caption={
                <>
                    <p className="oca-display-3">
                        One account, with <Accent>Bitcoin</Accent> behind it.
                    </p>
                    <p className="text-[0.9375rem] text-oca-ink-muted">Sign in. Back it. Get paid. Own it.</p>
                </>
            }
        >
            <MockCeremony />
        </SignInFrame>
    ),
};

export const NotFound: StoryObj = {
    name: 'Error page, 404',
    render: () => (
        <div className="flex min-h-screen flex-col">
            <SiteHeader family="home" nav={OCHK_IO_NAV} />
            <main id="main-content" className="flex-1">
                <ErrorPage
                    code={404}
                    actions={
                        <>
                            <Button>Go home</Button>
                            <Button variant="secondary">See the protocols</Button>
                        </>
                    }
                />
            </main>
            <SiteFooter compact legal />
        </div>
    ),
};

export const ServerError: StoryObj = {
    name: 'Error page, 500',
    render: () => (
        <div className="flex min-h-screen flex-col">
            <SiteHeader variant="tool" product="stamp" family="stamp" />
            <main id="main-content" className="flex-1">
                <ErrorPage code={500} />
            </main>
            <SiteFooter compact family legal />
        </div>
    ),
};
