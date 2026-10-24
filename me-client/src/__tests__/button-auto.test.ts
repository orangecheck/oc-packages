// @vitest-environment jsdom
/**
 * The tag-loaded button: it enhances every [data-oc-sign-in] on the page when
 * it runs, reads its options from the button, and reports through DOM events,
 * holding the busy state until the page's own work settles.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OUTCOME_COPY, SIGN_IN_BUSY_LABEL } from '../button';

const ACCOUNT = { id: 'acct-1', did_oc: 'did:oc:' + 'a'.repeat(32) };
let popup: { closed: boolean; focus(): void; close(): void } | null;

beforeEach(() => {
    vi.resetModules();
    popup = { closed: false, focus() {}, close() { this.closed = true; } };
    vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window);
});
afterEach(() => {
    vi.restoreAllMocks();
    document.body.replaceChildren();
});

function signIn() {
    window.dispatchEvent(
        new MessageEvent('message', { origin: 'https://me.ochk.io', source: popup as unknown as Window, data: { type: 'oc-signin-success', account: ACCOUNT, token: 'tok' } })
    );
}
const settle = () => new Promise((r) => setTimeout(r, 0));

describe('button-auto', () => {
    it('enhances every sign-in button on the page when it loads, once', async () => {
        document.body.innerHTML = `
            <button class="a" data-oc-sign-in><span data-oc-mark></span>Sign in with orangecheck</button>
            <button class="b" data-oc-sign-in data-mark="none">Se connecter avec orangecheck</button>
            <button class="c" data-oc-sign-in data-label="none" data-accessible-label="Mit orangecheck anmelden"><span data-oc-mark></span></button>
            <button class="d">Not ours</button>`;
        const { enhanceAll } = await import('../button-auto');
        const [a, b, c, d] = [...document.querySelectorAll('button')];
        expect(a!.querySelector('svg[data-oc-mark="mono"]')).not.toBeNull();
        expect(a!.textContent).toBe('Sign in with orangecheck');
        expect(b!.querySelector('svg')).toBeNull();
        expect(b!.textContent).toBe('Se connecter avec orangecheck');
        expect(c!.getAttribute('aria-label')).toBe('Mit orangecheck anmelden');
        expect(d!.hasAttribute('data-appearance')).toBe(false);
        expect(enhanceAll()).toBe(0);
        expect(a!.querySelectorAll('svg')).toHaveLength(1);
    });

    it('takes the appearance and the busy words from the button', async () => {
        document.body.innerHTML = '<button data-oc-sign-in data-appearance="brand" data-mark="brand" data-busy-label="Connexion…">Se connecter avec orangecheck</button>';
        await import('../button-auto');
        const b = document.querySelector('button')!;
        expect(b.getAttribute('data-appearance')).toBe('brand');
        expect(b.querySelector('svg')!.getAttribute('data-oc-mark')).toBe('brand');
        b.click();
        expect(b.textContent).toBe('Connexion…');
    });

    it('hands the token to the page in oc-signed-in and stays busy until the page is done', async () => {
        document.body.innerHTML = '<button data-oc-sign-in>Sign in with orangecheck</button>';
        await import('../button-auto');
        const b = document.querySelector('button')!;
        let finish!: () => void;
        const seen: unknown[] = [];
        document.addEventListener('oc-signed-in', (e) => {
            const detail = (e as CustomEvent).detail;
            seen.push({ account: detail.account, token: detail.token });
            detail.waitUntil(new Promise<void>((r) => (finish = r)));
        });
        b.click();
        expect(window.open).toHaveBeenCalledTimes(1);
        expect(b.textContent).toBe(SIGN_IN_BUSY_LABEL);
        signIn();
        await settle();
        expect(seen).toEqual([{ account: ACCOUNT, token: 'tok' }]);
        expect(b.getAttribute('aria-busy')).toBe('true');
        finish();
        await settle();
        expect(b.hasAttribute('aria-busy')).toBe(false);
    });

    it('says how the window ended, with the words to show', async () => {
        popup = null;
        document.body.innerHTML = '<button data-oc-sign-in>Sign in with orangecheck</button>';
        await import('../button-auto');
        const outcomes: unknown[] = [];
        document.addEventListener('oc-sign-in-outcome', (e) => outcomes.push((e as CustomEvent).detail));
        document.querySelector('button')!.click();
        await settle();
        expect(outcomes).toEqual([{ status: 'blocked', message: OUTCOME_COPY.blocked }]);
    });

    it('reports a button it cannot enhance, and enhances the rest', async () => {
        const error = vi.spyOn(console, 'error').mockImplementation(() => {});
        document.body.innerHTML = `
            <button data-oc-sign-in data-mark="sparkle">Sign in with orangecheck</button>
            <button data-oc-sign-in>Log in</button>
            <button data-oc-sign-in>Sign in with orangecheck</button>`;
        await import('../button-auto');
        const [bad, renamed, good] = [...document.querySelectorAll('button')];
        expect(error).toHaveBeenCalledTimes(1);
        expect(String(error.mock.calls[0]![0])).toMatch(/unknown mark sparkle/);
        expect(bad!.hasAttribute('data-appearance')).toBe(false);
        expect(renamed!.textContent).toBe('Sign in with orangecheck');
        expect(good!.querySelector('svg')).not.toBeNull();
    });
});
