// @vitest-environment jsdom
/**
 * The sign-in button: the host's button keeps its classes and look, gains the
 * mark and an approved label, opens the popup inside the click (a window
 * opened after an await is blocked), stays focusable while busy, and says how
 * the popup ended.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { enhanceSignInButton, OUTCOME_COPY, SIGN_IN_BUSY_LABEL, SIGN_IN_LABELS } from '../button';
import { SignInWithOrangecheck } from '../react';

const ACCOUNT = { id: 'acct-1', did_oc: 'did:oc:' + 'a'.repeat(32) };
let popup: { closed: boolean; focus(): void; close(): void } | null;

beforeEach(() => {
    popup = { closed: false, focus() {}, close() { this.closed = true; } };
    vi.spyOn(window, 'open').mockImplementation(() => popup as unknown as Window);
});
let root: Root | null = null;
/** Mount into the document, as a page would. */
function render(el: React.ReactElement) {
    const host = document.createElement('div');
    document.body.append(host);
    root = createRoot(host);
    act(() => root!.render(el));
    return host;
}
afterEach(() => {
    if (root) act(() => root!.unmount());
    root = null;
    vi.restoreAllMocks();
    document.body.replaceChildren();
});

/** The popup answers as me.ochk.io does. */
function signIn() {
    window.dispatchEvent(
        new MessageEvent('message', { origin: 'https://me.ochk.io', source: popup as unknown as Window, data: { type: 'oc-signin-success', account: ACCOUNT, token: 'tok' } })
    );
}
const settle = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

function hostButton(html = '<button class="cta ghost" style="border-radius:10px">Sign in</button>') {
    document.body.innerHTML = html;
    return document.querySelector('button')!;
}

describe('enhanceSignInButton', () => {
    it("keeps the host's class and style, and brings the mark and the approved label", () => {
        const b = hostButton();
        enhanceSignInButton(b, { onSignedIn() {} });
        expect(b.className).toBe('cta ghost');
        expect(b.getAttribute('style')).toBe('border-radius:10px');
        expect(b.type).toBe('button');
        expect(b.getAttribute('data-appearance')).toBe('inherit');
        const svg = b.querySelector('svg[data-oc-mark="mono"]')!;
        expect(svg.getAttribute('aria-hidden')).toBe('true');
        expect([...svg.querySelectorAll('polygon')].every((p) => p.getAttribute('fill') === 'currentColor')).toBe(true);
        expect(b.textContent).toBe(SIGN_IN_LABELS.signIn);
        expect(b.getAttribute('style')).not.toMatch(/color|font|background/);
    });

    it('draws the mark asked for, or none', () => {
        const b = hostButton();
        enhanceSignInButton(b, { onSignedIn() {}, mark: 'tile', label: SIGN_IN_LABELS.continue });
        expect(b.querySelector('svg')!.getAttribute('data-oc-mark')).toBe('tile');
        expect(b.textContent).toBe('Continue with orangecheck');
        const c = hostButton();
        enhanceSignInButton(c, { onSignedIn() {}, mark: false });
        expect(c.querySelector('svg')).toBeNull();
    });

    it('refuses what it would otherwise get quietly wrong', () => {
        const b = hostButton();
        expect(() => enhanceSignInButton(b, { onSignedIn() {}, label: 'Sign in with OC' as never })).toThrow(/approved label/);
        expect(() => enhanceSignInButton(b, { onSignedIn() {}, colour: 'red' } as never)).toThrow(/unknown option colour/);
        expect(() => enhanceSignInButton(b, {} as never)).toThrow(/onSignedIn is required/);
        expect(() => enhanceSignInButton(document.createElement('a') as never, { onSignedIn() {} })).toThrow(/<button>/);
    });

    it('opens the popup inside the click, stays focusable while busy, and opens it once', async () => {
        const b = hostButton();
        const onSignedIn = vi.fn();
        enhanceSignInButton(b, { onSignedIn });
        b.focus();
        b.click();
        expect(window.open).toHaveBeenCalledTimes(1);
        expect(b.getAttribute('aria-busy')).toBe('true');
        expect(b.getAttribute('aria-disabled')).toBe('true');
        expect(b.disabled).toBe(false);
        expect(document.activeElement).toBe(b);
        expect(b.textContent).toBe(SIGN_IN_BUSY_LABEL);
        b.click();
        expect(window.open).toHaveBeenCalledTimes(1);
        signIn();
        await settle();
        expect(onSignedIn).toHaveBeenCalledWith({ account: ACCOUNT, token: 'tok' });
        expect(b.hasAttribute('aria-busy')).toBe(false);
        expect(b.textContent).toBe(SIGN_IN_LABELS.signIn);
    });

    it('says the window was blocked, and stays ready to try again', async () => {
        popup = null;
        const b = hostButton();
        const onSignedIn = vi.fn();
        const onOutcome = vi.fn();
        enhanceSignInButton(b, { onSignedIn, onOutcome });
        b.click();
        await settle();
        expect(onOutcome).toHaveBeenCalledWith({ status: 'blocked' });
        expect(onSignedIn).not.toHaveBeenCalled();
        expect(b.hasAttribute('aria-busy')).toBe(false);
        expect(OUTCOME_COPY.blocked).toMatch(/Allow pop-ups/);
    });

    it('stays busy until the site has used the token', async () => {
        const b = hostButton();
        let done!: () => void;
        enhanceSignInButton(b, { onSignedIn: () => new Promise<void>((r) => (done = r)) });
        b.click();
        signIn();
        await settle();
        expect(b.getAttribute('aria-busy')).toBe('true');
        done();
        await settle();
        expect(b.hasAttribute('aria-busy')).toBe(false);
    });

    it("never opens a window from a button the host disabled", () => {
        const b = hostButton('<button disabled>Sign in</button>');
        enhanceSignInButton(b, { onSignedIn() {} });
        b.click();
        expect(window.open).not.toHaveBeenCalled();
    });

    it('undoes itself', () => {
        const b = hostButton('<button class="x"><b>Sign in</b></button>');
        const undo = enhanceSignInButton(b, { onSignedIn() {} });
        undo();
        expect(b.outerHTML).toBe('<button class="x"><b>Sign in</b></button>');
        b.click();
        expect(window.open).not.toHaveBeenCalled();
    });
});

describe('SignInWithOrangecheck', () => {
    it("renders a native button in the host's class, with the mark and the label", () => {
        const host = render(<SignInWithOrangecheck className="btn btn-outline" onSignedIn={() => {}} />);
        const b = host.querySelector('button')!;
        expect(b.textContent).toBe('Sign in with orangecheck');
        expect(b.tagName).toBe('BUTTON');
        expect(b.getAttribute('type')).toBe('button');
        expect(b.className).toBe('btn btn-outline');
        expect(b.getAttribute('style')).toBeNull();
        expect(b.querySelector('svg[data-oc-mark="mono"]')).not.toBeNull();
    });

    it('opens the popup inside the click and hands over the token', async () => {
        const onSignedIn = vi.fn();
        const onOutcome = vi.fn();
        const host = render(<SignInWithOrangecheck onSignedIn={onSignedIn} onOutcome={onOutcome} appearance="brand" mark="brand" />);
        const b = host.querySelector('button')!;
        expect(b.getAttribute('data-appearance')).toBe('brand');
        act(() => b.click());
        expect(window.open).toHaveBeenCalledTimes(1);
        await settle();
        expect(b.getAttribute('aria-busy')).toBe('true');
        expect(b.textContent).toBe(SIGN_IN_BUSY_LABEL);
        act(() => b.click());
        expect(window.open).toHaveBeenCalledTimes(1);
        signIn();
        await settle();
        expect(onOutcome).toHaveBeenCalledWith(expect.objectContaining({ status: 'signed_in' }));
        expect(onSignedIn).toHaveBeenCalledWith({ account: ACCOUNT, token: 'tok' });
        expect(b.hasAttribute('aria-busy')).toBe(false);
    });

    it('refuses an unapproved label', () => {
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => render(<SignInWithOrangecheck label={'Login' as never} onSignedIn={() => {}} />)).toThrow(/approved label/);
        root = null;
    });
});

describe('button.css', () => {
    const css = readFileSync(join(__dirname, '..', 'button.css'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
    const selectors = [...css.matchAll(/([^{}]+)\{/g)].map((m) => m[1]!.trim()).filter((s) => !s.startsWith('@media'));

    it('wraps every selector in :where(), so a host rule always wins', () => {
        expect(selectors.length).toBeGreaterThan(5);
        for (const sel of selectors) {
            const outside = sel.replace(/:where\((?:[^()]|\([^()]*\))*\)/g, '');
            expect(sel.startsWith(':where('), sel).toBe(true);
            // At most one pseudo-class outside :where(): focus or hover, specificity 0,1,0.
            expect(outside.replace(/\s+/g, '')).toMatch(/^(:focus-visible|:hover)?$/);
        }
    });

    it('gives the inherit appearance no colour, font, border, radius or alignment', () => {
        const base = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, sel]) => !sel!.includes("data-appearance='brand'"));
        for (const [, sel, body] of base) expect(body, sel).not.toMatch(/(^|[;\s])(color|background|font|border|border-radius|justify-content|text-align)\s*:/);
    });
});
