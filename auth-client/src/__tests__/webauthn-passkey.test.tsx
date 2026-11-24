/**
 * @vitest-environment jsdom
 *
 * A new passkey can sign in only once the account's wallet has signed for it:
 * useWebAuthnRegister({ bind }) signs the statement ochk.io hands back, and
 * only a statement about the key this device just made. usePasskeySignIn
 * signs in with such a key.
 */
import * as React from 'react';
import { act, cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { OcSessionProvider } from '../provider';
import { usePasskeySignIn, useWebAuthnRegister } from '../webauthn';

vi.mock('@simplewebauthn/browser', () => ({
    startRegistration: vi.fn(),
    startAuthentication: vi.fn(),
    WebAuthnAbortService: { cancelCeremony: vi.fn() },
}));

const simpleWa = await import('@simplewebauthn/browser');

const CRED_ID = 'q83vEjRWeJCrze8SNFZ4kA';
const ADDR = 'bc1qar0srrr7xfkvy5l643lydnw9re59gtzzwf5mdq';
const statementFor = (credentialId: string) =>
    'oc-passkey:bind:v1\n' +
    `address: ${ADDR}\n` +
    'account: did:oc:0123456789abcdef0123456789abcdef\n' +
    'rp_id: ochk.io\n' +
    `credential_id: ${credentialId}\n` +
    'credential_key: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855\n' +
    'nonce: 00112233445566778899aabbccddeeff\n' +
    'created_at: 2026-11-23T11:00:00Z\n';
const STATEMENT = statementFor(CRED_ID);
const SAMPLE_CRED = {
    id: '11111111-1111-1111-1111-111111111111',
    label: 'Phone',
    authenticator_type: 'platform' as const,
    transports: ['internal'],
    user_verified: true,
    created_at: '2026-11-23T11:00:00Z',
    last_used_at: null,
};
const ACCOUNT = { id: 'acc', did_oc: 'did:oc:abc' };

type Handler = (url: string, body: unknown) => { status?: number; body: unknown } | undefined;
function setupFetch(handler: Handler) {
    const calls: Array<{ url: string; body: unknown }> = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const u = String(url);
        const body = init?.body ? JSON.parse(String(init.body)) : null;
        calls.push({ url: u, body });
        const hit = (u.endsWith('/api/auth/me') ? { body: { account: ACCOUNT } } : undefined) ??
            handler(u, body) ?? { status: 404, body: { ok: false } };
        return new Response(JSON.stringify(hit.body), {
            status: hit.status ?? 200,
            headers: { 'Content-Type': 'application/json' },
        });
    }) as unknown as typeof fetch;
    return calls;
}

function registerRoutes(verify: Record<string, unknown>, bind?: { status?: number; body: unknown }): Handler {
    return (url) => {
        if (url.endsWith('/register/options'))
            return { body: { ok: true, options: { challenge: 'C' }, challenge_token: 'tok' } };
        if (url.endsWith('/register/verify')) return { body: { ok: true, credential: SAMPLE_CRED, ...verify } };
        if (url.endsWith('/api/auth/webauthn/bind')) return bind ?? { body: { ok: true } };
        return undefined;
    };
}

async function runRegister(args?: Parameters<ReturnType<typeof useWebAuthnRegister>['register']>[0]) {
    vi.mocked(simpleWa.startRegistration).mockResolvedValue({
        id: CRED_ID,
        rawId: CRED_ID,
        response: { clientDataJSON: 'x', attestationObject: 'y', transports: ['internal'] },
        clientExtensionResults: {},
        type: 'public-key',
    } as never);
    let captured: ReturnType<typeof useWebAuthnRegister> | null = null;
    function Probe() {
        captured = useWebAuthnRegister();
        return null;
    }
    render(
        <OcSessionProvider>
            <Probe />
        </OcSessionProvider>
    );
    let result: Awaited<ReturnType<ReturnType<typeof useWebAuthnRegister>['register']>> | null = null;
    await act(async () => {
        result = await captured!.register(args);
    });
    return result!;
}

const bindCalls = (calls: Array<{ url: string; body: unknown }>) => calls.filter((c) => c.url.endsWith('/api/auth/webauthn/bind'));

afterEach(() => {
    cleanup();
    vi.clearAllMocks();
});

describe('useWebAuthnRegister · bind', () => {
    it('has the wallet sign the statement, and posts the binding', async () => {
        const calls = setupFetch(registerRoutes({ binding_statement: STATEMENT }));
        const sign = vi.fn(async () => 'SIG');
        const result = await runRegister({ label: 'Phone', bind: sign });
        expect(sign).toHaveBeenCalledWith(STATEMENT, ADDR);
        expect(bindCalls(calls).map((c) => c.body)).toEqual([{ credential_id: CRED_ID, address: ADDR, signature: 'SIG' }]);
        expect(result).toEqual({ ok: true, credential: SAMPLE_CRED, binding: { ok: true } });
    });

    it('signs nothing for a statement about another key, and keeps the key for step-up', async () => {
        const calls = setupFetch(registerRoutes({ binding_statement: statementFor('ANOTHERkeyAAAAAAAAAAAA') }));
        const sign = vi.fn(async () => 'SIG');
        const result = await runRegister({ bind: sign });
        expect(sign).not.toHaveBeenCalled();
        expect(bindCalls(calls)).toEqual([]);
        expect(result).toEqual({
            ok: true,
            credential: SAMPLE_CRED,
            binding: { ok: false, reason: 'binding_statement_mismatch' },
        });
    });

    it.each([
        ['another format', STATEMENT.replace('oc-passkey:bind:v1', 'oc-passkey:bind:v2')],
        ['no final line break', STATEMENT.slice(0, -1)],
        ['an extra line', STATEMENT + 'extra: 1\n'],
        ['an address with a space', STATEMENT.replace(`address: ${ADDR}`, 'address: bc1q ar0s')],
    ])('signs nothing for a statement with %s', async (_why, statement) => {
        const calls = setupFetch(registerRoutes({ binding_statement: statement }));
        const sign = vi.fn(async () => 'SIG');
        const result = await runRegister({ bind: sign });
        expect(sign).not.toHaveBeenCalled();
        expect(bindCalls(calls)).toEqual([]);
        expect(result).toMatchObject({ ok: true, binding: { ok: false, reason: 'binding_statement_mismatch' } });
    });

    it('keeps the key when the person declines to sign', async () => {
        setupFetch(registerRoutes({ binding_statement: STATEMENT }));
        const result = await runRegister({ bind: async () => Promise.reject(new Error('User rejected')) });
        expect(result).toEqual({ ok: true, credential: SAMPLE_CRED, binding: { ok: false, reason: 'cancelled' } });
    });

    it.each([
        ['a decline by code', Object.assign(new Error('request failed'), { code: 4001 }), 'cancelled'],
        ['another address', Object.assign(new Error('signed by bc1qother'), { code: 'E_WRONG_ACCOUNT' }), 'wrong_account'],
        ['no such wallet', Object.assign(new Error('Leather is not installed'), { name: 'WalletNotFoundError' }), 'wallet_not_found'],
        ['no answer', new Error('Request timed out'), 'timed_out'],
        ['anything else', new Error('boom'), 'sign_failed'],
    ])('keeps the key and says why the wallet did not sign: %s', async (_why, err, reason) => {
        const calls = setupFetch(registerRoutes({ binding_statement: STATEMENT }));
        const result = await runRegister({ bind: async () => Promise.reject(err) });
        expect(bindCalls(calls)).toEqual([]);
        expect(result).toEqual({ ok: true, credential: SAMPLE_CRED, binding: { ok: false, reason } });
    });

    // The installed wallet-adapter may predate a failure kind, so these stand one in.
    it.each([
        ['a signature without its final line break', () => ({ walletFailure: () => 'trimmed' }), new Error('x'), 'signature_trimmed'],
        ['a kind it does not know', () => ({ walletFailure: () => 'something-new' }), new Error('x'), 'sign_failed'],
        ['a decline when wallet-adapter cannot load', () => { throw new Error('no module'); }, new Error('User cancelled'), 'cancelled'],
        ['anything else when wallet-adapter cannot load', () => { throw new Error('no module'); }, new Error('boom'), 'sign_failed'],
    ])('reads %s', async (_why, adapter, err, reason) => {
        vi.resetModules();
        vi.doMock('@orangecheck/wallet-adapter', adapter);
        try {
            setupFetch(registerRoutes({ binding_statement: STATEMENT }));
            const result = await runRegister({ bind: async () => Promise.reject(err) });
            expect(result).toEqual({ ok: true, credential: SAMPLE_CRED, binding: { ok: false, reason } });
        } finally {
            vi.doUnmock('@orangecheck/wallet-adapter');
            vi.resetModules();
        }
    });

    it('says why ochk.io refused the binding', async () => {
        setupFetch(registerRoutes({ binding_statement: STATEMENT }, { status: 400, body: { ok: false, reason: 'nonce_spent' } }));
        const result = await runRegister({ bind: async () => 'SIG' });
        expect(result).toMatchObject({ ok: true, binding: { ok: false, reason: 'nonce_spent' } });
    });

    it('without bind, signs nothing and says the key does not sign in', async () => {
        const calls = setupFetch(registerRoutes({ binding_statement: STATEMENT }));
        const result = await runRegister();
        expect(bindCalls(calls)).toEqual([]);
        expect(result).toEqual({ ok: true, credential: SAMPLE_CRED, binding: { ok: false, reason: 'not_bound' } });
    });

    it('with no statement offered, answers as before', async () => {
        const calls = setupFetch(registerRoutes({}));
        const sign = vi.fn(async () => 'SIG');
        expect(await runRegister({ bind: sign })).toEqual({ ok: true, credential: SAMPLE_CRED });
        expect(sign).not.toHaveBeenCalled();
        expect(bindCalls(calls)).toEqual([]);
    });
});

describe('usePasskeySignIn', () => {
    // The provider wraps window.fetch for its tab pin, so count the stub's own record:
    // its session read is the site's own /api/auth/me, once per refresh.
    const meReads = (calls: Array<{ url: string }>) => calls.filter((c) => c.url === '/api/auth/me').length;

    async function runSignIn(
        calls: Array<{ url: string }>,
        args?: Parameters<ReturnType<typeof usePasskeySignIn>['signIn']>[0]
    ) {
        let captured: ReturnType<typeof usePasskeySignIn> | null = null;
        function Probe() {
            captured = usePasskeySignIn();
            return null;
        }
        render(
            <OcSessionProvider>
                <Probe />
            </OcSessionProvider>
        );
        await act(async () => {});
        const readsBefore = meReads(calls);
        let result: Awaited<ReturnType<ReturnType<typeof usePasskeySignIn>['signIn']>> | null = null;
        await act(async () => {
            result = await captured!.signIn(args);
        });
        return { result: result!, hook: captured!, sessionReads: meReads(calls) - readsBefore };
    }

    const signInRoutes = (verify: { status?: number; body: unknown }): Handler => (url) => {
        if (url.endsWith('/api/auth/passkey/options'))
            return { body: { ok: true, options: { challenge: 'C', rpId: 'ochk.io' }, challenge_token: 'ct' } };
        if (url.endsWith('/api/auth/passkey/verify')) return verify;
        return undefined;
    };

    it('signs in, and reads the session again so the page sees who signed in', async () => {
        const calls = setupFetch(signInRoutes({ body: { ok: true, account: ACCOUNT, token: 'tok' } }));
        vi.mocked(simpleWa.startAuthentication).mockResolvedValue({ id: CRED_ID } as never);
        const { result, hook, sessionReads } = await runSignIn(calls);
        expect(result).toEqual({ ok: true, account: ACCOUNT, token: 'tok' });
        expect(calls.find((c) => c.url.endsWith('/passkey/options'))?.body).toEqual({ kind: 'signin' });
        expect(sessionReads).toBe(1);
        expect(hook.status).toBe('success');
    });

    it('resolves a refusal and never throws', async () => {
        const calls = setupFetch(signInRoutes({ status: 401, body: { ok: false, reason: 'passkey_not_recognised' } }));
        vi.mocked(simpleWa.startAuthentication).mockResolvedValue({ id: CRED_ID } as never);
        const { result, hook, sessionReads } = await runSignIn(calls, { kind: 'layer' });
        expect(result).toEqual({ ok: false, reason: 'passkey_not_recognised' });
        expect(hook.status).toBe('error');
        expect(sessionReads).toBe(0);
    });
});
