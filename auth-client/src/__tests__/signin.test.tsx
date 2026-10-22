/**
 * @vitest-environment jsdom
 *
 * OcSignIn is the front door of every ochk.io site. These pin what a person
 * sees when something goes wrong: a sentence and a next step, never a reason
 * code, and a way to finish on a device with no wallet extension.
 */
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import * as React from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('@orangecheck/wallet-adapter', () => ({
    detectWallets: () => [{ id: 'manual', name: 'Manual', detected: true }],
    getSigner: () => async () => 'unused',
}));

import { inputStyle as linkedInputStyle, LinkPromptStep } from '../linked-identities';
import { humanSigninError, looksLikeBitcoinAddress, OcSignIn } from '../signin';

type Route = (url: string, init?: RequestInit) => { status?: number; body: unknown } | undefined;

function stubFetch(route: Route) {
    const calls: string[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        calls.push(String(url));
        const hit = route(String(url), init) ?? { status: 404, body: {} };
        return new Response(JSON.stringify(hit.body), { status: hit.status ?? 200 });
    }) as unknown as typeof fetch;
    return calls;
}

const ADDR = 'bc1qmr7qn2t0ahj56ztpdswt54kn2r863ukd8wadj8';

afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
});

describe('humanSigninError', () => {
    it('turns a host reason into a sentence', () => {
        expect(humanSigninError('bad_request', 'wallet')).toMatch(/Bitcoin address/);
        expect(humanSigninError('wrong_code', 'email')).toMatch(/code isn't right/);
    });

    it('reads "expired" in the context of the path', () => {
        expect(humanSigninError('expired', 'email')).toMatch(/Send a new one/);
        expect(humanSigninError('expired', 'wallet')).toMatch(/fresh one/);
    });

    it('never echoes an unknown code', () => {
        expect(humanSigninError('verify_failed_401', 'wallet')).not.toMatch(/_/);
    });

    it('passes a sentence through', () => {
        expect(humanSigninError('Your session ended.', 'wallet')).toBe('Your session ended.');
    });
});

describe('looksLikeBitcoinAddress', () => {
    it('accepts the address shapes a wallet hands out', () => {
        expect(looksLikeBitcoinAddress(ADDR)).toBe(true);
        expect(looksLikeBitcoinAddress('3J98t1WpEZ73CNmQviecrnyiWrnqRhWNLy')).toBe(true);
        expect(looksLikeBitcoinAddress('1BvBMSEYstWetqTFn5Au4m4GFg7xJaNVN2')).toBe(true);
    });

    it('rejects what is not one', () => {
        expect(looksLikeBitcoinAddress('hello')).toBe(false);
        expect(looksLikeBitcoinAddress('BC1Q' + ADDR.slice(4))).toBe(false);
        expect(looksLikeBitcoinAddress('not-a-real-address-at-all')).toBe(false);
    });
});

describe('OcSignIn · wallet path', () => {
    const SIG = 'AkcwRAIgXk3o9vTq0b1c2d3e4f5g6h7i8j9kAiBvOvnMEzFhPq';

    function openWalletTab(signin: { status: number; body: unknown }) {
        const posts: Array<Record<string, unknown>> = [];
        stubFetch((url, init) => {
            if (url.endsWith('/api/auth/providers')) return { body: { providers: [] } };
            if (url.includes('/api/challenge'))
                return { body: { message: 'sign this', nonce: 'n1' } };
            if (url.endsWith('/api/auth/signin')) {
                posts.push(JSON.parse(String(init?.body)));
                return signin;
            }
            return undefined;
        });
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} />);
        fireEvent.click(screen.getByRole('tab', { name: 'Bitcoin wallet' }));
        return posts;
    }

    async function pasteSignature(sig: string) {
        await act(async () => {});
        fireEvent.change(screen.getByLabelText('Bitcoin address'), { target: { value: ADDR } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Get the message to sign/ }));
        });
        expect(screen.getByLabelText('Message to sign')).toHaveProperty('value', 'sign this');
        fireEvent.change(screen.getByLabelText('Signature'), { target: { value: sig } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Sign me in/ }));
        });
    }

    it('fetches the challenge for the canonical spelling of an address scanned in capitals', async () => {
        // A QR code carries bech32 in capitals; only the lowercase spelling verifies.
        const canonical = 'bc1q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l';
        openWalletTab({ status: 401, body: { ok: false, reason: 'sig_invalid' } });
        await act(async () => {});
        const field = screen.getByLabelText('Bitcoin address');
        fireEvent.change(field, { target: { value: canonical.toUpperCase() } });
        expect(field).toHaveProperty('value', canonical);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Get the message to sign/ }));
        });
        const fetched = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
        const challenge = fetched.map((c) => String(c[0])).find((u) => u.includes('/api/challenge'));
        expect(challenge).toContain(`addr=${canonical}&`);
    });

    it('leaves mixed case as typed, and refuses it without fetching', async () => {
        openWalletTab({ status: 401, body: { ok: false, reason: 'sig_invalid' } });
        await act(async () => {});
        const mixed = 'BC1Q9vza2e8x573nczrlzms0wvx3gsqjx7vavgkx0l';
        fireEvent.change(screen.getByLabelText('Bitcoin address'), { target: { value: mixed } });
        expect(screen.getByLabelText('Bitcoin address')).toHaveProperty('value', mixed);
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Get the message to sign/ }));
        });
        expect(screen.getByRole('alert').textContent).toMatch(/doesn't look like a Bitcoin address/);
        const fetched = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
        expect(fetched.some((c) => String(c[0]).includes('/api/challenge'))).toBe(false);
    });

    it('refuses a typo without fetching a challenge', async () => {
        openWalletTab({ status: 401, body: { ok: false, reason: 'sig_invalid' } });
        fireEvent.change(screen.getByLabelText('Bitcoin address'), { target: { value: 'hello' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Get the message to sign|Sign in with wallet/ }));
        });
        expect(screen.getByRole('alert').textContent).toMatch(/doesn't look like a Bitcoin address/);
        const fetched = (globalThis.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls;
        expect(fetched.some((c) => String(c[0]).includes('/api/challenge'))).toBe(false);
    });

    it('with no browser wallet, takes a pasted signature and names no scheme', async () => {
        const posts = openWalletTab({ status: 401, body: { ok: false, reason: 'sig_invalid' } });
        await pasteSignature(SIG);
        // No scheme: a pasted signature may be legacy BIP-137; the host decides from its bytes.
        expect(posts).toEqual([
            {
                message: 'sign this',
                signature: SIG,
                expectedNonce: 'n1',
                expectedAudience: 'https://ochk.io',
                expectedPurpose: 'login',
            },
        ]);
        expect(screen.getByRole('alert').textContent).toMatch(/doesn't match this address/);
        expect(screen.queryByText(/sig_invalid/)).toBeNull();
    });

    it('a malformed paste is about the signature, not the address', async () => {
        openWalletTab({ status: 400, body: { error: 'bad_request' } });
        await pasteSignature('AkcwRAIg');
        expect(screen.getByRole('alert').textContent).toMatch(/signature couldn't be read/);
    });
});

describe('OcSignIn · email path', () => {
    it('shows a sentence, not the reason code, and can send a new code', async () => {
        stubFetch((url) => {
            if (url.endsWith('/api/auth/providers')) return { body: { providers: [] } };
            if (url.endsWith('/email-otp/start')) return { body: { ok: true, token: 't1' } };
            if (url.endsWith('/email-otp/verify'))
                return { status: 401, body: { ok: false, reason: 'expired' } };
            return undefined;
        });
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} />);
        fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), {
            target: { value: 'a@example.com' },
        });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Send one-time code/ }));
        });
        fireEvent.change(screen.getByLabelText('One-time code'), { target: { value: '123456' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Verify/ }));
        });
        expect(screen.getByRole('alert').textContent).toBe('That code expired. Send a new one.');
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: 'Send a new code' }));
        });
        expect(screen.getByText(/Sent a new code to/)).toBeTruthy();
    });
});

describe('OcSignIn · network failure', () => {
    function unreachable() {
        globalThis.fetch = vi.fn(async (url: RequestInfo | URL) => {
            if (String(url).endsWith('/api/auth/providers')) {
                return new Response(JSON.stringify({ providers: [] }));
            }
            throw new TypeError('Failed to fetch');
        }) as unknown as typeof fetch;
    }

    async function sendCode() {
        fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'a@example.com' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Send one-time code/ }));
        });
    }

    it('names the sign-in service it could not reach instead of printing "Failed to fetch"', async () => {
        unreachable();
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} />);
        await sendCode();
        expect(screen.getByRole('alert').textContent).toBe(
            "We couldn't reach the orangecheck sign-in service at ochk.io. Check your connection, then try again."
        );
        expect(screen.queryByText(/Failed to fetch/)).toBeNull();
    });

    it('takes the host from the auth origin it was given', async () => {
        unreachable();
        render(
            <OcSignIn
                audience="https://ochk.io"
                authOrigin="https://auth.staging.example:8443"
                linkPrompt={false}
            />
        );
        await sendCode();
        expect(screen.getByRole('alert').textContent).toMatch(
            /sign-in service at auth\.staging\.example:8443\./
        );
    });
});

describe('OcSignIn · method tabs by keyboard', () => {
    function renderTabs(props: Partial<React.ComponentProps<typeof OcSignIn>> = {}) {
        stubFetch((url) => (url.endsWith('/api/auth/providers') ? { body: { providers: [] } } : undefined));
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} {...props} />);
        const list = screen.getByRole('tablist', { name: 'Sign-in method' });
        const tab = (name: string) => screen.getByRole('tab', { name });
        return { list, tab };
    }

    it('is one Tab stop: only the selected tab is in the Tab order', () => {
        const { tab } = renderTabs();
        expect(tab('Email').tabIndex).toBe(0);
        expect(tab('Bitcoin wallet').tabIndex).toBe(-1);
    });

    it('arrows move to the other method, select it and keep focus on it, wrapping at the ends', () => {
        const { tab } = renderTabs();
        tab('Email').focus();
        fireEvent.keyDown(tab('Email'), { key: 'ArrowRight' });
        expect(tab('Bitcoin wallet').getAttribute('aria-selected')).toBe('true');
        expect(document.activeElement).toBe(tab('Bitcoin wallet'));
        expect(tab('Bitcoin wallet').tabIndex).toBe(0);
        expect(screen.getByLabelText('Bitcoin address')).toBeTruthy();

        fireEvent.keyDown(tab('Bitcoin wallet'), { key: 'ArrowRight' });
        expect(document.activeElement).toBe(tab('Email'));
        expect(screen.getByRole('textbox', { name: 'Email' })).toBeTruthy();

        fireEvent.keyDown(tab('Email'), { key: 'ArrowLeft' });
        expect(document.activeElement).toBe(tab('Bitcoin wallet'));
    });

    it('Home and End go to the first and last method', () => {
        const { tab } = renderTabs({ providersFirst: false });
        tab('Bitcoin wallet').focus();
        fireEvent.keyDown(tab('Bitcoin wallet'), { key: 'End' });
        expect(document.activeElement).toBe(tab('Email'));
        expect(tab('Email').getAttribute('aria-selected')).toBe('true');
        fireEvent.keyDown(tab('Email'), { key: 'Home' });
        expect(document.activeElement).toBe(tab('Bitcoin wallet'));
    });

    it('a click still switches method, and the panel is named by the selected tab', () => {
        const { tab } = renderTabs();
        fireEvent.click(tab('Bitcoin wallet'));
        const panel = screen.getByRole('tabpanel');
        expect(tab('Bitcoin wallet').getAttribute('aria-controls')).toBe(panel.id);
        expect(panel.getAttribute('aria-labelledby')).toBe(tab('Bitcoin wallet').id);
    });
});

describe('OcSignIn · fields show the page focus ring', () => {
    it('no field turns the outline off inline', () => {
        stubFetch((url) => (url.endsWith('/api/auth/providers') ? { body: { providers: [] } } : undefined));
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} />);
        const fields = () => [...document.querySelectorAll<HTMLElement>('[data-oc-signin] input, [data-oc-signin] textarea')];
        const email = fields();
        fireEvent.click(screen.getByRole('tab', { name: 'Bitcoin wallet' }));
        const wallet = fields();
        expect(email.length + wallet.length).toBeGreaterThan(1);
        for (const f of [...email, ...wallet]) {
            expect(f.getAttribute('style') ?? '').not.toMatch(/outline\s*:\s*none/);
        }
    });

    it('every text field wears the family field focus (data-oca-field), through each step', async () => {
        stubFetch((url) => {
            if (url.endsWith('/api/auth/providers')) return { body: { providers: [] } };
            if (url.includes('/api/challenge')) return { body: { message: 'sign this', nonce: 'n1' } };
            if (url.endsWith('/api/auth/email-otp/start')) return { body: { ok: true, token: 't'.repeat(48) } };
            return undefined;
        });
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} />);
        const seen = new Set<string>();
        const check = () => {
            const fields = [
                ...document.querySelectorAll<HTMLElement>(
                    '[data-oc-signin] input:not([type=checkbox]):not([type=radio]), [data-oc-signin] textarea'
                ),
            ];
            for (const f of fields) {
                seen.add(f.id);
                expect(f.hasAttribute('data-oca-field'), `${f.tagName} #${f.id}`).toBe(true);
            }
        };
        check();
        fireEvent.change(screen.getByRole('textbox', { name: 'Email' }), { target: { value: 'a@example.com' } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Send one-time code/ }));
        });
        check();
        render(<OcSignIn audience="https://ochk.io" linkPrompt={false} initialPath="wallet" />);
        await act(async () => {});
        check();
        fireEvent.change(screen.getByLabelText('Bitcoin address'), { target: { value: ADDR } });
        await act(async () => {
            fireEvent.click(screen.getByRole('button', { name: /Get the message to sign/ }));
        });
        check();
        // Email, the code, the address, the message to sign and the signature.
        expect(seen.size).toBeGreaterThanOrEqual(5);
    });

    it('the link step that follows sign-in wears it too', () => {
        stubFetch(() => undefined);
        for (const method of ['email', 'btc'] as const) {
            const { unmount } = render(
                <LinkPromptStep method={method} didOc="did:oc:x" authOrigin="https://ochk.io" onResolved={() => {}} />
            );
            const fields = [...document.querySelectorAll<HTMLElement>('[data-oc-linkprompt] input, [data-oc-linkprompt] textarea')];
            expect(fields.length).toBeGreaterThan(0);
            for (const f of fields) expect(f.hasAttribute('data-oca-field')).toBe(true);
            unmount();
        }
    });

    it('the shared field style used by linked identities does not either', () => {
        expect(linkedInputStyle.outline).toBeUndefined();
        expect(linkedInputStyle.outlineStyle).toBeUndefined();
    });
});
