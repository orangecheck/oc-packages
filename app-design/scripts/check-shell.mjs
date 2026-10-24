#!/usr/bin/env node
/*
 * AppShell on a phone. Pages with an icon each get a tab bar under the thumb
 * (four and More past five), sections with icons become the tabs, the rail
 * frame keeps one too; everything else keeps the drawer.
 * Renders the built shell to markup, so run it after `yarn build`.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

process.env.NODE_ENV = 'production';
const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, '../dist/chrome.js');
if (!existsSync(dist)) {
    console.error('✗ shell: dist/chrome.js is missing; run yarn build first');
    process.exit(1);
}
const require = createRequire(import.meta.url);
const { createElement: h } = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { Activity, House, LayoutGrid, Settings, UserRound, Wallet } = require('lucide-react');
const { AppShell } = require(dist);

let failures = 0;
const check = (ok, msg) => {
    if (!ok) {
        console.error(`✗ shell: ${msg}`);
        failures++;
    }
};

const PAGES = [
    ['/me', 'Home', House],
    ['/me/activity', 'Activity', Activity],
    ['/me/balance', 'Balance', Wallet],
    ['/me/apps', 'Apps', LayoutGrid],
    ['/me/account', 'Account', UserRound],
    ['/me/settings', 'Settings', Settings],
];
const items = (n, active = 1, icons = true) =>
    PAGES.slice(0, n).map(([href, label, Icon], i) => ({
        href,
        label,
        icon: icons ? h(Icon) : undefined,
        active: i === active,
    }));
const render = (props) => renderToStaticMarkup(h(AppShell, props, h('p', null, 'page')));

const tabBar = (html) => html.match(/<nav[^>]*data-oca-tabbar[^>]*>[\s\S]*?<\/nav>/)?.[0] ?? null;
const opening = (html, re) => html.match(re)?.[0] ?? '';
const menuButton = (html) => opening(html, /<button[^>]*aria-label="Open navigation"[^>]*>/);
const placeStrip = (html) => opening(html, /<div[^>]*class="[^"]*\bh-9\b[^"]*"[^>]*>/);
const root = (html) => opening(html, /^<div[^>]*>/);

// Five pages: the person's area in ochk.app.
{
    const html = render({ nav: [{ items: items(5, 1) }] });
    const bar = tabBar(html);
    check(bar, 'five pages with icons get a tab bar');
    if (bar) {
        const links = [...bar.matchAll(/<a\b[^>]*>/g)].map((m) => m[0]);
        check(links.length === 5, `the tab bar holds every page (got ${links.length})`);
        const current = links.filter((a) => a.includes('aria-current="page"'));
        check(current.length === 1 && current[0].includes('href="/me/activity"'), 'only the active page is aria-current');
        const labels = [...bar.matchAll(/<span class="max-w-full truncate[^"]*">([^<]+)<\/span>/g)].map((m) => m[1]);
        check(labels.join() === 'Home,Activity,Balance,Apps,Account', `each tab shows its label (got ${labels.join()})`);
        check((bar.match(/<svg\b/g) ?? []).length === 5, 'each tab shows its icon');
        check(/class="[^"]*\bmd:hidden\b/.test(bar), 'the tab bar is for phones only');
        check(bar.includes('pb-[env(safe-area-inset-bottom)]'), 'the tab bar clears the home indicator');
        check(links.every((a) => a.includes('focus-visible:ring-2')), 'every tab shows keyboard focus');
        check(/grid h-14\b/.test(bar), 'tabs are 56px tall, past the 44px target');
    }
    check(root(html).includes('max-md:pb-[calc(3.5rem_+_env(safe-area-inset-bottom))]'), 'the page leaves room under its content for the tab bar');
    check(menuButton(html).includes('max-md:hidden'), 'with every page in the tab bar, phones drop the menu button');
    check(placeStrip(html) && !placeStrip(html).includes('max-md:hidden'), 'phones keep the place strip, so sections that arrive later move nothing');
    check(html.indexOf('data-oca-tabbar') > html.indexOf('id="main-content"'), 'the tab bar comes after the content in reading order');
}

// A footer still needs the sheet, without the pages the tab bar already holds.
{
    const html = render({ nav: [{ items: items(5) }], footer: h('span', null, 'theme') });
    check(tabBar(html), 'a footer does not cost the tab bar');
    check(!menuButton(html).includes('max-md:hidden'), 'with a footer, the menu button stays to reach it');
}

// A page named by the frame, not by a tab, keeps its strip.
{
    const html = render({ nav: [{ items: items(5) }], page: 'Payouts' });
    check(!placeStrip(html).includes('max-md:hidden'), 'a page with no tab of its own keeps the place strip');
}

// Persistent groups count toward the five.
check(tabBar(render({ nav: [{ items: items(4) }], persistent: [{ items: [{ href: '/x', label: 'X', icon: h(Settings) }] }] })), 'four pages and one persistent make five tabs');

// Unread: a dot on the icon, and the count read out with the label.
{
    const nav = [{ items: items(3).map((it, i) => (i === 2 ? { ...it, badge: '3' } : it)) }];
    const bar = tabBar(render({ nav })) ?? '';
    check(/size-2 rounded-full bg-oca-orange/.test(bar), 'a badge shows as a dot on its tab');
    check(bar.includes('<span class="sr-only">3</span>'), "a badge's count is read with its tab");
}

// Six or more: four tabs and More, a sheet with the rest; the active page in More lights More.
{
    const html = render({ nav: [{ items: items(6, 5) }] });
    const bar = tabBar(html) ?? '';
    check(bar, 'six pages with icons get a tab bar');
    check((bar.match(/<a\b/g) ?? []).length === 4, 'six pages: four tabs before More');
    check(/<button[^>]*>[\s\S]*?More<\/span>/.test(bar), 'six pages: a More tab holds the rest');
    check(!bar.includes('href="/me/settings"'), 'six pages: the sixth waits in More, not on the bar');
}

// Sections with an icon each: the sections are the tabs; their pages stay in the menu.
{
    const sections = [
        { id: 'you', label: 'You', href: '/me', icon: h(House), groups: [{ items: items(3) }] },
        { id: 'build', label: 'Build', href: '/build', icon: h(LayoutGrid), groups: [{ items: items(2, 0) }] },
    ];
    const html = render({ sections });
    const bar = tabBar(html) ?? '';
    check(bar.includes('href="/me"') && bar.includes('href="/build"') && !bar.includes('href="/me/activity"'), 'sections with icons: the tabs are the sections');
    check(/aria-current="page"[^>]*>[\s\S]*?You</.test(bar) || /href="\/me"[^>]*aria-current="page"/.test(bar), 'sections with icons: the current section is the active tab');
    check(!menuButton(html).includes('max-md:hidden'), 'sections with icons: the menu button stays for the pages');
}

// The rail: the whole window, a 56px icon rail, content full-bleed, counts and dots.
{
    const nav = [{ items: [
        { href: '/app', label: 'Messages', icon: h(House), active: true, badge: 3 },
        { href: '/app/channels', label: 'Channels', icon: h(LayoutGrid), badge: 'Requests waiting' },
        { href: '/app/contacts', label: 'Contacts', icon: h(UserRound) },
    ] }];
    const html = render({ variant: 'rail', nav, persistent: [{ items: [{ href: '/app/settings', label: 'Settings', icon: h(Settings) }] }], header: h('header', null, 'chat') });
    // It contains what is positioned inside it, and clips without becoming a scroller (check-layout measures it).
    check(root(html).includes('h-dvh') && root(html).includes('relative') && root(html).includes('overflow-clip'), 'rail: the frame is not the window, or does not contain what is inside it');
    check(html.indexOf('<header>chat</header>') >= 0 && html.indexOf('<header>chat</header>') < html.indexOf('id="main-content"'), 'rail: the header sits above');
    const rail = html.match(/<nav aria-label="Pages" class="[^"]*w-14[^"]*md:flex[^"]*">[\s\S]*?<\/nav>/)?.[0] ?? '';
    check(rail.includes('<span class="sr-only">Messages, 3</span>') && rail.includes('>3</span>'), 'rail: a number shows as a count, read with the name');
    check(rail.includes('<span class="sr-only">Channels, Requests waiting</span>') && /size-2 rounded-full bg-oca-orange-deep/.test(rail), 'rail: anything else shows as a dot, read with the name');
    check(rail.includes('href="/app/settings"'), 'rail: persistent pages sit at its foot');
    check(!html.includes('max-w-[72rem]'), 'rail: the content is not capped');
    check(tabBar(html), 'rail: a phone gets the tab bar');
}

// Everything else keeps today's drawer.
const drawer = [
    ['one page', { nav: [{ items: items(1, 0) }] }],
    ['a page without an icon', { nav: [{ items: items(4, 1, false) }] }],
    [
        'sections',
        {
            sections: [
                { id: 'you', label: 'You', href: '/me', groups: [{ items: items(3) }] },
                { id: 'build', label: 'Build', href: '/build', groups: [{ items: items(2, 0) }] },
            ],
        },
    ],
    ['a single section', { sections: [{ id: 'you', label: 'You', href: '/me', groups: [{ items: items(5) }] }] }],
];
for (const [name, props] of drawer) {
    const html = render(props);
    check(!tabBar(html), `${name} keep the drawer, with no tab bar`);
    check(!menuButton(html).includes('max-md:hidden'), `${name} keep the menu button on phones`);
    check(!root(html).includes('max-md:pb-'), `${name} add no room for a tab bar`);
}

// Landmarks and names: the lockup link is named by what it shows, the phone bar is a header, and
// no landmark shares the sidebar's "Pages" by default.
{
    const html = render({ nav: [{ items: PAGES.map(([href, label, Icon]) => ({ href, label, icon: h(Icon) })) }] });
    const homes = html.match(/<a[^>]*href="\/"[^>]*>[\s\S]*?<\/a>/g) ?? [];
    check(homes.length === 2, `the shell has two lockup links, phone and desk (got ${homes.length})`);
    check(homes.every((a) => !/aria-label=/.test(a) && /<span class="sr-only"> home<\/span><\/a>$/.test(a)), 'each lockup link is named by its lockup, then "home", not by an aria-label');
    check(/<header data-oca-sticky="app-bar"/.test(html), 'the phone bar is a header landmark');
    const { Pagination } = require(join(here, '../dist/primitives.js'));
    const pages = renderToStaticMarkup(h(Pagination, { pageIndex: 0, pageSize: 10, total: 30, onPage: () => {} }));
    check(!/aria-label="Pages"/.test(pages), "Pagination's default name is not the sidebar's \"Pages\"");
}

if (failures) {
    console.error(`✗ shell: ${failures} failing`);
    process.exit(1);
}
console.log('✓ shell: a tab bar for pages with icons (More past five), sections as tabs, the rail; the drawer for the rest; lockup names and landmarks');
