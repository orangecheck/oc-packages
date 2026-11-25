// @vitest-environment jsdom
import { generateKeyPairSync, sign } from 'node:crypto';

import * as current from '@orangecheck/auth-client';
import { act, renderHook } from '@testing-library/react';
import * as older from 'auth-client-2.51.0';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { keyed, PASSKEY_CREDENTIAL_ID, plain } from '../src/account';

/**
 * Plan §2, auth-client 2.52.0 and 2.51.0: a site's passkey settings add a passkey for the account
 * as before. useWebAuthnRegister returns no binding, and never asks the site's wallet to sign one.
 * ochk.io's answers are recorded (fixtures/email-account.json); navigator.credentials stands in
 * for the authenticator.
 */

const AUTH = 'https://ochk.io';
type Account = typeof plain;
const b64u = (s: string) => Buffer.from(s).toString('base64url');
const bytes = (s: string) => new Uint8Array(Buffer.from(s, 'base64url')).buffer;
const runKey = generateKeyPairSync('ed25519').privateKey;

/**
 * The challenge token as ochk.io signs it, from the recorded header and claims, starting now, with
 * a key made for the run (node:crypto, since jose refuses jsdom's byte arrays).
 */
function challengeToken(header: Record<string, unknown>, claims: Record<string, unknown>) {
    const now = Math.floor(Date.now() / 1000);
    const life = (claims.exp as number) - (claims.iat as number);
    const input = [header, { ...claims, iat: now, exp: now + life }]
        .map((part) => b64u(JSON.stringify(part)))
        .join('.');
    return `${input}.${sign(null, Buffer.from(input), runKey).toString('base64url')}`;
}

/** ochk.io's two register answers for `account`; each verify request must carry options' token. */
function serve(account: Account) {
    const asked: string[] = [];
    const { options, challenge_token_header, challenge_token_claims, verify } = account.webauthn_register;
    const token = challengeToken(challenge_token_header, challenge_token_claims);
    vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
        asked.push(url.pathname);
        if (url.origin === AUTH && url.pathname === '/api/auth/webauthn/register/options') {
            return Response.json({ ...options, challenge_token: token });
        }
        if (url.origin === AUTH && url.pathname === '/api/auth/webauthn/register/verify') {
            const body = JSON.parse(String(init?.body)) as { challenge_token?: string; response?: { id?: string } };
            if (body.challenge_token !== token || body.response?.id !== PASSKEY_CREDENTIAL_ID) {
                return Response.json({ ok: false, reason: 'invalid_challenge' }, { status: 400 });
            }
            return Response.json(verify);
        }
        return Response.json({ ok: false }, { status: 404 });
    });
    return asked;
}

/** An authenticator that signs the challenge it was given into clientDataJSON. */
function authenticator() {
    const created: Array<{ challenge: string; user: string }> = [];
    vi.stubGlobal('PublicKeyCredential', function PublicKeyCredential() {});
    Object.defineProperty(navigator, 'credentials', {
        configurable: true,
        value: {
            create: async (opts: { publicKey: { challenge: ArrayBuffer; user: { name: string } } }) => {
                const challenge = Buffer.from(opts.publicKey.challenge).toString('base64url');
                created.push({ challenge, user: opts.publicKey.user.name });
                return {
                    id: PASSKEY_CREDENTIAL_ID,
                    rawId: bytes(PASSKEY_CREDENTIAL_ID),
                    type: 'public-key',
                    authenticatorAttachment: 'platform',
                    response: {
                        clientDataJSON: bytes(b64u(JSON.stringify({ type: 'webauthn.create', challenge, origin: AUTH }))),
                        attestationObject: bytes(b64u('attestation')),
                        getTransports: () => ['internal', 'hybrid'],
                    },
                    getClientExtensionResults: () => ({ credProps: { rk: true } }),
                };
            },
        },
    });
    return created;
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe.each([
    ['2.52.0', current.useWebAuthnRegister],
    ['2.51.0', older.useWebAuthnRegister],
])('auth-client %s useWebAuthnRegister', (_version, useWebAuthnRegister) => {
    async function register(account: Account, bind?: (statement: string, address: string) => Promise<string>) {
        const asked = serve(account);
        const created = authenticator();
        const { result } = renderHook(() => useWebAuthnRegister());
        let out: Record<string, unknown> | undefined;
        await act(async () => {
            out = (await result.current.register({ label: 'compat key', ...(bind ? { bind } : {}) } as never)) as never;
        });
        return { out: out!, asked, created };
    }

    it('adds the passkey and returns no binding, as for the account without its key', async () => {
        const before = await register(plain);
        const after = await register(keyed);
        expect(before.asked).toEqual(['/api/auth/webauthn/register/options', '/api/auth/webauthn/register/verify']);
        const options = plain.webauthn_register.options.options as { challenge: string; user: { name: string } };
        expect(before.created).toEqual([{ challenge: options.challenge, user: options.user.name }]);
        expect(before.out).toEqual({ ok: true, credential: plain.webauthn_register.verify.credential });
        expect(after.out).toEqual(before.out);
        expect(after.out).not.toHaveProperty('binding');
    });

    it("never asks the site's wallet to sign for the new passkey", async () => {
        const signed: string[] = [];
        const r = await register(keyed, async (statement, address) => {
            signed.push(address);
            return `signed:${statement.length}`;
        });
        expect(r.out).toMatchObject({ ok: true });
        expect(r.out).not.toHaveProperty('binding');
        expect(signed).toEqual([]);
        expect(r.asked).not.toContain('/api/auth/webauthn/bind');
    });
});
