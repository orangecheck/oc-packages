#!/usr/bin/env node
/*
 * What only a click or an effect shows, in a DOM (jsdom): a copy button puts
 * the exact bytes on the clipboard, a message's final newline included (a
 * wallet signs the bytes, and lock's binding statement ends in LF), toasts
 * take the page's mode from next-themes, a command runs on Enter, a prompt
 * asked twice refuses until the two match, a countdown says its seconds.
 * Run after `yarn build`.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
for (const f of ['components', 'primitives', 'chrome', 'mdx', 'code']) {
    if (!existsSync(join(here, `../dist/${f}.js`))) {
        console.error(`✗ dom: dist/${f}.js is missing; run yarn build first`);
        process.exit(1);
    }
}

const dom = new JSDOM('<!doctype html><html data-oc-app="ochk"><body></body></html>', { url: 'https://example.test/', pretendToBeVisual: true });
const { window } = dom;
const copied = [];
Object.defineProperty(window.navigator, 'clipboard', {
    value: { writeText: async (t) => void copied.push(t), readText: async () => copied.at(-1) ?? '' },
});
window.matchMedia ??= () => ({ matches: false, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} });
// jsdom does no layout: scrolling into view is a no-op.
window.Element.prototype.scrollIntoView ??= function scrollIntoView() {};
window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};
// Node has its own Event and CustomEvent; a DOM node only takes jsdom's (Radix dispatches CustomEvents).
for (const key of ['window', 'self', 'document', 'navigator', 'HTMLElement', 'HTMLInputElement', 'HTMLFormElement', 'Element', 'Node', 'Event', 'CustomEvent', 'KeyboardEvent', 'MouseEvent', 'FocusEvent', 'PointerEvent', 'NodeFilter', 'DocumentFragment', 'MutationObserver', 'ResizeObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'matchMedia']) {
    Object.defineProperty(globalThis, key, { value: key === 'window' || key === 'self' ? window : window[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
const { act, createElement: h } = require('react');
const { createRoot } = require('react-dom/client');
const { ThemeProvider } = require('next-themes');
const { toast } = require('sonner');
const C = require(join(here, '../dist/components.js'));
const P = require(join(here, '../dist/primitives.js'));
const Ch = require(join(here, '../dist/chrome.js'));
const { mdxComponents } = require(join(here, '../dist/mdx.js'));
const { rehypeCode } = require(join(here, '../dist/code.js'));

let failures = 0;
let checks = 0;
const check = (ok, msg) => {
    checks++;
    if (!ok) {
        console.error(`✗ dom: ${msg}`);
        failures++;
    }
};
const show = (b) => JSON.stringify(b);

async function mount(el) {
    const host = document.createElement('div');
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => root.render(el));
    return { host, unmount: () => act(async () => root.unmount()).then(() => host.remove()) };
}

async function copyFrom(host) {
    const button = host.querySelector('button[aria-label="Copy code"]');
    if (!button) return null;
    copied.length = 0;
    await act(async () => button.click());
    return copied[0] ?? null;
}

// SignMessage: the copy is the message the wallet signs, byte for byte, its final LF included.
{
    const message = 'oc-lock binding v3\naddress: bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t\nid: 86020d78db788237e9f0c1b2a3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a85eeb1c\n';
    const { host, unmount } = await mount(h(C.SignMessage, { address: 'bc1q9h7gaw6m5x7dqcz0l4s3n2u4kq8r0vjz5e3w7t', message, onSignature: () => {} }));
    const got = await copyFrom(host);
    check(got === message, `SignMessage: copied ${show(got?.slice(-12))}, not the message's exact bytes ${show(message.slice(-12))}`);
    await unmount();
}

// A fence highlighted at build time (rehypeCode → the MDX pre): the copy keeps the final newline.
{
    const source = '# Example charter v1 · canonical bytes\nversion: v1.0.0\n';
    const tree = {
        type: 'root',
        children: [{ type: 'element', tagName: 'pre', properties: {}, children: [{ type: 'element', tagName: 'code', properties: {}, children: [{ type: 'text', value: source }] }] }],
    };
    rehypeCode()(tree);
    const props = Object.fromEntries(Object.entries(tree.children[0].properties).map(([k, v]) => [k.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`), v]));
    const { host, unmount } = await mount(h(mdxComponents.pre, props));
    const got = await copyFrom(host);
    check(got === source, `mdx pre: copied ${show(got?.slice(-12))}, not the fence's exact bytes ${show(source.slice(-12))}`);
    await unmount();
}

// A shell transcript still copies its commands, not the prompts or output.
{
    const { host, unmount } = await mount(h(C.CodeBlock, { code: '$ npm install x\nadded 1 package\n', lang: 'bash' }));
    check((await copyFrom(host)) === 'npm install x', 'CodeBlock: a shell transcript copies more than its commands');
    await unmount();
}

// Toasts follow the page's mode, with nothing passed.
for (const mode of ['dark', 'light']) {
    const { host, unmount } = await mount(
        h(ThemeProvider, { attribute: 'class', defaultTheme: mode, enableSystem: false }, h(P.Toaster))
    );
    await act(async () => {
        toast('Saved');
        await new Promise((r) => setTimeout(r, 50));
    });
    const list = host.querySelector('[data-sonner-toaster]');
    check(list?.getAttribute('data-sonner-theme') === mode, `Toaster: ${mode} mode draws ${list?.getAttribute('data-sonner-theme') ?? 'no toaster'}`);
    await act(async () => toast.dismiss());
    await unmount();
}

// CommandDialog: a list before anything is typed, an action that runs on Enter, a place that is a link.
{
    let ran = 0;
    const onQuery = (q) => [
        { label: 'Recent', results: q ? [] : [{ id: 'e1', href: '/vault/e1', title: 'github.com', meta: 'Login' }] },
        { label: 'Actions', results: [{ id: 'lock', title: 'Lock the vault', run: () => ran++ }].filter((r) => !q || /lock/i.test(q)) },
    ];
    const { unmount } = await mount(h(C.CommandDialog, { onQuery, open: true, onOpenChange: () => {}, debounceMs: 0 }));
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    const options = [...document.querySelectorAll('[role="option"]')];
    check(options.length === 2 && options[0].tagName === 'A' && options[1].tagName === 'DIV', `CommandDialog: browsing lists ${options.length} (want a link and an action)`);
    const input = document.querySelector('input[role="combobox"]');
    const key = (k) => act(async () => input.dispatchEvent(new window.KeyboardEvent('keydown', { key: k, bubbles: true })));
    await key('ArrowDown');
    await key('Enter');
    check(ran === 1, 'CommandDialog: Enter on an action does not run it');
    await unmount();
}

// prompt with confirmField: refuses until the two match, then answers.
{
    const { unmount } = await mount(h(P.DialogHost));
    let answer;
    await act(async () => {
        P.prompt({ title: 'Backup passphrase', label: 'Passphrase', secret: true, confirmField: true }).then((v) => (answer = v));
    });
    const fields = () => [...document.querySelectorAll('input[type="password"]')];
    const type = (el, v) =>
        act(async () => {
            const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
            set.call(el, v);
            el.dispatchEvent(new window.Event('input', { bubbles: true }));
        });
    const submit = () => act(async () => document.querySelector('form').requestSubmit());
    check(fields().length === 2, `prompt confirmField: ${fields().length} fields, not two`);
    await type(fields()[0], 'correct horse');
    await type(fields()[1], 'correct house');
    await submit();
    check(answer === undefined && document.body.textContent.includes('The two do not match.'), 'prompt confirmField: a mismatch is taken');
    await type(fields()[1], 'correct horse');
    await submit();
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    check(answer === 'correct horse', `prompt confirmField: answered ${show(answer)}`);
    await unmount();
}

// CountdownRing: the seconds left, read as a timer, red for the last few.
{
    const { host, unmount } = await mount(h(C.CountdownRing, { period: 30, remaining: 4 }));
    const t = host.querySelector('[role="timer"]');
    check(t?.getAttribute('aria-label') === '4 seconds left' && t.className.includes('text-destructive'), 'CountdownRing: 4s left is not red, or not said');
    await unmount();
    const clock = await mount(h(C.CountdownRing, { period: 30 }));
    const left = Number(clock.host.querySelector('[role="timer"]')?.getAttribute('aria-label')?.split(' ')[0]);
    const expect = 30 - (Math.floor(Date.now() / 1000) % 30);
    check(Math.abs(left - expect) <= 1, `CountdownRing: from the clock it says ${left}s, the TOTP window has ${expect}s`);
    await clock.unmount();
}

// Panel: full screen draws the body again, bigger; Escape brings it back.
{
    const { host, unmount } = await mount(
        h(C.Panel, { title: 'Price', expandable: true }, (expanded) => h('p', { 'data-size': expanded ? 'big' : 'small' }, 'chart'))
    );
    await act(async () => host.querySelector('button[aria-label="Open full screen"]').click());
    const dialog = document.querySelector('[role="dialog"]');
    check(dialog?.querySelector('[data-size="big"]') && dialog.textContent.includes('Price'), 'Panel: full screen does not draw the body expanded');
    await act(async () => document.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    check(!document.querySelector('[role="dialog"]'), 'Panel: Escape does not close full screen');
    await unmount();
}

// SourceNote: the button opens the source, named and linked.
{
    const { host, unmount } = await mount(h(C.SourceNote, { source: 'Bitnodes', href: 'https://bitnodes.io', detail: 'GET /api/v1/snapshots/latest/' }));
    await act(async () => {
        const b = host.querySelector('button');
        b.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, button: 0 }));
        b.click();
    });
    const pop = document.querySelector('[role="dialog"]');
    check(pop?.querySelector('a[href="https://bitnodes.io"]') && pop.textContent.includes('/api/v1/snapshots/latest/'), 'SourceNote: the popover does not name and link the source');
    await unmount();
}

// ChoiceGroup: a press chooses a card; the arrow keys move the choice, as radios do.
{
    const chosen = [];
    function Pick() {
        const [v, setV] = require('react').useState('a');
        return h(
            C.ChoiceGroup,
            { label: 'Who can post', value: v, onValueChange: (x) => (chosen.push(x), setV(x)) },
            ...['a', 'b', 'c'].map((x) => h(C.ChoiceCard, { key: x, value: x, title: x.toUpperCase() }))
        );
    }
    const { host, unmount } = await mount(h(Pick));
    const radios = () => [...host.querySelectorAll('[role="radio"]')];
    await act(async () => radios()[1].click());
    check(chosen.at(-1) === 'b' && radios()[1].getAttribute('aria-checked') === 'true' && radios()[0].getAttribute('aria-checked') === 'false', `ChoiceGroup: a press does not choose (${show(chosen)})`);
    await act(async () => {
        radios()[1].focus();
        radios()[1].dispatchEvent(new window.KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
        // Radix moves focus on a timer, then checks the radio it lands on.
        await new Promise((r) => setTimeout(r, 30));
    });
    check(document.activeElement === radios()[2] && chosen.at(-1) === 'c', `ChoiceGroup: ArrowDown does not move the choice (${show(chosen)})`);
    await unmount();
}

// ChoiceGroup error: the group names its error, by id, and is marked invalid; without one, neither.
{
    const group = (error) => h(C.ChoiceGroup, { label: 'Posture', value: 'a', onValueChange: () => {}, error }, h(C.ChoiceCard, { value: 'a', title: 'A' }), h(C.ChoiceCard, { value: 'b', title: 'B' }));
    const { host, unmount } = await mount(group('Choose forming or bounded test.'));
    const g = host.querySelector('[role="radiogroup"]');
    const said = (g.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    check(said === 'Choose forming or bounded test.' && g.getAttribute('aria-invalid') === 'true', `ChoiceGroup: the group reads ${show(said)}, invalid ${g.getAttribute('aria-invalid')}`);
    await unmount();
    const ok = await mount(group(undefined));
    const g2 = ok.host.querySelector('[role="radiogroup"]');
    check(!g2.hasAttribute('aria-describedby') && !g2.hasAttribute('aria-invalid') && !ok.host.querySelector('[role="alert"]'), 'ChoiceGroup: a group with no error is described or marked invalid');
    await ok.unmount();
}

// Avatar: a picture that fails to load gives way to the initials.
{
    const { host, unmount } = await mount(h(C.Avatar, { seed: 'bc1q', name: 'Hal Finney', src: 'https://invalid.example/hal.png' }));
    check(host.querySelector('img'), 'Avatar: the picture is not tried first');
    await act(async () => host.querySelector('img').dispatchEvent(new window.Event('error')));
    check(!host.querySelector('img') && host.textContent === 'HF', `Avatar: a failed picture does not fall back to the initials (${host.innerHTML.slice(0, 60)})`);
    await unmount();
}

// ListRow: the row is the button; its actions are not part of it.
{
    let opened = 0;
    let acted = 0;
    const { host, unmount } = await mount(
        h('ul', null, h(C.ListRow, { title: 'Ada', onSelect: () => opened++, actions: h('button', { type: 'button', 'data-act': '', onClick: () => acted++ }, 'More') }))
    );
    await act(async () => host.querySelector('li button:not([data-act])').click());
    await act(async () => host.querySelector('[data-act]').click());
    check(opened === 1 && acted === 1, `ListRow: a press on the row or its actions reached the wrong one (row ${opened}, actions ${acted})`);
    await unmount();
}

// CopyButton: a refused clipboard is said, and handed to the page.
{
    const write = navigator.clipboard.writeText;
    navigator.clipboard.writeText = async () => {
        throw new window.DOMException('Write permission denied.', 'NotAllowedError');
    };
    const errors = [];
    const { host, unmount } = await mount(h(C.CopyButton, { value: 'x', onError: (e) => errors.push(e?.name) }));
    await act(async () => host.querySelector('button').click());
    navigator.clipboard.writeText = write;
    await act(() => new Promise((r) => setTimeout(r, 150)));
    const said = document.getElementById('oca-announcer')?.textContent;
    check(errors.join() === 'NotAllowedError' && said === 'Could not copy', `CopyButton: a refused copy is not reported (${errors.join()}, said ${show(said)})`);
    await unmount();
}

// CopyButton: every button speaks through the page's one polite region, there before the first press; the same words twice are said twice.
{
    const { host, unmount } = await mount(h('div', null, ...['a', 'b', 'c'].map((v) => h(C.CopyButton, { key: v, value: v, label: `Copy ${v}` }))));
    const regions = [...document.querySelectorAll('[aria-live]')];
    const region = document.getElementById('oca-announcer');
    check(regions.length === 1 && region && regions[0] === region && region.getAttribute('aria-live') === 'polite' && !host.contains(region), `CopyButton: ${regions.length} live regions for three buttons, not the page's one (${show(regions.map((r) => r.id || r.outerHTML.slice(0, 40)))})`);
    const press = async (i) => {
        await act(async () => host.querySelectorAll('button')[i].click());
        const now = region?.textContent;
        await act(() => new Promise((r) => setTimeout(r, 150)));
        return [now, region?.textContent];
    };
    const first = await press(0);
    const again = await press(1);
    check(first[1] === 'Copied' && again[0] === '' && again[1] === 'Copied', `CopyButton: the region read ${show(first)} then ${show(again)}, not "Copied" twice with a gap between`);
    await unmount();
    check(document.querySelectorAll('[aria-live]').length === 1, 'CopyButton: the region went with a button, or another was added');
}

// A dialog's and a sheet's dimmed layer take a class: a page with its own layers can set its z-index.
{
    for (const [Root, Content] of [
        [P.Dialog, P.DialogContent],
        [P.Sheet, P.SheetContent],
    ]) {
        const { unmount } = await mount(h(Root, { open: true }, h(Content, { overlayClassName: 'z-[60]', 'aria-describedby': undefined }, h(P.DialogTitle, null, 'Layers'))));
        const overlay = [...document.querySelectorAll('[data-state="open"]')].find((el) => el.getAttribute('role') !== 'dialog' && /fixed/.test(el.className));
        check(overlay?.className.includes('z-[60]'), `${Content.displayName ?? 'Content'}: overlayClassName did not reach the overlay`);
        await unmount();
    }
}

// SiteFooter: two links to one address are two links, not a clash React drops.
{
    const said = [];
    const error = console.error;
    console.error = (...a) => said.push(a.join(' '));
    const twice = [{ heading: 'Use it', links: [{ href: '/signin', label: 'Sign in' }, { href: '/signin', label: 'Get an account' }] }];
    const { host, unmount } = await mount(h(Ch.SiteFooter, { columns: twice, legal: [{ href: '/terms', label: 'Terms' }, { href: '/terms', label: 'Terms of use' }] }));
    console.error = error;
    check(!said.some((m) => /same key/.test(m)), `SiteFooter: links keyed by address clash (${said.find((m) => /same key/.test(m))?.slice(0, 80)})`);
    // The phone's folded groups and the desk's columns each hold both.
    check(host.querySelectorAll('details a[href="/signin"]').length === 2 && host.querySelectorAll('a[href="/signin"]').length === 4 && host.querySelectorAll('a[href="/terms"]').length === 2, 'SiteFooter: a link to a shared address went missing');
    await unmount();
}

// FilterChips: a press on a disabled chip chooses nothing.
{
    const chosen = [];
    const { host, unmount } = await mount(
        h(C.FilterChips, { label: 'State', value: 'all', onChange: (v) => chosen.push(v), options: [{ value: 'all', label: 'All' }, { value: 'held', label: 'Held', disabled: true }, { value: 'kept', label: 'Kept' }] })
    );
    const [, held, kept] = host.querySelectorAll('button');
    await act(async () => held.click());
    await act(async () => kept.click());
    check(chosen.join() === 'kept', `FilterChips: a disabled chip was chosen (${show(chosen)})`);
    await unmount();
}

// CopyButton showLabel: the words on the button, then "Copied", the exact text on the clipboard.
{
    const { host, unmount } = await mount(h(C.CopyButton, { value: '{"v":1}', label: 'Copy signed JSON', showLabel: true }));
    const b = host.querySelector('button');
    const before = b.textContent;
    copied.length = 0;
    await act(async () => b.click());
    check(before.includes('Copy signed JSON') && b.textContent.includes('Copied') && copied[0] === '{"v":1}', `CopyButton showLabel: read ${show(before)} then ${show(b.textContent)}, copied ${show(copied[0])}`);
    await unmount();
}

// hotkeyBlocked: a page shortcut stays out of fields, open layers and other modifiers; a mod shortcut does not.
{
    const host = document.createElement('div');
    host.innerHTML =
        '<button data-k="plain">x</button><input data-k="text"><input type="checkbox" data-k="box"><textarea data-k="area"></textarea>' +
        '<div role="textbox" tabindex="0" data-k="role"></div><div role="menu"><button data-k="menu">m</button></div>' +
        '<div role="dialog"><button data-k="dialog">d</button></div><div data-radix-popper-content-wrapper=""><button data-k="popper">p</button></div>' +
        '<button data-k="handled">h</button>';
    document.body.append(host);
    host.querySelector('[data-k="handled"]').addEventListener('keydown', (e) => e.preventDefault());
    const blocked = (k, init = {}, opts = {}) => {
        let out;
        const read = (e) => (out = P.hotkeyBlocked(e, opts));
        window.addEventListener('keydown', read);
        const el = k === 'body' ? document.body : host.querySelector(`[data-k="${k}"]`);
        el.dispatchEvent(new window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true, ...init }));
        window.removeEventListener('keydown', read);
        return out;
    };
    const cases = [
        ['a plain button', 'plain', {}, {}, false],
        ['a text field', 'text', {}, {}, true],
        ['a checkbox', 'box', {}, {}, false],
        ['a textarea', 'area', {}, {}, true],
        ['a role=textbox', 'role', {}, {}, true],
        ['an open menu', 'menu', {}, {}, true],
        ['an open dialog', 'dialog', {}, {}, true],
        ['a popover', 'popper', {}, {}, true],
        ['a handled key', 'handled', {}, {}, true],
        ['composing', 'plain', { isComposing: true }, {}, true],
        ['Ctrl held', 'plain', { ctrlKey: true }, {}, true],
        ['Shift held ("?")', 'plain', { shiftKey: true }, {}, false],
        ['⌘K in a field', 'text', { metaKey: true }, { mod: true }, false],
        ['⌘K in a dialog', 'dialog', { ctrlKey: true }, { mod: true }, false],
        ['a mod shortcut without ⌘ or Ctrl', 'plain', {}, { mod: true }, true],
        ['a mod shortcut with Alt', 'plain', { ctrlKey: true, altKey: true }, { mod: true }, true],
        ['the page, nothing open', 'body', {}, {}, false],
    ];
    for (const [what, k, init, opts, want] of cases) check(blocked(k, init, opts) === want, `hotkeyBlocked: ${what} gives ${!want}`);
    const modal = document.createElement('div');
    modal.setAttribute('role', 'dialog');
    modal.setAttribute('aria-modal', 'true');
    document.body.append(modal);
    check(blocked('body') === true, 'hotkeyBlocked: focus on the page under an open modal still runs the shortcut');
    modal.remove();
    host.remove();
}

// useHotkey: runs on its key from the page, prevents the default, not from a menu; SearchDialog's "/" waits for an open menu.
{
    let ran = 0;
    function Keys() {
        P.useHotkey('/', () => ran++);
        return h('div', null, h('button', { 'data-k': 'page' }, 'page'), h('div', { role: 'menu' }, h('button', { 'data-k': 'item' }, 'item')));
    }
    const { host, unmount } = await mount(h(Keys));
    const press = (k) => {
        const e = new window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true });
        host.querySelector(`[data-k="${k}"]`).dispatchEvent(e);
        return e.defaultPrevented;
    };
    const prevented = press('page');
    press('item');
    check(ran === 1 && prevented, `useHotkey: "/" ran ${ran} time(s) (want once, from the page only), default prevented ${prevented}`);
    await unmount();

    const search = await mount(h('div', null, h(C.SearchDialog, { onQuery: () => [] }), h('div', { role: 'menu' }, h('button', { 'data-k': 'item' }, 'item')), h('button', { 'data-k': 'page' }, 'page')));
    const open = () => Boolean(document.querySelector('[role="dialog"] input'));
    await act(async () => search.host.querySelector('[data-k="item"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })));
    const overMenu = open();
    await act(async () => search.host.querySelector('[data-k="page"]').dispatchEvent(new window.KeyboardEvent('keydown', { key: '/', bubbles: true, cancelable: true })));
    check(!overMenu && open(), `SearchDialog: "/" opened search over an open menu (${overMenu}), or not from the page (${open()})`);
    await search.unmount();
}

// useRefusals: a refused submit says so on its fields, marks them, puts the cursor on the first; typing clears it.
{
    function Form() {
        const { errors, control, refuse } = P.useRefusals();
        return h(
            'form',
            { onSubmit: (e) => (e.preventDefault(), refuse({ name: 'Add a name.', domain: 'Add the domain.', note: false })) },
            h(P.Field, { label: 'Name', error: errors.name }, h(P.Input, { 'data-k': 'name', ...control('name') })),
            h(P.Field, { label: 'Domain', error: errors.domain }, h(P.Input, { 'data-k': 'domain', ...control('domain') })),
            h('button', { type: 'submit' }, 'Next')
        );
    }
    const f = await mount(h(Form));
    const field = (k) => f.host.querySelector(`[data-k="${k}"]`);
    const said = (el) => (el.getAttribute('aria-describedby') ?? '').split(' ').map((id) => document.getElementById(id)?.textContent ?? '').join(' ');
    await act(async () => f.host.querySelector('form').requestSubmit());
    check(field('name').getAttribute('aria-invalid') === 'true' && said(field('name')).includes('Add a name.') && said(field('domain')).includes('Add the domain.'), `useRefusals: the fields read ${show(said(field('name')))} and ${show(said(field('domain')))}`);
    check(document.activeElement === field('name'), `useRefusals: the cursor is on ${show(document.activeElement?.dataset?.k)}, not the first refused field`);
    await act(async () => field('name').dispatchEvent(new window.Event('input', { bubbles: true })));
    check(field('name').getAttribute('aria-invalid') === null && field('domain').getAttribute('aria-invalid') === 'true', 'useRefusals: typing in a field clears its message, and only its message');
    await f.unmount();
}

// LoadError: the failure as a danger notice; Try again calls back, and with no callback there is no button.
{
    let tries = 0;
    const l = await mount(h(C.LoadError, { title: 'Webhooks did not load.', onRetry: () => tries++ }, 'The server could not read them.'));
    const note = l.host.querySelector('[role="alert"]');
    check(note?.textContent.includes('Webhooks did not load.') && note?.textContent.includes('The server could not read them.'), `LoadError: the notice reads ${show(note?.textContent)}`);
    const retry = [...l.host.querySelectorAll('button')].find((b) => b.textContent === 'Try again');
    await act(async () => retry?.click());
    check(tries === 1, `LoadError: Try again called back ${tries} times`);
    await l.unmount();
    const bare = await mount(h(C.LoadError, null, 'Trying again in a minute.'));
    check(bare.host.querySelectorAll('button').length === 0 && bare.host.textContent.includes('This did not load.'), 'LoadError: with no callback, no button and the default title');
    await bare.unmount();
}

if (failures) {
    console.error(`\n${failures} dom failure(s)`);
    process.exit(1);
}
console.log(`✓ dom: ${checks} checks; exact copies, toasts in the mode, commands, a twice-typed prompt, a countdown, full screen, a source, a choice, a footer's shared address, an avatar's fallback, a row and its actions, a refused copy, one live region for every copy, a group's error, an overlay's class, a disabled chip, a labelled copy, page shortcuts kept out of fields and layers, refusals on their fields, a failed read`);
process.exit(0);
