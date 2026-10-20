#!/usr/bin/env node
/*
 * What only a click or an effect shows, in a DOM (jsdom): a copy button puts
 * the exact bytes on the clipboard, a message's final newline included (a
 * wallet signs the bytes, and lock's binding statement ends in LF), and
 * toasts take the page's mode from next-themes. Run after `yarn build`.
 */
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { JSDOM } from 'jsdom';

const here = dirname(fileURLToPath(import.meta.url));
for (const f of ['components', 'primitives', 'mdx', 'code']) {
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
window.ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
};
for (const key of ['window', 'document', 'navigator', 'HTMLElement', 'Node', 'MutationObserver', 'ResizeObserver', 'getComputedStyle', 'requestAnimationFrame', 'cancelAnimationFrame', 'localStorage', 'matchMedia']) {
    Object.defineProperty(globalThis, key, { value: key === 'window' ? window : window[key], configurable: true, writable: true });
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const require = createRequire(import.meta.url);
const { act, createElement: h } = require('react');
const { createRoot } = require('react-dom/client');
const { ThemeProvider } = require('next-themes');
const { toast } = require('sonner');
const C = require(join(here, '../dist/components.js'));
const P = require(join(here, '../dist/primitives.js'));
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

if (failures) {
    console.error(`\n${failures} dom failure(s)`);
    process.exit(1);
}
console.log(`✓ dom: ${checks} checks; copies are exact bytes, toasts follow the mode`);
process.exit(0);
