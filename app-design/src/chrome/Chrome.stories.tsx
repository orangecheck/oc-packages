import type { Meta, StoryObj } from '@storybook/react';
import { Activity, BadgeCheck, Boxes, Home, Link2, LogOut, Settings, ShieldCheck, Wallet } from 'lucide-react';

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
