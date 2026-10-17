import type { Meta, StoryObj } from '@storybook/react';
import {
    Activity,
    BadgeCheck,
    Boxes,
    Home,
    House,
    LayoutGrid,
    Link2,
    LogOut,
    Settings,
    ShieldCheck,
    UserRound,
    Wallet,
} from 'lucide-react';

import { Badge, Button } from '../primitives';
import { Notice, PageHeader, Sats, StatCard, StatGrid } from '../components';
import { AccountMenu, AppShell, SiteFooter, SiteHeader, ThemeToggle } from './index';

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
                fineprint="Sign in, earn and own your identity, backed by Bitcoin. In testing."
                columns={[
                    { heading: 'Product', links: [{ href: '/how', label: 'How it works' }, { href: '/apps', label: 'For apps' }] },
                    { heading: 'Trust', links: [{ href: '/today', label: "What's true today" }, { href: '/custody', label: 'Who holds what' }] },
                    { heading: 'Open', links: [{ href: 'https://docs.ochk.io', label: 'Docs', external: true }, { href: 'https://github.com/orangecheck', label: 'GitHub', external: true }] },
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
            nav={[
                {
                    items: [
                        { href: '/home', label: 'Home', icon: <Home />, active: true },
                        { href: '/wallet', label: 'Wallet', icon: <Wallet /> },
                        { href: '/activity', label: 'Activity', icon: <Activity />, badge: <Badge tone="brand">3</Badge> },
                        { href: '/identity', label: 'Identity', icon: <BadgeCheck /> },
                        { href: '/connections', label: 'Connections', icon: <Link2 /> },
                    ],
                },
                { label: 'Build', items: [{ href: '/projects', label: 'Projects', icon: <Boxes /> }] },
                { label: 'Run', items: [{ href: '/admin', label: 'Admin', icon: <ShieldCheck /> }] },
            ]}
            footer={<ThemeToggle />}
            account={
                <AccountMenu
                    name="wil"
                    detail="did:oc:ed30…7fc8"
                    items={[
                        { label: 'Settings', href: '/settings', icon: <Settings /> },
                        'separator',
                        { label: 'Sign out', onSelect: () => {}, icon: <LogOut />, destructive: true },
                    ]}
                />
            }
            banner={<Notice tone="brand" title="In testing">Earning runs on test networks until February.</Notice>}
        >
            <div className="flex flex-col gap-8">
                <PageHeader eyebrow="Home" title="Good to see you." description="Three sites have paid you this week." />
                <StatGrid>
                    <StatCard label="Balance" value={<Sats value={12840} />} />
                    <StatCard label="This week" value={<Sats value={420} />} />
                    <StatCard label="Sites" value="3" />
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
            account={<AccountMenu name="ana@example.com" detail="did:oc:ed30…7fc8" items={[{ label: 'Settings', href: '/settings' }]} />}
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
                                { href: '/me', label: 'Home', icon: <Home /> },
                                { href: '/me/wallet', label: 'Wallet', icon: <Wallet />, active: true },
                                { href: '/me/activity', label: 'Activity', icon: <Activity /> },
                                { href: '/me/identity', label: 'Identity', icon: <BadgeCheck /> },
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
                        { href: '/me/connections', label: 'Connections', icon: <Link2 /> },
                        { href: '/me/settings', label: 'Settings', icon: <Settings /> },
                    ],
                },
            ]}
            footer={<ThemeToggle />}
            account={<AccountMenu name="wil" detail="did:oc:ed30…7fc8" items={[{ label: 'Settings', href: '/settings' }]} />}
        >
            <div className="flex flex-col gap-8">
                <PageHeader title="Wallet" description="What you have earned, and who holds it until it pays out." />
                <StatGrid>
                    <StatCard label="Balance" value={<Sats value={12840} />} raw={12840} />
                    <StatCard label="This week" value={<Sats value={420} />} raw={420} />
                    <StatCard label="Paid out" value={<Sats value={null} />} raw={null} />
                </StatGrid>
            </div>
        </AppShell>
    ),
};
