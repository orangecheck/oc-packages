import type { Meta, StoryObj } from '@storybook/react';
import {
    OcAccountMenuView,
    OcLogoDropdown,
    OcPrimaryNav,
    type OcAccountMenuSession,
} from '@orangecheck/ui';
import { ThemeProvider } from 'next-themes';

import { OcAppearanceMenu } from '../tokens/appearance-menu';
import { OcThemeProvider } from '../tokens/provider';

const meta = {
    title: 'Patterns/App Chrome',
    parameters: { layout: 'fullscreen' },
    decorators: [
        (Story) => (
            <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false}>
                <OcThemeProvider>
                    <Story />
                </OcThemeProvider>
            </ThemeProvider>
        ),
    ],
} satisfies Meta;

export default meta;
type Story = StoryObj;

const anon: OcAccountMenuSession = {
    status: 'anonymous',
    account: null,
    signOut: async () => undefined,
    refresh: async () => undefined,
    setDisplayIdentity: async () => undefined,
};

/**
 * The canonical header composition every family site builds. The per-site
 * LayoutHeader varies in nav links, but the structure is fixed:
 * OcLogoDropdown · OcPrimaryNav · OcAccountMenu + ThemeToggle + OcThemePicker.
 */
function HeaderBar() {
    return (
        <header className="bg-background/90 supports-[backdrop-filter]:bg-background/70 sticky top-0 z-50 w-full border-b backdrop-blur">
            <div className="container flex h-12 items-center justify-between gap-4">
                <OcLogoDropdown current="stamp" homeHref="/" siteState="live">
                    <span className="bg-primary text-primary-foreground inline-flex size-6 items-center justify-center rounded font-mono text-xs font-bold">
                        §
                    </span>
                    <span className="font-display text-base font-bold tracking-tight">
                        oc&middot;<span className="text-primary">stamp</span>
                    </span>
                </OcLogoDropdown>
                <div className="flex min-w-0 flex-1 justify-center px-2">
                    <OcPrimaryNav
                        activePath="/dashboard"
                        links={[
                            { href: '/dashboard', label: 'dashboard' },
                            { href: '/create', label: 'create' },
                            { href: '/verify', label: 'verify' },
                            { href: '#', label: 'docs', external: true },
                        ]}
                    />
                </div>
                <div className="flex items-center gap-1">
                    <OcAccountMenuView current="stamp" session={anon} />
                    <OcAppearanceMenu />
                </div>
            </div>
        </header>
    );
}

/** The status sub-header strip (identical across every site). */
function SubHeaderBar() {
    return (
        <div className="border-b">
            <div className="container flex flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2 font-mono text-[11px]">
                <div className="flex items-center gap-3">
                    <span className="bg-primary inline-block h-1.5 w-1.5 animate-pulse rounded-full" />
                    <span className="text-muted-foreground tracking-widest uppercase">live · mainnet</span>
                    <span className="text-foreground">oc · stamp</span>
                </div>
                <div className="text-muted-foreground flex flex-wrap items-center gap-x-4 tracking-widest uppercase">
                    <span>bip-322 · opentimestamps</span>
                    <span className="hidden sm:inline">· verifies offline forever</span>
                </div>
            </div>
        </div>
    );
}

function FooterBar() {
    return (
        <footer className="border-t">
            <div className="container flex flex-col items-start justify-between gap-3 py-8 font-mono text-[11px] sm:flex-row sm:items-center">
                <span className="text-muted-foreground">© orangecheck · mit + cc-by-4.0</span>
                <span className="inline-flex items-center gap-1.5">
                    <span className="text-primary">₿</span>
                    <span className="text-muted-foreground">built with bitcoin</span>
                </span>
            </div>
        </footer>
    );
}

export const Header: Story = { render: () => <HeaderBar /> };
export const SubHeader: Story = { render: () => <SubHeaderBar /> };

export const FullChrome: Story = {
    render: () => (
        <div className="flex min-h-screen flex-col">
            <HeaderBar />
            <SubHeaderBar />
            <main className="container flex-1 py-16">
                <p className="label-mono text-primary mb-2">§ content</p>
                <h1 className="font-display text-2xl">page body renders here</h1>
            </main>
            <FooterBar />
        </div>
    ),
};
