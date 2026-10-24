/**
 * @vitest-environment node
 *
 * A sign-in link from the provider on a server-rendered page. The server has
 * no page address, so its HTML links the bare sign-in; the browser's first
 * render must say the same, or React keeps the server's href on the link it
 * hydrates and the person never comes back. The page is added once the
 * browser knows it, and follows the page when it moves.
 */
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { JSDOM } from 'jsdom';
import { afterAll, describe, expect, it, vi } from 'vitest';

import { OcSessionProvider, useOcSession } from '../provider';

const PAGE = 'https://stamp.ochk.io/verify?id=abc';

function SignInLink() {
    return <a href={useOcSession().signInUrl}>Sign in</a>;
}
const tree = () => (
    <OcSessionProvider>
        <SignInLink />
    </OcSessionProvider>
);

const returningTo = (page: string) =>
    `https://ochk.io/signin?return_to=${encodeURIComponent(page)}`;

const keep: Record<string, unknown> = {};
afterAll(() => {
    for (const [k, v] of Object.entries(keep))
        Object.defineProperty(globalThis, k, { value: v, configurable: true, writable: true });
});

describe('OcSessionProvider on a server-rendered page', () => {
    it('hydrates to a sign-in link that returns to the page, and follows it', async () => {
        // The server: no window.
        expect(typeof window).toBe('undefined');
        const html = renderToString(tree());
        expect(html).toContain('href="https://ochk.io/signin"');

        // The browser, with that HTML.
        const dom = new JSDOM(`<!doctype html><div id="root">${html}</div>`, { url: PAGE });
        const g = globalThis as Record<string, unknown>;
        for (const k of ['window', 'document', 'navigator', 'IS_REACT_ACT_ENVIRONMENT', 'fetch'])
            keep[k] = g[k];
        g.window = dom.window;
        g.document = dom.window.document;
        Object.defineProperty(globalThis, 'navigator', { value: dom.window.navigator, configurable: true });
        g.IS_REACT_ACT_ENVIRONMENT = true;
        const signedOut = vi.fn(async () => new Response('{}', { status: 401 }));
        g.fetch = signedOut;
        dom.window.fetch = signedOut as unknown as typeof fetch;

        const { hydrateRoot } = await import('react-dom/client');
        const { act } = await import('react');
        const root = dom.window.document.getElementById('root')!;
        const link = () => root.querySelector('a')!.getAttribute('href');

        const errors: unknown[] = [];
        const onError = vi.spyOn(console, 'error').mockImplementation((...a) => void errors.push(a));
        let app!: ReturnType<typeof hydrateRoot>;
        await act(async () => {
            app = hydrateRoot(root, tree());
        });
        await act(async () => {});
        expect(link()).toBe(returningTo(PAGE));
        // React said nothing about a mismatch: the first render matched the server's.
        expect(errors.map(String).filter((e) => /did not match|hydrat/i.test(e))).toEqual([]);
        onError.mockRestore();

        // A router's move: the address changes, then the tree renders again.
        dom.window.history.pushState(null, '', '/verify?id=def#secret');
        await act(async () => {
            app.render(tree());
        });
        expect(link()).toBe(returningTo('https://stamp.ochk.io/verify?id=def'));

        // Back: the browser's popstate alone.
        dom.window.history.back();
        await act(async () => {
            await new Promise((r) => setTimeout(r, 20));
        });
        expect(link()).toBe(returningTo(PAGE));

        await act(async () => app.unmount());
    });
});
