import { ChevronDown, LogOut, Moon, Settings, Sun, SunMoon } from 'lucide-react';
import Link from 'next/link';
import type { ReactNode } from 'react';

import { SIGN_IN_LABEL } from '../family';
import { useAccountSlot, useAccountTaken } from '../lib/account-slot';
import { cn } from '../lib/cn';
import { useFamilySignInHref, useSignInHref } from '../lib/sign-in';
import { Button } from '../primitives/button';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '../primitives/overlay';
import { useTheme } from './app-shell';
import { CTA_BLOCK, CTA_LINK, CtaLabel, CtaPlus } from './cta';

/*
 * The family's one account control. Signed in, it is a trigger showing who is
 * signed in (their email, else their name, else a short did) with one menu:
 * the site's own items, Account settings on ochk.app, Appearance, Sign out.
 * Signed out, it is the one way in, to the sign-in that also makes the
 * account. While the session is checked, or when the check failed, it is a
 * placeholder of the same size with no words and no link. SiteHeader,
 * ToolShell and AppShell's account slot all draw this control, so no site
 * draws a second one.
 */

/** Where the session stands: being checked, signed in, signed out, or the check failed. */
export type SessionState = 'checking' | 'in' | 'out' | 'unknown';

/** The account page, on ochk.app: inside the menu, as "Account settings". */
export const OCHK_APP_ACCOUNT = 'https://ochk.app/me/account';
export const ACCOUNT_SETTINGS_LABEL = 'Account settings';

/** Said when the auth host did not end the session, as auth-client's own chip says it. */
const SIGN_OUT_REFUSED = 'Couldn’t sign out. You’re still signed in; try again.';

export interface AccountMenuItem {
    label: string;
    href?: string;
    onSelect?: (event: Event) => void;
    icon?: ReactNode;
    destructive?: boolean;
}

/**
 * The signed-in trigger and its menu. The trigger shows the initial and who is
 * signed in, then a chevron. In the header's block it is the bar's full height
 * at the right rule and shows the name at every width: cut with an ellipsis
 * where the bar runs out of room, and at about 32 characters, before anything
 * else in the bar gives way; on a phone without the initial. In AppShell's bars
 * it keeps its box and shows the name at every width the same way. Among a
 * site's own controls it keeps the initial and the chevron below `nameFrom`.
 */
export function AccountMenu({
    name,
    detail,
    items,
    nameFrom = 'sm',
    onOpenChange,
}: {
    /** Who is signed in, as the trigger shows it: an email, a name or a short did. */
    name: string;
    /** A second line under the name in the menu: a short address. */
    detail?: string;
    items: (AccountMenuItem | 'separator')[];
    /** Among a site's own controls, the width from which the name shows beside the initial. A header's block and AppShell's bars always show it. */
    nameFrom?: 'sm' | 'lg';
    /** Called as the menu opens and closes. */
    onOpenChange?: (open: boolean) => void;
}) {
    const { look } = useAccountSlot();
    const block = look === 'block';
    const app = look === 'app';
    const initial = name.trim().charAt(0).toUpperCase() || '·';
    return (
        <DropdownMenu onOpenChange={onOpenChange}>
            <DropdownMenuTrigger
                data-oca-account="in"
                className={cn(
                    'group/account inline-flex items-center text-[0.9375rem] text-foreground outline-none transition-colors',
                    block
                        ? // The bar's full height at the right rule, its own hairline at the left; 44px wide at the least.
                          // It gives way first, by far the most, so the name is cut before the bar's brand or links are;
                          // on a phone it reaches 8px into the gutter, so its chevron ends on the gutter's line and at 320
                          // a letter and the ellipsis still fit whole.
                          'min-w-11 shrink-[1000000] gap-2 self-stretch px-2 hover:bg-accent max-[480px]:-mr-2 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring data-[state=open]:bg-accent min-[480px]:border-l min-[480px]:border-border min-[480px]:px-3 min-[900px]:gap-2.5 min-[900px]:px-5'
                        : cn(
                              'h-11 gap-2 rounded-none border border-border bg-card pl-1.5 pr-2.5 hover:border-oca-hairline-strong focus-visible:ring-2 focus-visible:ring-ring',
                              // In AppShell's bar it gives way first too, down to 44px; on a phone the initial's room is the name's.
                              app ? 'min-w-11 shrink-[1000000] max-md:pl-2.5 md:gap-2.5' : cn('shrink-0', nameFrom === 'lg' ? 'lg:gap-2.5' : 'sm:gap-2.5')
                          )
                )}
                aria-label={`${name}, account menu`}
            >
                {/* The initial is drawn, not written: the button is read by its label. */}
                <span
                    aria-hidden
                    data-initial={initial}
                    className={cn(
                        'flex shrink-0 items-center justify-center bg-foreground font-medium text-background before:content-[attr(data-initial)]',
                        // A dot: round on its own size, as the square rule allows. In the bar, a phone gives its room to the name.
                        block ? 'size-7 rounded-full text-[0.75rem] max-md:hidden' : cn('size-8 rounded-full text-[0.8125rem]', app && 'max-md:hidden')
                    )}
                />
                <span
                    data-oca-account-name=""
                    className={
                        block || app
                            ? // One line cut at any letter, with an ellipsis, so the name can give way to a letter's width;
                              // 17em holds about 32 of an email's characters. Set from the left: centred, as a button
                              // sets its text, the line moved over by its slack and pushed the ellipsis's last dot out.
                              'line-clamp-1 min-w-0 max-w-[17em] break-all text-left'
                            : cn('max-w-[14rem] truncate', nameFrom === 'lg' ? 'max-lg:hidden' : 'max-sm:hidden')
                    }
                >
                    {name}
                </span>
                <ChevronDown aria-hidden className="size-3.5 shrink-0 text-muted-foreground transition-transform duration-200 group-data-[state=open]/account:rotate-180" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64">
                <DropdownMenuLabel className="flex flex-col gap-0.5">
                    <span className="truncate text-[0.9375rem] font-medium text-foreground">{name}</span>
                    {detail ? <span className="truncate font-mono text-[0.75rem]">{detail}</span> : null}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {/* Keyed by place, not label: an item whose label changes as it is pressed (Appearance) keeps its focus. */}
                {items.map((it, i) =>
                    it === 'separator' ? (
                        <DropdownMenuSeparator key={`sep-${i}`} />
                    ) : it.href ? (
                        <DropdownMenuItem key={`item-${i}`} asChild destructive={it.destructive}>
                            <Link href={it.href}>
                                {it.icon}
                                {it.label}
                            </Link>
                        </DropdownMenuItem>
                    ) : (
                        <DropdownMenuItem key={`item-${i}`} onSelect={it.onSelect} destructive={it.destructive}>
                            {it.icon}
                            {it.label}
                        </DropdownMenuItem>
                    )
                )}
            </DropdownMenuContent>
        </DropdownMenu>
    );
}

type Theme = 'light' | 'dark' | 'system';
const THEME_NEXT: Record<Theme, Theme> = { light: 'dark', dark: 'system', system: 'light' };
const THEME_WORD: Record<Theme, string> = { light: 'Light', dark: 'Dark', system: 'System' };

/**
 * The menu's Appearance item, where the theme switch lives now that it has left
 * the bar: the current mode in its label, and a press that moves to the next
 * (light, dark, system) with the menu left open, the cycle ThemeToggle has.
 */
export function useAppearanceItem(): AccountMenuItem {
    const { theme, setTheme } = useTheme();
    const current: Theme = theme === 'light' || theme === 'dark' ? theme : 'system';
    const Icon = current === 'light' ? Sun : current === 'dark' ? Moon : SunMoon;
    return {
        label: `Appearance: ${THEME_WORD[current]}`,
        icon: <Icon />,
        onSelect: (event) => {
            event.preventDefault();
            setTheme(THEME_NEXT[current]);
        },
    };
}

/** The menu a signed-in person gets: this site's items, then Account settings on ochk.app and Appearance, then Sign out. */
export function accountMenuItems({
    items = [],
    accountHref = OCHK_APP_ACCOUNT,
    appearance,
    onSignOut,
}: {
    items?: (AccountMenuItem | 'separator')[];
    /** Where Account settings goes; `false` when the site's own items hold its account page (ochk.app). */
    accountHref?: string | false;
    /** The Appearance item, from useAppearanceItem. */
    appearance?: AccountMenuItem;
    onSignOut?: () => void;
}): (AccountMenuItem | 'separator')[] {
    const own: AccountMenuItem[] = [
        ...(accountHref ? [{ label: ACCOUNT_SETTINGS_LABEL, href: accountHref, icon: <Settings /> }] : []),
        ...(appearance ? [appearance] : []),
    ];
    return [
        ...items,
        ...(items.length > 0 ? (['separator'] as const) : []),
        ...own,
        ...(own.length > 0 ? (['separator'] as const) : []),
        { label: 'Sign out', onSelect: () => onSignOut?.(), icon: <LogOut /> },
    ];
}

export interface SessionAccountViewProps {
    state: SessionState;
    /** Who is signed in, as the trigger shows it: their email, else their name, else a short did (see accountName). */
    name?: string;
    /** A second line in the menu: a short address. */
    detail?: string;
    /** This site's own items, above Account settings: its own action ("Open your vault") goes here. */
    items?: (AccountMenuItem | 'separator')[];
    /** Where the way in goes, as given. */
    signInHref?: string;
    /** This site's sign-in page (`/signin`): signing in returns to the page the viewer is on. */
    signInPath?: string;
    /** The way in's words. Default: SIGN_IN_LABEL. */
    signInLabel?: string;
    /** @deprecated 2.2: the way in has one look per place (the header's block, a link elsewhere); this is ignored. */
    signInVariant?: 'primary' | 'secondary';
    /** Where Account settings goes: ochk.app's account page; `false` when `items` hold the account page (ochk.app). */
    accountHref?: string | false;
    /** The Appearance item in the menu, the bar's theme switch now; `false` leaves it out. */
    appearance?: boolean;
    onSignOut?: () => void;
    /** The last sign-out was refused, so the person is still signed in: said under the trigger. */
    signOutRefused?: boolean;
    /** Called as the account menu opens and closes. */
    onMenuOpenChange?: (open: boolean) => void;
    /** Among a site's own controls only: the width from which the name shows beside the initial. */
    nameFrom?: 'sm' | 'lg';
}

/**
 * The account control, for any session source. SessionAccount (./session)
 * drives it from auth-client; a site with its own session (ochk.io) passes the
 * state. Exactly one control in every state; the header's phone menu gets the
 * way in at its foot, never a second control beside the trigger. Among the
 * actions of a header that has `account`, it draws nothing.
 */
export function SessionAccountView({
    state,
    name,
    detail,
    items = [],
    signInHref,
    signInPath,
    signInLabel = SIGN_IN_LABEL,
    accountHref = OCHK_APP_ACCOUNT,
    appearance = true,
    onSignOut,
    signOutRefused = false,
    onMenuOpenChange,
    nameFrom = 'lg',
}: SessionAccountViewProps) {
    const { look, where } = useAccountSlot();
    const inPlace = useSignInHref(signInPath);
    const family = useFamilySignInHref();
    const href = signInHref ?? inPlace ?? family;
    const appearanceItem = useAppearanceItem();
    const taken = useAccountTaken();
    const block = look === 'block';

    // Among a header's extras when the header draws the account itself: one control, not two.
    if (taken) return null;
    if (where === 'sheet') {
        // The phone menu's foot holds only the way in: signed in, the trigger stays in the bar.
        if (state === 'in' || state === 'unknown') return null;
        const pending = state === 'checking';
        return (
            // From 480px the bar holds the way in, so the menu does not hold a second.
            <Button asChild size="lg" className="w-full justify-between min-[480px]:hidden">
                {pending ? (
                    <span data-oca-account="pending" aria-hidden>
                        <CtaLabel label={signInLabel} hidden />
                        <span className="invisible">
                            <CtaPlus />
                        </span>
                    </span>
                ) : (
                    <a data-oca-account="out" href={href}>
                        <CtaLabel label={signInLabel} />
                        <CtaPlus />
                    </a>
                )}
            </Button>
        );
    }

    if (state === 'in') {
        const menu = (
            <AccountMenu
                // Never a generic word: a session with no name at all still has its did (accountName).
                name={name || '·'}
                detail={detail}
                nameFrom={nameFrom}
                onOpenChange={onMenuOpenChange}
                items={accountMenuItems({ items, accountHref, appearance: appearance ? appearanceItem : undefined, onSignOut })}
            />
        );
        if (!signOutRefused) return menu;
        // Under the trigger, out of the header's flow, so nothing beside it moves.
        return (
            <span className={cn('relative inline-flex', block && 'self-stretch')}>
                {menu}
                <span
                    role="alert"
                    className="absolute right-0 top-full z-50 mt-1.5 w-max max-w-[16rem] rounded-none border border-border bg-card px-2.5 py-1.5 text-[0.8125rem] leading-snug text-destructive shadow-sm"
                >
                    {SIGN_OUT_REFUSED}
                </span>
            </span>
        );
    }

    if (block) {
        if (state === 'out') {
            return (
                <a
                    data-oca-account="out"
                    href={href}
                    // Below 480px the bar keeps the brand and the menu: the way in is the menu's full-width button.
                    className={cn(CTA_BLOCK, CTA_LINK, 'max-[480px]:hidden')}
                >
                    <CtaLabel label={signInLabel} />
                    <CtaPlus />
                </a>
            );
        }
        // Checking, or the check failed: the block's size, no words, no link, nothing to focus or read.
        // While checking it keeps its ground, as the way in most visitors get; a failed check leaves it bare.
        return (
            <span
                data-oca-account={state === 'checking' ? 'pending' : 'unknown'}
                aria-hidden
                className={cn(CTA_BLOCK, 'max-[480px]:hidden', state === 'unknown' && 'bg-transparent')}
            >
                <CtaLabel label={signInLabel} hidden />
                <span className="invisible">
                    <CtaPlus />
                </span>
            </span>
        );
    }

    // Inline: a 44px link among other controls, the same words as the block.
    const pending = state !== 'out';
    return (
        <a
            data-oca-account={state === 'out' ? 'out' : state === 'checking' ? 'pending' : 'unknown'}
            href={pending ? undefined : href}
            aria-hidden={pending || undefined}
            className={cn(
                // One line: in a crowded bar the words never wrap under a box that stays their width.
                'inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-none px-3 text-[0.9375rem] text-foreground transition-colors hover:text-oca-accent-ink',
                pending && 'invisible'
            )}
        >
            {signInLabel}
        </a>
    );
}
