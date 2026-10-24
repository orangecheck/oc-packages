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

import { enhanceSignInButton, holdWidth, OUTCOME_COPY, SIGN_IN_BUSY_LABEL, SIGN_IN_LABELS } from '../button';
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

    it('takes the words in any language, as long as they say "orangecheck" as written', () => {
        for (const label of ['Se connecter avec orangecheck', 'Mit orangecheck anmelden', 'orangecheck でログイン', 'Continuar con orangecheck']) {
            const b = hostButton();
            enhanceSignInButton(b, { onSignedIn() {}, label });
            expect(b.textContent).toBe(label);
        }
        for (const label of ['Sign in with OC', 'Sign in with OrangeCheck', 'Sign in with ORANGECHECK', 'Sign in with orangecheckout', 'Log in']) {
            expect(() => enhanceSignInButton(hostButton(), { onSignedIn() {}, label }), label).toThrow(/must say "orangecheck"/);
        }
    });

    it("keeps the host's own words when they already say orangecheck", () => {
        const b = hostButton('<button class="btn">Mit orangecheck anmelden</button>');
        enhanceSignInButton(b, { onSignedIn() {} });
        expect(b.textContent).toBe('Mit orangecheck anmelden');
        const c = hostButton('<button class="btn">Log in</button>');
        enhanceSignInButton(c, { onSignedIn() {} });
        expect(c.textContent).toBe(SIGN_IN_LABELS.signIn);
    });

    it('refuses what it would otherwise get quietly wrong', () => {
        const b = hostButton();
        expect(() => enhanceSignInButton(b, { onSignedIn() {}, colour: 'red' } as never)).toThrow(/unknown option colour/);
        expect(() => enhanceSignInButton(b, {} as never)).toThrow(/onSignedIn is required/);
        expect(() => enhanceSignInButton(b, { onSignedIn() {}, label: false, mark: false })).toThrow(/needs the mark/);
        expect(() => enhanceSignInButton(b, { onSignedIn() {}, label: false, accessibleLabel: 'Sign in' })).toThrow(/must say "orangecheck"/);
        expect(() => enhanceSignInButton(b, { onSignedIn() {}, busyLabel: ' ' })).toThrow(/busyLabel/);
        expect(() => enhanceSignInButton(document.createElement('a') as never, { onSignedIn() {} })).toThrow(/<button>/);
    });

    it('draws the mark alone, square, still named for a screen reader', () => {
        const b = hostButton();
        enhanceSignInButton(b, { onSignedIn() {}, label: false });
        expect(b.getAttribute('data-label')).toBe('none');
        expect(b.getAttribute('aria-label')).toBe(SIGN_IN_LABELS.signIn);
        expect(b.textContent).toBe('');
        expect(b.children).toHaveLength(1);
        expect(b.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
        const c = hostButton('<button data-label="none"></button>');
        enhanceSignInButton(c, { onSignedIn() {}, accessibleLabel: 'Mit orangecheck anmelden' });
        expect(c.getAttribute('aria-label')).toBe('Mit orangecheck anmelden');
        expect(c.querySelector('[data-oc-label]')).toBeNull();
    });

    it('draws the mark where the placeholder was, in the variant it names', () => {
        const b = hostButton('<button class="btn"><span data-oc-mark="brand"></span>Sign in with orangecheck</button>');
        enhanceSignInButton(b, { onSignedIn() {} });
        expect(b.querySelectorAll('[data-oc-mark]')).toHaveLength(1);
        expect(b.firstElementChild!.tagName.toLowerCase()).toBe('svg');
        expect(b.firstElementChild!.getAttribute('data-oc-mark')).toBe('brand');
        expect(b.textContent).toBe('Sign in with orangecheck');
        const c = hostButton('<button><span data-oc-mark></span>Sign in with orangecheck</button>');
        enhanceSignInButton(c, { onSignedIn() {} });
        expect(c.firstElementChild!.getAttribute('data-oc-mark')).toBe('mono');
    });

    it('holds its width while it says it is busy, then lets go', async () => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 212.5 } as DOMRect);
        const b = hostButton('<button style="width: 50%">Sign in</button>');
        enhanceSignInButton(b, { onSignedIn() {}, busyLabel: 'Connexion…' });
        b.click();
        expect(b.style.width).toBe('212.5px');
        expect(b.style.minWidth).toBe('212.5px');
        expect(b.textContent).toBe('Connexion…');
        signIn();
        await settle();
        expect(b.style.width).toBe('50%');
        expect(b.style.minWidth).toBe('');
        expect(b.textContent).toBe(SIGN_IN_LABELS.signIn);
    });

    it('holds nothing it cannot measure', () => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 0 } as DOMRect);
        const b = hostButton();
        const release = holdWidth(b);
        expect(b.style.width).toBe('');
        release();
        expect(b.getAttribute('style')).toBe('border-radius:10px');
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
        const c = hostButton('<button aria-label="Go" data-label="x">Sign in</button>');
        enhanceSignInButton(c, { onSignedIn() {}, label: false })();
        expect(c.outerHTML).toBe('<button aria-label="Go" data-label="x">Sign in</button>');
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

    it('takes a translated label and refuses one without the name', () => {
        const host = render(<SignInWithOrangecheck label="Se connecter avec orangecheck" onSignedIn={() => {}} />);
        expect(host.querySelector('button')!.textContent).toBe('Se connecter avec orangecheck');
        act(() => root!.unmount());
        vi.spyOn(console, 'error').mockImplementation(() => {});
        expect(() => render(<SignInWithOrangecheck label="Login" onSignedIn={() => {}} />)).toThrow(/must say "orangecheck"/);
        root = null;
    });

    it('draws the mark alone with an accessible name', () => {
        const host = render(<SignInWithOrangecheck label={false} onSignedIn={() => {}} />);
        const b = host.querySelector('button')!;
        expect(b.getAttribute('aria-label')).toBe(SIGN_IN_LABELS.signIn);
        expect(b.getAttribute('data-label')).toBe('none');
        expect(b.textContent).toBe('');
    });

    it('holds its width while busy and says the busy words it is given', async () => {
        vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({ width: 180 } as DOMRect);
        const host = render(<SignInWithOrangecheck busyLabel="Connexion…" onSignedIn={() => {}} />);
        const b = host.querySelector('button')!;
        act(() => b.click());
        await settle();
        expect(b.style.width).toBe('180px');
        expect(b.textContent).toBe('Connexion…');
        signIn();
        await settle();
        expect(b.style.width).toBe('');
        expect(b.textContent).toBe(SIGN_IN_LABELS.signIn);
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

    const rule = (selector: string) => css.match(new RegExp(`(^|\\})\\s*${selector.replace(/[[\]()*.]/g, '\\$&')}\\s*\\{([^}]*)\\}`))?.[2] ?? '';

    it('keeps the words on one line and the mark at a fixed size before it paints', () => {
        expect(rule(':where([data-oc-sign-in])')).toMatch(/white-space:\s*nowrap/);
        const mark = rule(':where([data-oc-sign-in]) :where([data-oc-mark])');
        expect(mark).toMatch(/flex:\s*none/);
        expect(mark).toMatch(/inline-size:\s*var\(--oc-mark-size,\s*1\.75em\)/);
        expect(mark).toMatch(/aspect-ratio:\s*2\s*\/\s*1/);
        expect(rule(":where([data-oc-sign-in]) :where([data-oc-mark='tile'])")).toMatch(/aspect-ratio:\s*1\s*\/\s*1/);
    });

    it('gives the mark alone a square target of at least 44px', () => {
        const alone = rule(":where([data-oc-sign-in][data-label='none'])");
        expect(alone).toMatch(/min-inline-size:\s*var\(--oc-target,\s*44px\)/);
        expect(alone).toMatch(/padding-inline:\s*0/);
        expect(rule(':where([data-oc-sign-in])')).toMatch(/min-block-size:\s*var\(--oc-target,\s*44px\)/);
    });

    it('draws a focus ring only for the brand appearance; the host keeps its own', () => {
        const focus = selectors.filter((s) => s.includes(':focus'));
        expect(focus.length).toBeGreaterThan(0);
        for (const sel of focus) expect(sel).toContain("data-appearance='brand'");
    });

    it('falls back to one flat shape in the text colour, and system colours, when colours are forced', () => {
        const forced = css.slice(css.indexOf('@media (forced-colors: active)'));
        expect(forced.length).toBeLessThan(css.length);
        expect(forced).toMatch(/:where\(polygon\)\s*\{\s*fill:\s*currentColor;\s*fill-opacity:\s*1;/);
        expect(forced).toMatch(/:where\(rect\)\s*\{\s*fill:\s*transparent;/);
        expect(forced).toMatch(/outline-color:\s*Highlight/);
    });

    it('gives the inherit appearance no colour, font, border, radius or alignment', () => {
        const base = [...css.matchAll(/([^{}]+)\{([^}]*)\}/g)].filter(([, sel]) => !sel!.includes("data-appearance='brand'"));
        for (const [, sel, body] of base) {
            expect(body, sel).not.toMatch(/(^|[;\s])(color|background|font|border|border-radius|text-align)\s*:/);
            // Centring belongs to the brand button and to the mark alone in its square; a host's words stay where the host puts them.
            if (!sel!.includes("data-label='none'")) expect(body, sel).not.toMatch(/(^|[;\s])justify-content\s*:/);
        }
    });
});
