/**
 * @vitest-environment jsdom
 */
import * as React from 'react';
import { act, render, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { OcSessionProvider } from '../provider';
import { useStepUpAuth, useWebAuthnList, useWebAuthnRegister } from '../webauthn';

vi.mock('@simplewebauthn/browser', () => ({
    startRegistration: vi.fn(),
    startAuthentication: vi.fn(),
}));

const simpleWa = await import('@simplewebauthn/browser');

interface FetchCall {
    url: string;
    init: RequestInit | undefined;
}

function setupFetch(handler: (call: FetchCall) => Response) {
    const calls: FetchCall[] = [];
    globalThis.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
        const call: FetchCall = { url: String(url), init };
        calls.push(call);
        return handler(call);
    }) as unknown as typeof fetch;
    return calls;
}

function jsonResponse(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { 'Content-Type': 'application/json' },
    });
}

function Wrapper({ children }: { children: React.ReactNode }) {
    return <OcSessionProvider>{children}</OcSessionProvider>;
}

const SAMPLE_REG_OPTIONS = {
    challenge: 'CHA',
    rp: { id: 'ochk.io', name: 'OrangeCheck' },
    user: { id: 'uid', name: 'did:oc:abc', displayName: 'did:oc:abc' },
    pubKeyCredParams: [],
};

const SAMPLE_ASSERT_OPTIONS = {
    challenge: 'CHB',
    rpId: 'ochk.io',
    allowCredentials: [{ id: 'cred-a', type: 'public-key' }],
};

const SAMPLE_CRED = {
    id: '11111111-1111-1111-1111-111111111111',
    label: 'Test Key',
    authenticator_type: 'platform' as const,
    transports: ['internal'],
    user_verified: true,
    created_at: new Date().toISOString(),
    last_used_at: null,
};

afterEach(() => {
    vi.clearAllMocks();
});

describe('useWebAuthnRegister', () => {
    it('runs the register ceremony end-to-end and surfaces the new credential', async () => {
        setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/me')) {
                return jsonResponse(
                    { account: { id: 'acc', did_oc: 'did:oc:abc' } },
                    200
                );
            }
            if (url.endsWith('/api/auth/webauthn/register/options')) {
                return jsonResponse({
                    ok: true,
                    options: SAMPLE_REG_OPTIONS,
                    challenge_token: 'tok',
                });
            }
            if (url.endsWith('/api/auth/webauthn/register/verify')) {
                return jsonResponse({ ok: true, credential: SAMPLE_CRED });
            }
            return jsonResponse({ ok: false }, 404);
        });
        vi.spyOn(simpleWa, 'startRegistration').mockResolvedValue({
            id: 'attestation-id',
            rawId: 'attestation-id',
            response: { clientDataJSON: 'x', attestationObject: 'y', transports: ['internal'] },
            authenticatorAttachment: 'platform',
            clientExtensionResults: {},
            type: 'public-key',
        } as unknown as Awaited<ReturnType<typeof simpleWa.startRegistration>>);

        let captured: ReturnType<typeof useWebAuthnRegister> | null = null;
        function Probe() {
            const r = useWebAuthnRegister();
            captured = r;
            return null;
        }
        render(
            <Wrapper>
                <Probe />
            </Wrapper>
        );

        let result: Awaited<ReturnType<NonNullable<typeof captured>['register']>> | null = null;
        await act(async () => {
            result = await captured!.register({ label: 'Test Key' });
        });
        expect(result).toEqual({ ok: true, credential: SAMPLE_CRED });
        expect(captured!.status).toBe('success');
        expect(captured!.error).toBeNull();
    });

    it('reports cancellation as a friendly error', async () => {
        setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/me')) {
                return jsonResponse({ account: { id: 'acc', did_oc: 'did:oc:abc' } }, 200);
            }
            if (url.endsWith('/api/auth/webauthn/register/options')) {
                return jsonResponse({
                    ok: true,
                    options: SAMPLE_REG_OPTIONS,
                    challenge_token: 'tok',
                });
            }
            return jsonResponse({ ok: false }, 404);
        });
        vi.spyOn(simpleWa, 'startRegistration').mockRejectedValue(
            new Error('NotAllowedError: user cancelled the request')
        );

        let captured: ReturnType<typeof useWebAuthnRegister> | null = null;
        function Probe() {
            captured = useWebAuthnRegister();
            return null;
        }
        render(
            <Wrapper>
                <Probe />
            </Wrapper>
        );
        await act(async () => {
            await captured!.register();
        });
        expect(captured!.status).toBe('error');
        expect(captured!.error?.message).toBe('cancelled');
    });

    it('propagates a session_too_old reason from the host', async () => {
        setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/me')) {
                return jsonResponse({ account: { id: 'acc', did_oc: 'did:oc:abc' } }, 200);
            }
            if (url.endsWith('/api/auth/webauthn/register/options')) {
                return jsonResponse({ ok: false, reason: 'session_too_old' }, 401);
            }
            return jsonResponse({ ok: false }, 404);
        });

        let captured: ReturnType<typeof useWebAuthnRegister> | null = null;
        function Probe() {
            captured = useWebAuthnRegister();
            return null;
        }
        render(
            <Wrapper>
                <Probe />
            </Wrapper>
        );
        await act(async () => {
            await captured!.register();
        });
        expect(captured!.status).toBe('error');
        expect(captured!.error?.message).toBe('session_too_old');
    });
});

describe('useWebAuthnList', () => {
    it('fetches credentials on mount when authenticated', async () => {
        setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/me')) {
                return jsonResponse({ account: { id: 'acc', did_oc: 'did:oc:abc' } }, 200);
            }
            if (url.endsWith('/api/auth/webauthn/credentials')) {
                return jsonResponse({ ok: true, credentials: [SAMPLE_CRED] });
            }
            return jsonResponse({ ok: false }, 404);
        });
        let captured: ReturnType<typeof useWebAuthnList> | null = null;
        function Probe() {
            captured = useWebAuthnList();
            return null;
        }
        render(
            <Wrapper>
                <Probe />
            </Wrapper>
        );
        // Wait until the second refetch (after the session resolves to
        // 'authenticated') has populated credentials. The first refetch
        // runs at sessionStatus='loading' and short-circuits to ready+[].
        await waitFor(() => expect(captured?.credentials.length).toBe(1));
        expect(captured!.credentials).toEqual([SAMPLE_CRED]);
        expect(captured!.status).toBe('ready');
    });

    it('returns an empty list when the user is anonymous', async () => {
        setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/me')) {
                return jsonResponse({ ok: false, reason: 'not_authenticated' }, 401);
            }
            if (url.endsWith('/api/auth/webauthn/credentials')) {
                return jsonResponse({ ok: false }, 401);
            }
            return jsonResponse({ ok: false }, 404);
        });
        let captured: ReturnType<typeof useWebAuthnList> | null = null;
        function Probe() {
            captured = useWebAuthnList();
            return null;
        }
        render(
            <Wrapper>
                <Probe />
            </Wrapper>
        );
        await waitFor(() => expect(captured?.status).toBe('ready'));
        expect(captured!.credentials).toEqual([]);
    });
});

describe('useStepUpAuth', () => {
    it('runs the assert ceremony, surfaces step_up_at, and refreshes the session', async () => {
        let refreshCalls = 0;
        setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/me')) {
                refreshCalls += 1;
                return jsonResponse({ account: { id: 'acc', did_oc: 'did:oc:abc' } }, 200);
            }
            if (url.endsWith('/api/auth/webauthn/assertion/options')) {
                return jsonResponse({
                    ok: true,
                    options: SAMPLE_ASSERT_OPTIONS,
                    challenge_token: 'tok',
                });
            }
            if (url.endsWith('/api/auth/webauthn/assertion/verify')) {
                return jsonResponse({ ok: true, step_up_at: 17143200 });
            }
            return jsonResponse({ ok: false }, 404);
        });
        vi.spyOn(simpleWa, 'startAuthentication').mockResolvedValue({
            id: 'cred-a',
            rawId: 'cred-a',
            response: {
                clientDataJSON: 'x',
                authenticatorData: 'y',
                signature: 'z',
            },
            authenticatorAttachment: 'platform',
            clientExtensionResults: {},
            type: 'public-key',
        } as unknown as Awaited<ReturnType<typeof simpleWa.startAuthentication>>);

        let captured: ReturnType<typeof useStepUpAuth> | null = null;
        function Probe() {
            captured = useStepUpAuth();
            return null;
        }
        render(
            <Wrapper>
                <Probe />
            </Wrapper>
        );
        // wait for initial provider /api/auth/me
        await waitFor(() => expect(refreshCalls).toBeGreaterThanOrEqual(1));
        const before = refreshCalls;
        let result: Awaited<ReturnType<NonNullable<typeof captured>['stepUp']>> | null = null;
        await act(async () => {
            result = await captured!.stepUp({ purpose: 'spend_over_1m' });
        });
        expect(result).toEqual({ ok: true, step_up_at: 17143200 });
        expect(captured!.status).toBe('success');
        // stepUp internally refreshes the session.
        expect(refreshCalls).toBeGreaterThan(before);
    });

    it('reports no_credentials_registered when the host has nothing to challenge', async () => {
        setupFetch(({ url }) => {
            if (url.endsWith('/api/auth/me')) {
                return jsonResponse({ account: { id: 'acc', did_oc: 'did:oc:abc' } }, 200);
            }
            if (url.endsWith('/api/auth/webauthn/assertion/options')) {
                return jsonResponse({ ok: false, reason: 'no_credentials_registered' }, 409);
            }
            return jsonResponse({ ok: false }, 404);
        });
        let captured: ReturnType<typeof useStepUpAuth> | null = null;
        function Probe() {
            captured = useStepUpAuth();
            return null;
        }
        render(
            <Wrapper>
                <Probe />
            </Wrapper>
        );
        await act(async () => {
            await captured!.stepUp({ purpose: 'spend_over_1m' });
        });
        expect(captured!.status).toBe('error');
        expect(captured!.error?.message).toBe('no_credentials_registered');
    });
});
