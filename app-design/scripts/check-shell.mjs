#!/usr/bin/env node
/*
 * AppShell on a phone. A small app (two to five pages, each with an icon, no
 * sections) gets a tab bar under the thumb; everything else keeps the drawer.
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
    check(placeStrip(html).includes('max-md:hidden'), 'the active tab names the page, so phones drop the place strip');
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

// Everything else keeps today's drawer.
const drawer = [
    ['six pages', { nav: [{ items: items(6) }] }],
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

if (failures) {
    console.error(`✗ shell: ${failures} failing`);
    process.exit(1);
}
console.log('✓ shell: a tab bar for two to five pages on phones, the drawer for everything else');
