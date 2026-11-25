import { createHash, createHmac, generateKeyPairSync, randomBytes, sign } from 'node:crypto';

import { scope, verifyActivityAttestation, webhook } from '@orangecheck/me-client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { me, sent } from '../src/me';

/**
 * Plan §2, me-client 0.64.0: an integrator reading the email account through me.ochk.io gets no
 * bitcoin_address from scope.granted or a delivered webhook, and verifyActivityAttestation
 * accepts a bundle minted for it. Every answer is what me.ochk.io sent (src/me.ts); signatures
 * are made here with a key for the run, and the recorded times move to now.
 */

const ME = 'https://me.ochk.io';
const DID = sent.popup.other.did_oc as string;
const EMAIL = sent.scopes_session.scopes.email;
const SECRET = randomBytes(24).toString('hex');

/** An Ed25519 key, as a JWK under `kid`, and a signer over bytes. */
function runKey(kid: string) {
    const { publicKey, privateKey } = generateKeyPairSync('ed25519');
    const jwk = { ...publicKey.export({ format: 'jwk' }), kid, alg: 'EdDSA', use: 'sig' } as const;
    const sigHex = (bytes: Uint8Array) => sign(null, bytes, privateKey).toString('hex');
    return { jwk, sigHex };
}

afterEach(() => {
    vi.unstubAllGlobals();
});

describe('me-client 0.64.0 scope.granted', () => {
    const route = `${ME}/api/integrator/scopes/${encodeURIComponent(me.project_key)}`;

    /** me.ochk.io's two answers: by session, and to a signed backend question about DID. */
    function serve() {
        const seen: string[] = [];
        vi.stubGlobal('fetch', async (input: RequestInfo | URL, init?: RequestInit) => {
            const url = new URL(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
            seen.push(url.href);
            if (`${url.origin}${url.pathname}` !== route) throw new Error(`unexpected fetch ${url.href}`);
            if (!url.search) return Response.json(sent.scopes_session);
            const header = new Headers(init?.headers).get('x-oc-signature') ?? '';
            const [, t, v1] = /^t=(\d+),v1=([0-9a-f]{64})$/.exec(header) ?? [];
            const mac = createHmac('sha256', SECRET)
                .update(`${t}.project_key=${me.project_key}&user=${DID}`)
                .digest('hex');
            if (url.searchParams.get('user') !== DID || v1 !== mac) {
                return Response.json({ ok: false, error: 'project_auth_required' }, { status: 401 });
            }
            return Response.json(sent.scopes_backend);
        });
        return seen;
    }

    it('answers the session read with email and no bitcoin_address', async () => {
        const seen = serve();
        const r = await scope.granted({ project_key: me.project_key });
        expect(seen).toEqual([route]);
        expect(r.scopes_granted).toEqual(expect.arrayContaining(['bitcoin_address', 'email']));
        expect(r.scopes).toEqual({ email: EMAIL });
        expect(r.sub).toBe(sent.scopes_session.sub);
    });

    it('answers the signed backend read the same', async () => {
        const seen = serve();
        const r = await scope.granted({ project_key: me.project_key, accountId: DID, signingSecret: SECRET });
        expect(seen).toEqual([`${route}?user=${encodeURIComponent(DID)}`]);
        expect(r.scopes).toEqual({ email: EMAIL });
        expect(r).toEqual({
            sub: sent.scopes_session.sub,
            scopes_granted: sent.scopes_session.scopes_granted,
            scopes: { email: EMAIL },
        });
    });
});

describe('me-client 0.64.0 webhook.verify', () => {
    it('verifies the delivery, whose scopes carry email and no bitcoin_address', async () => {
        const key = runKey(sent.webhook.kid);
        const recorded = JSON.parse(sent.webhook.body) as { issued_at: string };
        const body = sent.webhook.body.replace(
            `"issued_at":"${recorded.issued_at}"`,
            `"issued_at":"${new Date().toISOString()}"`
        );
        expect(body).not.toBe(sent.webhook.body);
        const bytes = new TextEncoder().encode(body);

        const r = await webhook.verify(body, key.sigHex(bytes), sent.webhook.kid, {
            jwk: key.jwk,
            project: me.project_key,
        });
        expect(r).toMatchObject({ ok: true, project_key: me.project_key });
        const delivered = JSON.parse(body) as Record<string, unknown>;
        expect(delivered.kind).toBe('oc-billable-event');
        expect(delivered.scopes).toEqual({ email: EMAIL });
    });
});

describe('me-client 0.64.0 verifyActivityAttestation', () => {
    it('accepts a bundle minted for the account now', async () => {
        const a = sent.attestation;
        const text = Buffer.from(a.canonical_b64, 'base64').toString('utf8');
        const signed = JSON.parse(text) as Record<string, unknown> & { computed_at: string; expires_at: string };
        // Serialising the parsed bytes again gives the same bytes, so re-timing changes only the times.
        expect(JSON.stringify(signed)).toBe(text);
        const life = Date.parse(signed.expires_at) - Date.parse(signed.computed_at);
        const now = Date.now();
        const fresh = {
            ...signed,
            computed_at: new Date(now).toISOString(),
            expires_at: new Date(now + life).toISOString(),
        };
        const bytes = new TextEncoder().encode(JSON.stringify(fresh));
        const id = createHash('sha256').update(bytes).digest('hex');
        const key = runKey(a.kid);

        const r = await verifyActivityAttestation(
            {
                sig: key.sigHex(bytes),
                kid: a.kid,
                canonical_b64: Buffer.from(bytes).toString('base64'),
                attestation: { id, ...fresh },
            } as Parameters<typeof verifyActivityAttestation>[0],
            { jwk: key.jwk }
        );
        expect(r.ok, JSON.stringify(r)).toBe(true);
        expect(r.ok && r.attestation).toMatchObject({ did_oc: DID, kind: 'oc-me-activity' });
    });
});
